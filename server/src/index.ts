import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { initDatabase } from './db';
import wechatRoutes from './routes/wechat';
import apiRoutes from './routes/api';
import { startPoller } from './services/poller';

async function main() {
  await initDatabase();

  const app = express();
  app.set('trust proxy', 'loopback');

  // 全局频率限制：每 IP 每分钟最多 60 次请求
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { code: -1, message: '请求太频繁，请稍后再试' },
    })
  );

  // 对搜索接口额外限制：每 IP 每分钟最多 10 次
  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: -1, message: '搜索太频繁，请稍后再试' },
  });

  // 中间件
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 搜索路由单独限频
  app.use('/api/bloggers/search', searchLimiter);

  // 路由
  app.use('/api/wechat', wechatRoutes);
  app.use('/api', apiRoutes);

  // 健康检查
  app.get('/ping', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.listen(config.port, () => {
    console.log(`
========================================
  抖音直播开播提醒 - 后端服务
========================================
  地址: http://localhost:${config.port}
  微信: ${config.wechat.appId ? '已配置' : '⚠ 请先配置 .env'}
========================================`);

    startPoller();
    if (!config.wechat.appId || !config.wechat.appSecret) {
      console.log('[提示] 微信未配置，通知功能暂不可用。配置 .env 后重启即可。');
    }
  });
}

main().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
