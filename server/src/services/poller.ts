import cron from 'node-cron';
import { config } from '../config';
import db from '../db';
import { checkLiveStatus } from './douyin';
import { sendLiveNotification } from './wechat';

// 记录当天已通知的组合（用户+博主），避免同一直播间重复推送
const notifiedToday = new Set<string>();

// 每天凌晨清空通知记录
cron.schedule('0 0 * * *', () => {
  notifiedToday.clear();
  console.log('[轮询] 已清空当日通知缓存');
});

/**
 * 启动轮询任务
 */
export function startPoller() {
  const intervalMs = config.pollIntervalSeconds * 1000;

  console.log(
    `[轮询] 启动轮询任务，间隔: ${config.pollIntervalSeconds} 秒`
  );

  // 启动时立即执行一次
  pollAllBloggers();

  // 定时执行（用 setInterval 支持秒级）
  setInterval(() => {
    pollAllBloggers();
  }, intervalMs);
}

/**
 * 轮询所有被关注的博主
 */
async function pollAllBloggers() {
  // 获取所有被关注的博主（通过 room_id 或 sec_uid 标识）
  const bloggers = db
    .prepare(
      `
    SELECT DISTINCT b.* FROM bloggers b
    INNER JOIN subscriptions s ON s.blogger_id = b.id
    WHERE b.room_id != '' OR b.sec_uid != ''
  `
    )
    .all() as any[];

  if (bloggers.length === 0) {
    return;
  }

  console.log(`[轮询] 正在检查 ${bloggers.length} 个博主的直播状态...`);

  for (const blogger of bloggers) {
    try {
      await pollBlogger(blogger);
      await sleep(2000);
    } catch (err: any) {
      const tag = blogger.sec_uid || blogger.room_id;
      console.error(`[轮询] ${tag} 检查出错:`, err.message);
    }
  }
}

async function pollBlogger(blogger: any) {
  // 传入 blogger 对象，douyin.ts 会自动选择检测方式
  const { isLive, title, nickname, roomId } = await checkLiveStatus({
    roomId: blogger.room_id || undefined,
    secUid: blogger.sec_uid || undefined,
  });

  const tag = blogger.sec_uid || blogger.room_id;

  // 更新博主信息（如果拿到了新的 room_id 也一并更新）
  db.prepare(
    `
    UPDATE bloggers
    SET live_status = ?, live_title = ?,
        nickname = COALESCE(NULLIF(?, ''), nickname),
        room_id = COALESCE(NULLIF(?, ''), room_id),
        last_checked_at = datetime('now', 'localtime'),
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `
  ).run(isLive ? 1 : 2, title, nickname, roomId, blogger.id);

  // 如果是刚开播
  const wasNotLive = blogger.live_status === 0 || blogger.live_status === 2;
  if (isLive && wasNotLive) {
    console.log(`[轮询] 🔴 ${tag} 开播了！通知订阅者...`);
    const displayRoomId = roomId || blogger.room_id;
    await notifySubscribers(blogger, displayRoomId, title || '直播中');
  }

  // 刚下播
  if (!isLive && blogger.live_status === 1) {
    console.log(`[轮询] ⚫ ${tag} 下播了`);
  }
}

/**
 * 通知某博主的所有订阅者
 */
async function notifySubscribers(blogger: any, roomId: string, liveTitle: string) {
  const subscribers = db
    .prepare(
      `SELECT u.openid FROM users u
       INNER JOIN subscriptions s ON s.user_openid = u.openid
       WHERE s.blogger_id = ?`
    )
    .all(blogger.id) as { openid: string }[];

  const liveUrl = roomId
    ? `https://live.douyin.com/${roomId}`
    : `https://www.douyin.com/user/${blogger.sec_uid}`;

  let sentCount = 0;
  let skipCount = 0;

  for (const sub of subscribers) {
    const notifyKey = `${sub.openid}_${blogger.id}_${roomId}`;

    if (notifiedToday.has(notifyKey)) {
      skipCount++;
      continue;
    }

    try {
      const result = await sendLiveNotification(
        sub.openid,
        blogger.nickname || `博主${blogger.id}`,
        liveTitle,
        liveUrl
      );

      if (result.success) {
        notifiedToday.add(notifyKey);
        sentCount++;
        db.prepare(
          `INSERT INTO notification_log (user_openid, blogger_id, live_title) VALUES (?, ?, ?)`
        ).run(sub.openid, blogger.id, liveTitle);
        await sleep(500);
      }
    } catch (err: any) {
      console.error(`[轮询] 通知 ${sub.openid} 失败:`, err.message);
    }
  }

  console.log(
    `[轮询] 通知结果: 发送 ${sentCount}, 跳过 ${skipCount}, 共 ${subscribers.length} 个订阅者`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
