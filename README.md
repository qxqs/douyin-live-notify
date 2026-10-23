# 抖音直播开播提醒

一个基于微信测试号和 Node.js 的抖音直播开播提醒项目。

用户通过微信登录并订阅抖音博主后，后端会定时检查直播状态。检测到开播时，系统通过微信模板消息发送提醒。

## 功能

- 微信内直接登录
- PC 端微信扫码登录
- 手机外部浏览器引导在微信中打开
- 搜索并订阅抖音博主
- 定时检查直播状态
- 微信模板消息通知
- 自动订阅默认博主
- SQLite 单文件数据存储
- 管理用户列表

## 工作原理

```text
用户登录
   |
   v
关注抖音博主 -> 后端定时轮询直播状态
                        |
                        v
                  检测到开播
                        |
                        v
                 微信模板消息通知
```

## 技术栈

- 前端：Vue 3、Vite、Vant、TypeScript
- 后端：Node.js、Express、TypeScript
- 数据库：sql.js 和 SQLite 文件
- 微信：公众号测试号 OAuth、模板消息
- 定时任务：setInterval

## 项目结构

```text
.
├── miniapp/                   # 前端 H5
│   ├── public/images/
│   │   └── qrcode.png         # 测试号二维码占位图
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   └── utils/
│   └── package.json
├── server/                    # 后端服务
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── routes/
│   │   ├── services/
│   │   └── tools/
│   ├── .env.example
│   └── package.json
├── tools/                     # 独立抓取工具
└── README.md
```

## 环境要求

- Node.js 20 LTS 或 22 LTS
- npm 10+
- 可访问互联网的服务器
- 已备案并配置 HTTPS 的域名
- 微信公众平台测试号

微信测试号最多支持 20 个关注者。用户必须先关注测试号，才能接收模板消息。

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repository-url>
cd douyin-live-notify
```

### 2. 安装依赖

```bash
cd server
npm ci

cd ../miniapp
npm ci
```

### 3. 创建微信测试号

打开微信公众平台测试号页面：

```text
https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login
```

登录后获取：

- `appID`
- `appsecret`
- 测试号二维码

在“模板消息接口”中添加模板，并记录模板 ID。

模板内容建议使用以下字段：

```text
{{first.DATA}}
主播：{{keyword1.DATA}}
标题：{{keyword2.DATA}}
开播时间：{{keyword3.DATA}}
{{remark.DATA}}
```

### 4. 配置微信接口

在测试号后台配置服务器验证地址：

```text
https://your-domain.com/api/wechat/verify
```

接口 Token 由你自己生成，并需要与后端 `.env` 中的 `WECHAT_TOKEN` 完全一致。

网页授权域名填写：

```text
your-domain.com
```

项目会自动使用以下 OAuth 回调地址：

```text
https://your-domain.com/api/wechat/callback
```

本地开发可以使用 `http://localhost:3000`，但真实微信 OAuth 和服务器验证需要公网 HTTPS 地址。

### 5. 配置后端

```bash
cd server
cp .env.example .env
```

编辑 `server/.env`：

```env
WECHAT_APPID=wx_your_test_appid
WECHAT_APPSECRET=your_test_appsecret
WECHAT_TOKEN=your_custom_token
WECHAT_TEMPLATE_ID=your_template_id

BASE_URL=https://your-domain.com
PORT=3000
JWT_SECRET=replace_with_a_random_string_at_least_32_chars

# 可选：管理员微信 openid，多个用英文逗号分隔
ADMIN_OPENIDS=

# 可选：新用户自动订阅的默认博主
DEFAULT_BLOGGER_SEC_UID=
DEFAULT_BLOGGER_NICKNAME=

POLL_INTERVAL_MINUTES=2
```

### 6. 替换测试号二维码

公开仓库默认显示占位二维码：

```text
miniapp/public/images/qrcode.png
```

可以直接替换这个文件，也可以保留真实二维码不提交到 Git：

```text
miniapp/public/images/qrcode.local.jpg
```

然后创建 `miniapp/.env.local`：

```env
VITE_WECHAT_QRCODE=/images/qrcode.local.jpg
```

`qrcode.local.jpg` 和 `.env.local` 已被 `.gitignore` 忽略。

### 7. 启动开发环境

终端一，启动后端：

```bash
cd server
npm run dev
```

终端二，启动前端：

```bash
cd miniapp
npm run dev
```

打开：

```text
http://localhost:5173
```

Vite 会把 `/api` 请求代理到 `http://localhost:3000`。

本地开发时可以使用页面上的“本地开发登录”按钮。该入口只在开发模式或本机回环请求下可用。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `WECHAT_APPID` | 是 | 无 | 微信测试号 AppID |
| `WECHAT_APPSECRET` | 是 | 无 | 微信测试号 AppSecret |
| `WECHAT_TOKEN` | 是 | `my_token` | 自定义接口 Token |
| `WECHAT_TEMPLATE_ID` | 是 | 无 | 模板消息 ID |
| `BASE_URL` | 是 | `http://localhost:3000` | 公网访问地址，不要以 `/` 结尾 |
| `PORT` | 否 | `3000` | 后端监听端口 |
| `JWT_SECRET` | 是 | 开发用默认值 | JWT 密钥，生产环境必须修改 |
| `ADMIN_OPENIDS` | 否 | 空 | 管理员微信 openid，多个用逗号分隔 |
| `DEFAULT_BLOGGER_SEC_UID` | 否 | 空 | 新用户自动订阅的博主 sec_uid |
| `DEFAULT_BLOGGER_NICKNAME` | 否 | `默认博主` | 自动订阅博主的显示名称 |
| `POLL_INTERVAL_MINUTES` | 否 | `2` | 直播状态检查间隔，单位分钟 |
| `POLL_INTERVAL_SECONDS` | 否 | 空 | 秒级轮询配置，设置后优先于分钟配置 |

