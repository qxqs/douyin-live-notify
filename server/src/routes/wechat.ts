import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { config } from '../config';
import { getOAuthUserInfo, upsertUser } from '../services/wechat';
import db from '../db';

import crypto from 'crypto';

const router = Router();
const QR_LOGIN_TTL_MS = 5 * 60 * 1000;
const qrLoginSessions = new Map<string, { expiresAt: number; token?: string }>();

function cleanupQrLoginSessions() {
  const now = Date.now();
  for (const [nonce, session] of qrLoginSessions) {
    if (session.expiresAt <= now) {
      qrLoginSessions.delete(nonce);
    }
  }
}

function parseQrNonce(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value) ? value : null;
}

function getQrNonceFromState(state: string): string | null {
  return state.startsWith('qr:') ? parseQrNonce(state.slice(3)) : null;
}

function getSafeRedirectPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}

function buildWechatOAuthUrl(state: string): string {
  const callbackUrl = `${config.baseUrl}/api/wechat/callback`;
  return (
    `https://open.weixin.qq.com/connect/oauth2/authorize?` +
    `appid=${config.wechat.appId}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&response_type=code` +
    `&scope=snsapi_userinfo` +
    `&state=${encodeURIComponent(state)}` +
    `#wechat_redirect`
  );
}

