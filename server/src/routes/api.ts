import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import db from '../db';
import { parseDouyinInput, resolveShortLink, getUserProfile, checkLiveStatus } from '../services/douyin';
import { sendLiveNotification } from '../services/wechat';

const router = Router();

// ============================================================
// 中间件 —— JWT 鉴权
// ============================================================

function authMiddleware(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: -1, message: '未登录' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      openid: string;
      nickname: string;
    };
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ code: -1, message: '登录已过期' });
  }
}

// ============================================================
// 用户
// ============================================================

/**
 * 获取当前用户信息
 * GET /api/user/info
 */
router.get('/user/info', authMiddleware, (req: Request, res: Response) => {
  const { openid } = (req as any).user;
  const user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as any;
  if (!user) {
    return res.status(404).json({ code: -1, message: '用户不存在' });
  }
  res.json({
    code: 0,
    data: {
      openid: user.openid,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
        isAdmin: config.adminOpenids.includes(user.openid),
    },
  });
});

// ============================================================
// 博主
// ============================================================

/**
 * 搜索/解析博主（根据抖音链接或ID）
 * POST /api/bloggers/search
 * Body: { input: "https://www.douyin.com/user/MS4wLjABAAAA..." }
 */
router.post('/bloggers/search', authMiddleware, async (req: Request, res: Response) => {
  const { input } = req.body;
  if (!input || !input.trim()) {
    return res.status(400).json({ code: -1, message: '请输入抖音号或直播间链接' });
  }

  const parsed = parseDouyinInput(input.trim());

  if (parsed.type === 'unknown') {
    return res.json({
      code: -1,
      message:
        '无法解析，请复制抖音博主的「主页链接」或「直播间链接」。\n\n获取方法：抖音 APP → 博主主页 → 右上角分享 → 复制链接\n格式示例：\nhttps://www.douyin.com/user/MS4wLjABAAAA...\n或 https://live.douyin.com/123456789',
    });
  }

  if (parsed.type === 'short_link') {
    // 跟随短链接重定向，拿到真实地址
    const resolved = await resolveShortLink(parsed.value);
    if (resolved.type === 'unknown') {
      return res.json({
        code: -1,
        message: '短链接解析失败，请直接复制博主主页链接（抖音 APP → 博主主页 → 右上角分享 → 复制链接）',
      });
    }
    // 用解析后的类型继续处理
    parsed.type = resolved.type;
    parsed.value = resolved.value;
  }

  // ============================================================
  // 情况 1: 用户输入的是 room_id（直播间号）
  // ============================================================
  if (parsed.type === 'room_id') {
    const roomId = parsed.value;

    // 先查本地
    const existing = db
      .prepare('SELECT * FROM bloggers WHERE room_id = ? OR douyin_id = ?')
      .get(roomId, roomId) as any;

    if (existing) {
      return res.json({ code: 0, data: formatBlogger(existing) });
    }

    // 存库（先存基本信息，直播状态由轮询来更新）
    db.prepare(
      `INSERT INTO bloggers (douyin_id, room_id, nickname, avatar_url) VALUES (?, ?, ?, ?)`
    ).run(roomId, roomId, `直播间${roomId}`, '');

    const blogger = db.prepare('SELECT * FROM bloggers WHERE room_id = ?').get(roomId) as any;
    if (!blogger) {
      return res.status(500).json({ code: -1, message: '保存失败，请重试' });
    }

    return res.json({ code: 0, data: formatBlogger(blogger) });
  }

  // ============================================================
  // 情况 2: 用户输入的是 sec_uid（抖音主页链接）
  // ============================================================
  // parsed.type === 'sec_uid'
  const secUid = parsed.value;

  // 先查本地（通过 sec_uid）
  const existing = db
    .prepare('SELECT * FROM bloggers WHERE sec_uid = ? OR douyin_id = ?')
    .get(secUid, secUid) as any;

  if (existing) {
    return res.json({ code: 0, data: formatBlogger(existing) });
  }

  // 从抖音主页获取博主信息
  const profile = await getUserProfile(secUid);
  if (!profile) {
    return res.json({
      code: -1,
      message: '无法获取博主信息，请检查链接是否正确，或稍后重试',
    });
  }

  const nickname = profile.nickname || `用户${secUid.slice(0, 8)}`;
  const avatar = profile.avatarUrl || '';

  // 存库（sec_uid 是主要标识，room_id 可能在每次开播时变化）
  db.prepare(
    `INSERT INTO bloggers (douyin_id, sec_uid, room_id, nickname, avatar_url, live_status, live_title)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    secUid,
    secUid,
    profile.roomId || '',
    nickname,
    avatar,
    profile.isLive ? 1 : 2,
    profile.liveTitle || ''
  );

  const blogger = db
    .prepare('SELECT * FROM bloggers WHERE sec_uid = ?')
    .get(secUid) as any;
  if (!blogger) {
    return res.status(500).json({ code: -1, message: '保存失败，请重试' });
  }

  return res.json({ code: 0, data: formatBlogger(blogger) });
});

/**
 * 获取博主实时状态
 * GET /api/bloggers/:id/status
 */
router.get('/bloggers/:id/status', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const blogger = db.prepare('SELECT * FROM bloggers WHERE id = ?').get(id) as any;

  if (!blogger) {
    return res.status(404).json({ code: -1, message: '博主不存在' });
  }

  const status = await checkLiveStatus(blogger.room_id);

  // 更新状态
  db.prepare(
    `UPDATE bloggers SET live_status = ?, live_title = ?, last_checked_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(status.isLive ? 1 : 2, status.title, id);

  res.json({
    code: 0,
    data: {
      isLive: status.isLive,
      liveTitle: status.title,
      nickname: status.nickname || blogger.nickname,
    },
  });
});

// ============================================================
// 订阅管理
// ============================================================

/**
 * 订阅
 * POST /api/subscriptions
 * Body: { bloggerId: number }
 */
router.post('/subscriptions', authMiddleware, (req: Request, res: Response) => {
  const { openid } = (req as any).user;
  const { bloggerId, displayName } = req.body;

  if (!bloggerId) {
    return res.status(400).json({ code: -1, message: '缺少博主ID' });
  }

  const blogger = db.prepare('SELECT * FROM bloggers WHERE id = ?').get(bloggerId) as any;
  if (!blogger) {
    return res.status(404).json({ code: -1, message: '博主不存在' });
  }

  // 检查是否已订阅
  const existing = db
    .prepare('SELECT id FROM subscriptions WHERE user_openid = ? AND blogger_id = ?')
    .get(openid, bloggerId);

  if (existing) {
    return res.json({ code: 0, message: '已订阅', data: { subscribed: true } });
  }

  db.prepare('INSERT INTO subscriptions (user_openid, blogger_id) VALUES (?, ?)').run(
    openid,
    bloggerId
  );

  // 如果用户提供了备注名，更新博主昵称
  if (displayName && typeof displayName === 'string' && displayName.trim()) {
    const name = displayName.trim();
    db.prepare(
      `UPDATE bloggers SET nickname = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
    ).run(name, bloggerId);
  }

  // 如果博主当前正在直播，立即给这个新订阅者发通知
  if (blogger.live_status === 1 && blogger.room_id) {
    const liveUrl = `https://live.douyin.com/${blogger.room_id}`;
    sendLiveNotification(
      openid,
      blogger.nickname || `博主${blogger.id}`,
      blogger.live_title || '直播中',
      liveUrl
    ).then((result) => {
      if (result.success) {
        db.prepare(
          `INSERT INTO notification_log (user_openid, blogger_id, live_title) VALUES (?, ?, ?)`
        ).run(openid, bloggerId, blogger.live_title || '');
        console.log(`[订阅] ${openid} 订阅了正在直播的博主，已发送通知`);
      }
    }).catch((err) => {
      console.error(`[订阅] 即时通知失败:`, err.message);
    });
  }

  res.json({ code: 0, message: '订阅成功', data: { subscribed: true } });
});

/**
 * 取消订阅
 * DELETE /api/subscriptions/:bloggerId
 */
router.delete('/subscriptions/:bloggerId', authMiddleware, (req: Request, res: Response) => {
  const { openid } = (req as any).user;
  const bloggerId = parseInt(req.params.bloggerId);

  db.prepare('DELETE FROM subscriptions WHERE user_openid = ? AND blogger_id = ?').run(
    openid,
    bloggerId
  );

  res.json({ code: 0, message: '已取消订阅' });
});

/**
 * 获取我的订阅列表（带实时状态）
 * GET /api/subscriptions
 */
router.get('/subscriptions', authMiddleware, (req: Request, res: Response) => {
  const { openid } = (req as any).user;

  const subs = db
    .prepare(
      `
    SELECT
      b.id, b.room_id, b.nickname, b.avatar_url,
      b.live_status, b.live_title, b.last_checked_at,
      s.created_at as subscribed_at
    FROM subscriptions s
    INNER JOIN bloggers b ON b.id = s.blogger_id
    WHERE s.user_openid = ?
    ORDER BY b.live_status DESC, s.created_at DESC
  `
    )
    .all(openid) as any[];

  res.json({
    code: 0,
    data: subs.map((s) => ({
      id: s.id,
      roomId: s.room_id,
      nickname: s.nickname,
      avatarUrl: s.avatar_url,
      liveStatus: s.live_status, // 0=未知 1=直播中 2=已下播
      liveTitle: s.live_title,
      lastCheckedAt: s.last_checked_at,
      subscribedAt: s.subscribed_at,
    })),
  });
});

// ============================================================
// 管理员接口
// ============================================================

function adminOnly(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user?.openid || !config.adminOpenids.includes(user.openid)) {
    return res.status(403).json({ code: -1, message: '仅管理员可用' });
  }
  next();
}

/**
 * 获取所有订阅者列表
 * GET /api/admin/subscribers
 */
router.get('/admin/subscribers', authMiddleware, adminOnly, (_req: Request, res: Response) => {
  const subs = db
    .prepare(
      `SELECT s.id, s.user_openid, s.created_at as subscribed_at,
              u.nickname as user_nickname, u.avatar_url,
              b.nickname as blogger_name, b.live_status, b.live_title
       FROM subscriptions s
       JOIN bloggers b ON b.id = s.blogger_id
       LEFT JOIN users u ON u.openid = s.user_openid
       ORDER BY s.created_at DESC`
    )
    .all() as any[];

  // 按博主分组统计
  const byBlogger: Record<string, any> = {};
  for (const s of subs) {
    const key = s.blogger_name || '未知';
    if (!byBlogger[key]) {
      byBlogger[key] = { blogger: key, liveStatus: s.live_status, subscribers: [] };
    }
    byBlogger[key].subscribers.push({
      nickname: s.user_nickname || '未命名',
      openid: s.user_openid,
      subscribedAt: s.subscribed_at,
    });
  }

  res.json({
    code: 0,
    data: {
      total: subs.length,
      byBlogger: Object.values(byBlogger),
      list: subs.map((s: any) => ({
        nickname: s.user_nickname || '未命名',
        openid: s.user_openid,
        blogger: s.blogger_name,
        subscribedAt: s.subscribed_at,
      })),
    },
  });
});

// ============================================================
// 辅助
// ============================================================

function formatBlogger(b: any) {
  return {
    id: b.id,
    roomId: b.room_id || '',
    secUid: b.sec_uid || '',
    nickname: b.nickname || '',
    avatarUrl: b.avatar_url || '',
    liveStatus: b.live_status || 0,
    liveTitle: b.live_title || '',
    isSubscribed: false,
  };
}

export default router;
