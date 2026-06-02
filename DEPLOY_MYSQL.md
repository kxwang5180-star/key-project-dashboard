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
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read"
COOKIE_SECURE="true"
```

## 6. 安装依赖与建表

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

说明：
- `prisma:migrate` 会按 `prisma/schema.prisma` 建表
- `seed` 会把当前 [data.js](/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/data.js) 的项目数据导入 MySQL

## 7. 启动服务

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

4. 在权限管理中申请至少这些权限：
   - `contact:user.base:readonly`
   - `auth:user.id:read`

### 环境变量

至少补齐：

```bash
FEISHU_APP_ID="cli_xxx"
FEISHU_APP_SECRET="xxx"
FEISHU_REDIRECT_URI="https://your-domain.com/api/auth/feishu/callback"
FEISHU_SCOPES="contact:user.base:readonly auth:user.id:read"
```

### 当前权限策略

这版代码先采用“飞书认证 + 本系统角色映射”的方式：

- 飞书只负责确认用户身份
- 系统角色通过邮箱映射

可用环境变量：

```bash
FEISHU_ALLOW_ALL_USERS="true"
FEISHU_ALLOWED_EMAILS="a@example.com,b@example.com"
FEISHU_ADMIN_EMAILS="admin@example.com"
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
7. npm run prisma:migrate
8. npm run seed
9. pm2 start ecosystem.config.cjs
10. 配 Nginx
11. 配 HTTPS
```

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
