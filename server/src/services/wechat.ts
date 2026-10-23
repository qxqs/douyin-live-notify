import axios from 'axios';
import { config } from '../config';
import db from '../db';

// ============================================================
// 微信测试号  access_token 管理
// ============================================================
let accessTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * 获取测试号的 access_token（带缓存，提前 5 分钟刷新）
 */
export async function getAccessToken(): Promise<string> {
  if (
    accessTokenCache &&
    Date.now() < accessTokenCache.expiresAt - 5 * 60 * 1000
  ) {
    return accessTokenCache.token;
  }

  const url = 'https://api.weixin.qq.com/cgi-bin/token';
  const resp = await axios.get(url, {
    params: {
      grant_type: 'client_credential',
      appid: config.wechat.appId,
      secret: config.wechat.appSecret,
    },
  });

  const { access_token, expires_in } = resp.data;

  if (!access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(resp.data)}`);
  }

  accessTokenCache = {
    token: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  };

  console.log('[微信] access_token 已刷新');
  return access_token;
}

// ============================================================
// OAuth 2.0 网页授权
// ============================================================

/**
 * 用 code 换取 openid 和用户信息
 * 测试号只支持 snsapi_base（只拿 openid）或 snsapi_userinfo（拿用户信息）
 */
export async function getOAuthUserInfo(code: string) {
  const accessToken = await getAccessToken();

  // 用测试号 access_token 不能做 OAuth，需要用专门的接口
  // 测试号的 OAuth 接口和普通服务号一样
  const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token';
  const tokenResp = await axios.get(tokenUrl, {
    params: {
      appid: config.wechat.appId,
      secret: config.wechat.appSecret,
      code,
      grant_type: 'authorization_code',
    },
  });

  const { openid, access_token: oauthToken } = tokenResp.data;

  if (!openid) {
    throw new Error(`OAuth 获取 openid 失败: ${JSON.stringify(tokenResp.data)}`);
  }

  // 如果 scope 是 snsapi_userinfo，可以拉取用户信息
  let nickname = '';
  let avatarUrl = '';

  if (tokenResp.data.scope === 'snsapi_userinfo') {
    const userUrl = 'https://api.weixin.qq.com/sns/userinfo';
    const userResp = await axios.get(userUrl, {
      params: {
        access_token: oauthToken,
        openid,
        lang: 'zh_CN',
      },
    });
    nickname = userResp.data.nickname || '';
    avatarUrl = userResp.data.headimgurl || '';
  }

  return { openid, nickname, avatarUrl };
}

// ============================================================
// 用户管理
// ============================================================

export function upsertUser(openid: string, nickname: string, avatarUrl: string) {
  const existing = db
    .prepare('SELECT openid FROM users WHERE openid = ?')
    .get(openid) as any;

  if (existing) {
    db.prepare(
      `UPDATE users SET nickname = ?, avatar_url = ?, updated_at = datetime('now', 'localtime') WHERE openid = ?`
    ).run(nickname, avatarUrl, openid);
  } else {
    db.prepare(
      `INSERT INTO users (openid, nickname, avatar_url, subscribe_time) VALUES (?, ?, ?, datetime('now', 'localtime'))`
    ).run(openid, nickname, avatarUrl);
  }
}

// ============================================================
// 模板消息
// ============================================================

export interface TemplateMessageData {
  touser: string;
  template_id: string;
  url?: string;
  data: Record<string, { value: string; color?: string }>;
}

/**
 * 发送模板消息
 */
export async function sendTemplateMessage(msg: TemplateMessageData) {
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;

  const resp = await axios.post(url, msg);
  const result = resp.data;

  if (result.errcode !== 0) {
    console.error(`[微信] 发送模板消息失败: ${JSON.stringify(result)}`);
    return { success: false, error: result.errmsg };
  }

  return { success: true, msgid: result.msgid as number };
}

/**
 * 发送开播提醒
 */
export async function sendLiveNotification(
  openid: string,
  bloggerName: string,
  liveTitle: string,
  liveUrl: string
) {
  return sendTemplateMessage({
    touser: openid,
    template_id: config.wechat.templateId,
    url: liveUrl,
    data: {
      first: { value: '你关注的主播开播了！', color: '#FF5722' },
      keyword1: { value: bloggerName },
      keyword2: { value: liveTitle || '直播中' },
      keyword3: {
        value: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      },
      remark: { value: '点击查看 → 快去直播间围观吧！', color: '#07C160' },
    },
  });
}