function renderQrLoginResultPage(success: boolean): string {
  const title = success ? '登录成功' : '二维码已失效';
  const message = success
    ? '请返回电脑页面，登录状态将自动同步。'
    : '请返回电脑页面刷新二维码后重新扫码。';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f5f5; color: #1f2329; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(100%, 360px); text-align: center; }
    .status { width: 72px; height: 72px; display: grid; place-items: center; margin: 0 auto 24px; border-radius: 50%; background: ${success ? '#07c160' : '#ee4d38'}; color: #fff; font-size: 36px; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0; color: #667085; font-size: 15px; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <div class="status">${success ? '&#10003;' : '!'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

function autoSubscribeDefault(openid: string) {
  const { secUid, nickname } = config.defaultBlogger;
  if (!secUid) return;

  let blogger = db
    .prepare('SELECT id, nickname FROM bloggers WHERE sec_uid = ?')
    .get(secUid) as any;

  // 如果库里还没有该博主，先建一条占位（昵称等轮询时自动更新）
  if (!blogger) {
    db.prepare(
      'INSERT INTO bloggers (douyin_id, sec_uid, nickname) VALUES (?, ?, ?)'
    ).run(secUid, secUid, nickname);
    blogger = db
      .prepare('SELECT id, nickname FROM bloggers WHERE sec_uid = ?')
      .get(secUid) as any;
  }

  if (!blogger) return;

  const existing = db
    .prepare('SELECT id FROM subscriptions WHERE user_openid = ? AND blogger_id = ?')
    .get(openid, blogger.id);
  if (!existing) {
    db.prepare('INSERT INTO subscriptions (user_openid, blogger_id) VALUES (?, ?)').run(openid, blogger.id);
    console.log('[自动订阅] ' + openid + ' → ' + blogger.nickname);
  }
}

/**
 * 微信服务器验证（GET）
 * 测试号「接口配置信息」提交时，微信会调这个接口验证服务器有效性
 *
 * 在测试号后台填写：
 *   URL: https://your-domain.com/api/wechat/verify
 *   Token: 自定义字符串，与 .env 的 WECHAT_TOKEN 保持一致
 */
router.get('/verify', (req: Request, res: Response) => {
  const { signature, timestamp, nonce, echostr } = req.query;

  if (!signature || !timestamp || !nonce || !echostr) {
    return res.status(400).send('missing params');
  }

  // 1. 将 token、timestamp、nonce 按字典序排序
  const arr = [config.wechat.token, timestamp as string, nonce as string].sort();
  // 2. 拼接成一个字符串
  const str = arr.join('');
  // 3. SHA1 哈希
  const hash = crypto.createHash('sha1').update(str).digest('hex');

  // 4. 对比签名
  if (hash === signature) {
    console.log('[微信] 服务器验证成功');
    return res.send(echostr as string);
  }

  console.log('[微信] 服务器验证失败，签名不匹配');
  res.status(403).send('signature mismatch');
});

/**
 * 【本地开发】模拟登录 —— 不依赖微信 OAuth，直接用 openid 登录
 * GET /api/wechat/dev-login?openid=xxx&nickname=测试用户
 *
 * 仅在未配置微信 appid 时可用（即本地开发模式）
 */
router.get('/dev-login', (req: Request, res: Response) => {
  // 仅开发环境可用：微信未配置 或 显式设置 NODE_ENV=development
  const isDev = process.env.NODE_ENV === 'development';
  const isPlaceholder = !config.wechat.appId || config.wechat.appId.startsWith('wx_your_');
  const remoteAddress = req.socket.remoteAddress || '';
  const isLoopback =
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1';
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(req.hostname);
  if (!isDev && !isPlaceholder && !(isLoopback && isLocalHost)) {
    return res.status(404).end(); // 生产环境返回 404，不暴露接口存在
  }

  const openid = (req.query.openid as string) || 'dev_user_001';
  const nickname = (req.query.nickname as string) || '测试用户';
  const avatarUrl = (req.query.avatar as string) || '';

  // 创建/更新用户
  upsertUser(openid, nickname, avatarUrl);
  // 自动订阅默认博主
  autoSubscribeDefault(openid);

  // 生成 JWT
  const token = jwt.sign({ openid, nickname, avatarUrl }, config.jwtSecret, {
    expiresIn: '30d',
  });

  const redirect = (req.query.redirect as string) || '/';

  res.json({
    code: 0,
    message: '开发模式登录成功',
    data: { token, openid, nickname },
    loginUrl: `${redirect}?token=${token}`,
  });
});

/**
 * 创建 PC 扫码登录会话
 * GET /api/wechat/qr-login
 */
router.get('/qr-login', async (_req: Request, res: Response) => {
  try {
    cleanupQrLoginSessions();
    const nonce = crypto.randomBytes(24).toString('hex');
    qrLoginSessions.set(nonce, { expiresAt: Date.now() + QR_LOGIN_TTL_MS });

    const redirect = `qr:${nonce}`;
    const authorizeUrl =
      `${config.baseUrl}/api/wechat/oauth?redirect=${encodeURIComponent(redirect)}`;
    const qrCode = await QRCode.toDataURL(authorizeUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    res.json({
      code: 0,
      data: {
        nonce,
        qrCode,
        expiresIn: Math.floor(QR_LOGIN_TTL_MS / 1000),
      },
    });
  } catch (err: any) {
    console.error('[微信] 生成登录二维码失败:', err.message);
    res.status(500).json({ code: -1, message: '二维码生成失败，请稍后重试' });
  }
});

/**
 * PC 轮询扫码登录结果
 * GET /api/wechat/qr-status?nonce=xxx
 */
router.get('/qr-status', (req: Request, res: Response) => {
  const nonce = parseQrNonce(req.query.nonce);
  if (!nonce) {
    return res.json({ code: 0, data: { status: 'expired' } });
  }

  const session = qrLoginSessions.get(nonce);
  if (!session || session.expiresAt <= Date.now()) {
    qrLoginSessions.delete(nonce);
    return res.json({ code: 0, data: { status: 'expired' } });
  }

  if (!session.token) {
    return res.json({ code: 0, data: { status: 'pending' } });
  }

  qrLoginSessions.delete(nonce);
  res.json({ code: 0, data: { status: 'ready', token: session.token } });
});

/**
 * 发起 OAuth —— 重定向到微信授权页
 * GET /api/wechat/oauth?redirect=/pages/index
 */
router.get('/oauth', (req: Request, res: Response) => {
  const redirectValue =
    typeof req.query.redirect === 'string' ? req.query.redirect : '/';

  if (redirectValue.startsWith('qr:')) {
    const nonce = getQrNonceFromState(redirectValue);
    const session = nonce ? qrLoginSessions.get(nonce) : null;
    if (!nonce || !session || session.expiresAt <= Date.now()) {
      return res.status(410).send('登录二维码已失效，请返回电脑页面刷新');
    }
    return res.redirect(buildWechatOAuthUrl(redirectValue));
  }

  res.redirect(buildWechatOAuthUrl(getSafeRedirectPath(redirectValue)));
});

/**
 * OAuth 回调 —— 用 code 换取 openid，生成 JWT 并重定向回前端
 * GET /api/wechat/callback?code=xxx&state=xxx
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('缺少 code 参数');
  }

  try {
    const { openid, nickname, avatarUrl } = await getOAuthUserInfo(code as string);

    // 保存/更新用户
    upsertUser(openid, nickname, avatarUrl);
    // 自动订阅默认博主
    autoSubscribeDefault(openid);

    // 生成 JWT
    const token = jwt.sign({ openid, nickname, avatarUrl }, config.jwtSecret, {
      expiresIn: '30d',
    });

    const stateValue =
      typeof state === 'string' ? decodeURIComponent(state) : '/';
    const qrNonce = getQrNonceFromState(stateValue);

    if (qrNonce) {
      const session = qrLoginSessions.get(qrNonce);
      if (!session || session.expiresAt <= Date.now()) {
        return res.status(410).type('html').send(renderQrLoginResultPage(false));
      }
      session.token = token;
      return res.type('html').send(renderQrLoginResultPage(true));
    }

    const redirectPath = getSafeRedirectPath(stateValue);
    const separator = redirectPath.includes('?') ? '&' : '?';
    res.redirect(
      `${redirectPath}${separator}token=${encodeURIComponent(token)}`
    );
  } catch (err: any) {
    console.error('[微信] OAuth 回调错误:', err.message);
    res.status(500).send('登录失败: ' + err.message);
  }
});

/**
 * 退出登录
 * POST /api/wechat/logout
 */
router.post('/logout', (_req: Request, res: Response) => {
  // 由前端清除 token，后端无需特殊处理
  res.json({ code: 0, message: 'ok' });
});

export default router;
