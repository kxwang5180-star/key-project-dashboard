# 重点项目管理系统 MySQL 部署说明

## 1. 当前上线状态

这套代码现在已经可以部署为：

- 一个 Node.js Web 应用
- 连接外部 MySQL
- 支持账号密码登录与飞书 OAuth 登录

但要注意：

- 当前前端页面主体仍然保留了一部分 `localStorage` 逻辑
- 所以现在更适合先作为**测试环境 / 第一版联调环境**上线
- 如果要变成真正多人协作正式版，下一步还要继续把前端全部切到 API

## 2. 服务器准备

- 云服务器：Ubuntu 22.04
- Node.js：20 或 22
- MySQL：8.0
- Nginx
- PM2 或 systemd

推荐目录：

```bash
/srv/key-project-dashboard
```

## 3. 数据库准备

先创建数据库：

```sql
CREATE DATABASE key_project_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

建议单独创建业务账号，并限制到该库。

## 4. 上传代码到云服务器

可以通过 `git clone` 或上传压缩包。

目录准备：

```bash
sudo mkdir -p /srv/key-project-dashboard
sudo chown -R $USER:$USER /srv/key-project-dashboard
cd /srv/key-project-dashboard
```

## 5. 环境变量

复制 `.env.example` 为 `.env`，重点修改：

```bash
DATABASE_URL="mysql://用户名:密码@MySQL地址:3306/key_project_dashboard"
JWT_SECRET="替换成足够长的随机字符串"
ADMIN_EMAIL="你的管理员邮箱"
ADMIN_PASSWORD="你的管理员初始密码"
```

如果要启用飞书登录，再补这些：

```bash
FEISHU_APP_ID="cli_xxx"
FEISHU_APP_SECRET="xxx"
FEISHU_REDIRECT_URI="https://your-domain.com/api/auth/feishu/callback"
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read im:chat:read im:chat.members:read"
COOKIE_SECURE="true"
```

## 6. 安装依赖与建表

```bash
npm install
npm run prisma:generate
npx prisma db push
npm run seed
```

说明：
- `prisma db push` 会按 `prisma/schema.prisma` 同步当前表结构
- `seed` 会把当前 [data.js](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/data.js) 的项目数据导入 MySQL
- 当前这套 RDS 权限模型不适合在服务器上直接使用 `prisma migrate dev`

## 7. 启动服务

启动前建议先跑一轮自检：

```bash
npm test
npm run check
npm run preflight -- --skip-http
```

服务启动后，再检查 API 入口是否确实返回 JSON，避免反向代理或 API 路径错误导致前端收到 HTML 页面：

```bash
npm run preflight -- --base-url http://127.0.0.1:3000
```

自检会检查关键环境变量、`FEISHU_REDIRECT_URI` 地址格式，以及 `/api`、`/api/health`、`/api/auth/me` 的返回类型。

开发：

```bash
npm run dev
```

生产：

```bash
npm start
```

建议生产用 PM2：

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

配套文件：  
[ecosystem.config.cjs](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/ecosystem.config.cjs)

## 8. Nginx 反向代理

示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后再配 HTTPS。

配套文件：  
[deploy/nginx.conf.example](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/deploy/nginx.conf.example)

## 9. HTTPS

域名解析到云服务器后：

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 10. Docker 部署方式（可选）

如果你想容器化部署，可以直接用：

```bash
docker build -t key-project-dashboard .
docker run -d \
  --name key-project-dashboard \
  --restart always \
  -p 3000:3000 \
  --env-file .env \
  key-project-dashboard
```

镜像构建会先安装完整依赖，执行 `npm run prisma:generate` 生成 Prisma Client，再裁剪开发依赖。构建前建议先执行：

```bash
npm run preflight -- --skip-http
```

如果预检提示缺少运行时依赖或关键环境变量，先修复这些问题再构建镜像。

配套文件：  
[Dockerfile](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/Dockerfile)

## 11. 当前已经具备的后端能力

- MySQL 数据模型
- 用户注册 / 登录
- 飞书 OAuth 登录
- 项目列表与项目概览接口
- 里程碑维护接口
- 指标维护接口
- 周报提交接口
- PMO 治理任务接口
- 基于当前静态数据的初始化脚本

## 12. 飞书登录接入

当前代码已经接入飞书网页登录所需的服务端链路，走的是：

- 授权页：`https://accounts.feishu.cn/open-apis/authen/v1/authorize`
- 换取用户令牌：`https://open.feishu.cn/open-apis/authen/v2/oauth/token`
- 获取用户信息：`https://open.feishu.cn/open-apis/authen/v1/user_info`

### 开放平台配置

你需要在飞书开放平台完成这些配置：

1. 创建自建应用
2. 开启网页应用能力
3. 配置重定向地址，例如：

```text
https://your-domain.com/api/auth/feishu/callback
```

当前测试服务器如果暂时没有域名，可先配置为：

```text
http://172.20.185.141/api/auth/feishu/callback
```

