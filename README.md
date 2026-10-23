# 📡 抖音直播开播提醒

第一时间收到你关注的主播开播通知，不错过任何一场直播。

## 原理

```
用户关注博主 → 后端定时轮询抖音直播间状态 → 检测到开播 → 微信模板消息通知
```

基于微信测试号（公众号测试账号）的模板消息，**完全免费、无限发送**，支持最多 100 个关注者。

## 项目结构

```
douyin-live-notify/
├── server/              # 后端服务 (Node.js + Express + SQLite)
│   ├── src/
│   │   ├── config/      # 配置
│   │   ├── db/          # 数据库
│   │   ├── services/    # 核心服务
│   │   │   ├── wechat.ts    # 微信测试号（OAuth + 模板消息）
│   │   │   ├── douyin.ts    # 抖音直播状态检测
│   │   │   └── poller.ts    # 定时轮询
│   │   ├── routes/      # API 路由
│   │   └── index.ts     # 入口
│   └── .env.example     # 环境变量模板
│
└── miniapp/             # 前端 (uni-app + Vue 3)
    └── src/
        ├── pages/
        │   ├── index/   # 首页（直播状态列表）
        │   ├── search/  # 搜索/添加博主
        │   └── my/      # 我的（用户信息）
        ├── api/         # API 封装
        └── utils/       # 工具函数
```

## 快速开始

### 1. 获取微信测试号

访问 https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login

用你的微信扫码登录后，你会获得：
- **appID** 和 **appsecret**
- 往下滚动，找到「模板消息接口」→ 添加一个模板消息

模板消息内容示例：
```
{{first.DATA}}
主播：{{keyword1.DATA}}
标题：{{keyword2.DATA}}
开播时间：{{keyword3.DATA}}
{{remark.DATA}}
```

记下模板 ID。

### 2. 配置 OAuth 回调

在测试号页面找到「接口配置信息」→「OAuth2.0网页授权」→ 填写：
```
https://你的域名/api/wechat/callback
```

### 3. 配置后端

```bash
cd server
cp .env.example .env
# 编辑 .env，填入以下内容：
#   WECHAT_APPID=你的测试号appID
#   WECHAT_APPSECRET=你的测试号appsecret
#   WECHAT_TEMPLATE_ID=你的模板ID
#   BASE_URL=https://你的域名
#   JWT_SECRET=随机字符串
#   ADMIN_OPENIDS=管理员微信openid，多个用英文逗号分隔
#   DEFAULT_BLOGGER_SEC_UID=默认博主抖音sec_uid
#   DEFAULT_BLOGGER_NICKNAME=默认博主昵称

npm install
npm run dev
```

### 4. 配置前端

```bash
cd miniapp
npm install
npm run dev  # 开发模式
npm run build  # 构建到 dist/
```

默认使用 `public/images/qrcode.png` 占位二维码。需要替换为真实测试号二维码时，可放入不会被 Git 跟踪的 `qrcode.local.jpg`，并在 `miniapp/.env.local` 中设置：

```env
VITE_WECHAT_QRCODE=/images/qrcode.local.jpg
```

### 5. 部署

将 `miniapp/dist/` 部署到服务器的静态文件目录（Nginx 等），
或直接在服务器上用 `npm run preview` 运行。

Nginx 配置参考：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /path/to/miniapp/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6. 分享给朋友

1. 让你的朋友们先扫码关注你的微信测试号（测试号页面上有二维码）
2. 朋友们打开你的网站 → 微信 OAuth 登录 → 搜索/订阅博主
3. 博主开播时，朋友们都会收到微信模板消息

## 注意事项

1. **抖音页面经常改版**，直播间状态检测逻辑可能需要定期维护。如果发现检测不准，检查 [douyin.ts](server/src/services/douyin.ts) 中的解析逻辑
2. **测试号上限 100 人**，小型粉丝群足够。超过则需注册正式服务号
3. **轮询间隔默认 2 分钟**，可在 .env 的 `POLL_INTERVAL_MINUTES` 调整
4. **每个订阅者之间间隔 500ms 发消息**，避免触发微信接口频率限制
