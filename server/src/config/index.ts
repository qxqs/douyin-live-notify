import dotenv from 'dotenv';
import path from 'path';

// 从 dist/config/ 向上两级到 server/，从 src/config/ 向上两级也到 server/
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configuredSeconds = Number(process.env.POLL_INTERVAL_SECONDS);
const configuredMinutes = Number(process.env.POLL_INTERVAL_MINUTES);
const adminOpenids = (process.env.ADMIN_OPENIDS || '')
  .split(',')
  .map((openid) => openid.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,

  wechat: {
    appId: process.env.WECHAT_APPID || '',
    appSecret: process.env.WECHAT_APPSECRET || '',
    token: process.env.WECHAT_TOKEN || 'my_token',
    templateId: process.env.WECHAT_TEMPLATE_ID || '',
  },

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminOpenids,
  defaultBlogger: {
    secUid: (process.env.DEFAULT_BLOGGER_SEC_UID || '').trim(),
    nickname: (process.env.DEFAULT_BLOGGER_NICKNAME || '默认博主').trim(),
  },

  pollIntervalSeconds:
    configuredSeconds > 0
      ? configuredSeconds
      : (configuredMinutes > 0 ? configuredMinutes : 2) * 60,

  dbPath: path.resolve(__dirname, '../../data/live-notify.db'),
};