该地址必须和服务器 `.env` 中的 `FEISHU_REDIRECT_URI` 完全一致。飞书错误码 `20029` 通常就是授权请求里的 `redirect_uri` 没有在开放平台重定向 URL 列表中配置，或协议、地址、端口、路径存在任一差异。

4. 在权限管理中申请至少这些权限：
   - `contact:user.base:readonly`
   - `auth:user.id:read`
   - `im:chat:read`（读取当前授权用户所在群聊时需要）
   - `im:chat.members:read`（读取群成员时需要）

### 环境变量

至少补齐：

```bash
FEISHU_APP_ID="cli_xxx"
FEISHU_APP_SECRET="xxx"
FEISHU_REDIRECT_URI="https://your-domain.com/api/auth/feishu/callback"
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read im:chat:read im:chat.members:read"
FEISHU_CHAT_ID="oc_xxx"
```

### 获取飞书群成员姓名

如果要通过开放平台读取某个飞书群的成员姓名，需要先确认：

1. 应用已获得 `im:chat.members:read` 和 `contact:user.base:readonly` 权限，并完成管理员审批。
2. 应用机器人已加入目标群，或应用具备读取该群成员的权限。
3. 已拿到目标群的 `chat_id`。

服务器上可以执行：

```bash
cd /srv/key-project-dashboard
npm run feishu:chat-members -- --chat-id oc_xxx
```

如果 `.env` 已配置 `FEISHU_CHAT_ID`，也可以直接执行：

```bash
npm run feishu:chat-members
```

需要机器可读结果时：

```bash
npm run feishu:chat-members -- --json
```

### 绑定项目群聊到项目维护权限

管理员登录系统后，进入：

```text
身份与权限 -> 项目群聊绑定
```

操作顺序：

1. 点击 `同步我的飞书群聊`，系统会用当前管理员的飞书授权读取该账号加入的群聊，并把群聊和成员写入数据库。
2. 在对应项目点击 `选择群聊`。
3. 在弹窗中查看群聊名称、成员数和成员名单，选择真实项目群。
4. 系统会自动绑定该群聊并同步成员到项目成员表。

同步后系统会把该群成员写入项目成员表。项目成员再次进入系统时，会按飞书身份自动匹配可维护项目；项目维护页的项目下拉只展示该成员所在项目群对应的项目。后端接口也会校验成员是否属于项目群，避免绕过页面直接提交其他项目。

注意：

- `同步我的飞书群聊` 获取的是当前授权用户加入的群聊，不是企业内全部群聊。
- 如果飞书用户授权过期，需要重新飞书登录后再同步。
- 需要应用权限包含 `im:chat:read`、`im:chat.members:read`、`contact:user.base:readonly`。

### 当前权限策略

这版代码先采用“飞书认证 + 本系统角色映射”的方式：

- 飞书只负责确认用户身份
- 系统角色优先通过邮箱映射，也支持飞书 `open_id`、`union_id`、`user_id` 映射，避免飞书未返回邮箱时无法识别管理员

可用环境变量：

```bash
FEISHU_ALLOW_ALL_USERS="true"
FEISHU_ALLOWED_EMAILS="a@example.com,b@example.com"
FEISHU_ADMIN_EMAILS="admin@example.com"
FEISHU_ADMIN_NAMES="王康旭,赵长硕,姚翔宇"
FEISHU_IDENTITY_ADMIN_NAMES="王康旭"
FEISHU_IDENTITY_ADMIN_EMAILS=""
FEISHU_ADMIN_OPEN_IDS="ou_xxx"
FEISHU_ADMIN_UNION_IDS="on_xxx"
FEISHU_ADMIN_USER_IDS="user_xxx"
```

如果后续你要按飞书部门自动分配权限，再接通讯录接口即可。

## 13. 最推荐的实际部署顺序

```bash
1. 云服务器装 Node / Nginx / PM2
2. MySQL 建库建账号
3. 上传代码到 /srv/key-project-dashboard
4. 写 .env
5. npm install
6. npm run prisma:generate
7. npx prisma db push
8. npm run seed
9. pm2 start ecosystem.config.cjs
10. 配 Nginx
11. 配 HTTPS
```

## 16. 日常更新

本地提交并推送：

```bash
git add .
git commit -m "feat: 描述本次改动"
git push origin main
```

服务器更新：

```bash
cd /srv/key-project-dashboard
chmod +x deploy/update.sh
./deploy/update.sh
```

脚本文件：  
[deploy/update.sh](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/deploy/update.sh)

## 14. 还需要继续做的两步

1. 把前端 `localStorage` 改成 API 读写  
   当前页面还在本地存储数据，尚未真正改成多人协作模式。

2. 增加角色权限细化  
   例如：
   - 老板只读
   - PMO 可处理治理项
   - 项目成员只能维护自己负责项目

## 15. 正式版上线前建议

1. 先在测试域名部署这版
2. 用飞书登录完成联调
3. 把前端改成全量走 API
4. 做角色权限验证
5. 再切正式域名
