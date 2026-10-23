import fs from 'fs';
import axios from 'axios';
import initSqlJs from 'sql.js';
import { config } from '../config';

async function getAccessToken(): Promise<string> {
  const resp = await axios.get(
    'https://api.weixin.qq.com/cgi-bin/token',
    {
      params: {
        grant_type: 'client_credential',
        appid: config.wechat.appId,
        secret: config.wechat.appSecret,
      },
      timeout: 20000,
    }
  );

  if (!resp.data.access_token) {
    throw new Error(
      `获取微信 access_token 失败: ${resp.data.errcode} ${resp.data.errmsg}`
    );
  }

  return resp.data.access_token;
}

async function getFollowerOpenids(): Promise<string[]> {
  const accessToken = await getAccessToken();
  const resp = await axios.get(
    'https://api.weixin.qq.com/cgi-bin/user/get',
    {
      params: { access_token: accessToken },
      timeout: 20000,
    }
  );

  if (resp.data.errcode) {
    throw new Error(
      `获取微信粉丝列表失败: ${resp.data.errcode} ${resp.data.errmsg}`
    );
  }

  return Array.isArray(resp.data.data?.openid)
    ? resp.data.data.openid
    : [];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dbArgIndex = process.argv.indexOf('--db');
  const dbPath =
    dbArgIndex >= 0 ? process.argv[dbArgIndex + 1] : config.dbPath;

  if (!dbPath) {
    throw new Error('--db 必须指定数据库路径');
  }

  if (apply && process.env.RECONCILE_OFFLINE !== '1') {
    throw new Error(
      '写入数据库前必须先停止后端，并设置 RECONCILE_OFFLINE=1'
    );
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(`数据库不存在: ${dbPath}`);
  }

  const followers = await getFollowerOpenids();
  const defaultBlogger = config.defaultBlogger;
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const result = db.exec('SELECT openid FROM users');
  const existing = new Set<string>(
    (result[0]?.values || []).map((row) => String(row[0]))
  );

  const matched = followers.filter((openid) => existing.has(openid));
  const missing = followers.filter((openid) => !existing.has(openid));

  console.log(`微信粉丝: ${followers.length}`);
  console.log(`网站用户: ${existing.size}`);
  console.log(`粉丝已在数据库: ${matched.length}`);
  console.log(`粉丝尚未授权网站: ${missing.length}`);
  console.log(
    `将补充默认博主订阅: ${
      defaultBlogger.secUid ? missing.length : 0
    }`
  );

  if (!apply) {
    console.log('当前为只读检查，未修改数据库。');
    return;
  }

  if (missing.length === 0) {
    console.log('没有需要补充的用户。');
    return;
  }

  db.run('BEGIN');
  try {
    const insert = db.prepare(
      `INSERT INTO users (openid, nickname, avatar_url, subscribe_time)
       VALUES (?, '', '', datetime('now', 'localtime'))`
    );
    for (const openid of missing) {
      insert.run([openid]);
    }
    insert.free();

    if (defaultBlogger.secUid) {
      let bloggerResult = db.exec(
        'SELECT id FROM bloggers WHERE sec_uid = ?',
        [defaultBlogger.secUid]
      );
      let bloggerId = bloggerResult[0]?.values?.[0]?.[0] as number | undefined;

      if (!bloggerId) {
        db.run(
          'INSERT INTO bloggers (douyin_id, sec_uid, nickname) VALUES (?, ?, ?)',
          [
            defaultBlogger.secUid,
            defaultBlogger.secUid,
            defaultBlogger.nickname,
          ]
        );
        bloggerResult = db.exec(
          'SELECT id FROM bloggers WHERE sec_uid = ?',
          [defaultBlogger.secUid]
        );
        bloggerId = bloggerResult[0]?.values?.[0]?.[0] as number | undefined;
      }

      if (!bloggerId) {
        throw new Error('无法创建或找到默认博主');
      }

      const subscription = db.prepare(
        `INSERT OR IGNORE INTO subscriptions (user_openid, blogger_id)
         VALUES (?, ?)`
      );
      for (const openid of missing) {
        subscription.run([openid, bloggerId]);
      }
      subscription.free();
    }

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log(`已补充 ${missing.length} 个用户；其他历史订阅无法重建。`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