前端可选变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_WECHAT_QRCODE` | `/images/qrcode.png` | 登录页显示的测试号二维码 |

不要把真实 `.env`、数据库、二维码或证书提交到 Git。

## 管理员配置

管理员通过微信 openid 识别，不使用昵称判断。

1. 完成一次微信登录。
2. 在 `server/data/live-notify.db` 的 `users` 表找到对应 openid。
3. 写入 `server/.env`：

```env
ADMIN_OPENIDS=openid_1,openid_2
```

配置后，管理员可以在“我的”页面进入用户管理界面。

## 默认博主配置

新用户首次完成微信登录时，可以自动订阅一个默认博主。

```env
DEFAULT_BLOGGER_SEC_UID=your_douyin_sec_uid
DEFAULT_BLOGGER_NICKNAME=your_blogger_name
```

不配置 `DEFAULT_BLOGGER_SEC_UID` 时，新用户不会自动订阅任何博主。

## 构建

### 前端

```bash
cd miniapp
npm run build
```

构建产物：

```text
miniapp/dist/
```

### 后端

```bash
cd server
npm run build
```

构建产物：

```text
server/dist/
```

## 生产部署

### 1. 启动后端

推荐使用 PM2：

```bash
cd server
npm ci
npm run build

npm install -g pm2
pm2 start dist/index.js --name douyin-live-notify
pm2 save
pm2 startup
```

检查后端：

```bash
curl http://127.0.0.1:3000/ping
```

预期返回：

```json
{"ok":true,"time":"..."}
```

### 2. 部署前端

将 `miniapp/dist/` 中的文件部署到 Nginx 静态目录，例如：

```text
/www/wwwroot/idouyin
```

### 3. 配置 Nginx

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name your-domain.com;

    root /www/wwwroot/idouyin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location = /ping {
        proxy_pass http://127.0.0.1:3000/ping;
        proxy_set_header Host $host;
    }
}
```

后端监听在服务器本机 `3000` 端口，只需要对外开放 `80` 和 `443`。

### 4. 检查部署

```bash
curl https://your-domain.com/ping
curl https://your-domain.com/api/wechat/verify
```

- `/ping` 应返回 200。
- `/api/wechat/verify` 在无参数时应返回 400，而不是 Nginx 404。
- 在微信测试号后台重新提交接口配置，确认 Token 验证通过。

## 登录方式

- 微信浏览器：直接进行公众号网页授权。
- 手机普通浏览器：微信网页授权无法在微信外完成，页面会引导分享或复制链接后在微信中打开。
- PC 浏览器：显示微信扫码登录二维码，手机扫码后 PC 自动完成登录。

微信网页授权只能在微信客户端内完成。如果需要在手机外部浏览器中直接拉起微信并返回登录结果，需要开发原生 App 或混合 App，并接入微信开放平台移动应用 SDK。

## 数据存储与备份

数据库默认保存到：

```text
server/data/live-notify.db
```

代码更新不会自动删除该文件，但重新创建部署目录时可能丢失数据。

建议定期备份：

```bash
cp -a server/data/live-notify.db \
      server/data/live-notify.db.backup-$(date +%F-%H%M)
```

数据库使用整个文件覆盖写回。更新数据时，建议先停止后端进程。

## 微信粉丝恢复工具

如果 `users` 表丢失，但微信测试号粉丝仍在，可以比对并补充用户：

```bash
cd server
npm run build

# 只读检查
node dist/tools/reconcile-wechat-followers.js

# 停止后端后执行写入
pm2 stop douyin-live-notify
RECONCILE_OFFLINE=1 node dist/tools/reconcile-wechat-followers.js --apply
pm2 start douyin-live-notify
```

该工具可以恢复微信 openid 和默认博主订阅，但无法恢复用户以前订阅过的其他博主。

## 常见问题

### PC 扫码成功，但手机页面提示失败

检查 `BASE_URL` 是否为公网 HTTPS 地址，以及微信测试号的网页授权域名是否正确。

### 能登录，但收不到模板消息

检查：

- 用户是否已关注微信测试号
- `WECHAT_TEMPLATE_ID` 是否正确
- 模板字段是否包含 `first`、`keyword1`、`keyword2`、`keyword3`、`remark`
- 用户是否有对应博主的订阅
- 后端轮询任务是否正常运行

### 手机外部浏览器无法直接微信登录

这是微信网页授权的平台限制，不是项目配置错误。请分享或复制链接后在微信中打开。

### 扫码登录后数据库没有用户

检查 `/api/wechat/callback` 是否可以公网访问，并查看后端日志：

```bash
pm2 logs douyin-live-notify
```

### 抖音直播状态检测失败

抖音页面和接口可能调整。检查 `server/src/services/douyin.ts`，并确认服务器可以访问抖音。

## 安全说明

- 不要提交 `server/.env`。
- 不要提交 `server/data/` 或任何 `.db` 文件。
- 不要提交真实测试号二维码，使用 `qrcode.local.jpg` 本地覆盖。
- 生产环境必须使用强随机 `JWT_SECRET`。
- 管理员必须通过 `ADMIN_OPENIDS` 配置。
- 微信回调域名必须使用 HTTPS。
- 扫码登录会话保存在 Node 内存中，后端应保持单实例运行。使用 PM2 cluster 时，需要改用 Redis 或数据库共享会话。

## 许可证

发布到 GitHub 前请根据你的开源计划添加 `LICENSE` 文件。若未添加许可证，默认保留全部权利，其他人不能合法地复制、修改或分发该项目。
