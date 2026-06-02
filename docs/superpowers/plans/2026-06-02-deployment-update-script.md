# Deployment Update Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable deployment update script to the repository so the server can refresh code and restart the app with one command.

**Architecture:** Keep the script minimal and explicit. Store it in the repo under `deploy/` so it stays versioned with the application, and document the exact server-side invocation in the MySQL deployment guide.

**Tech Stack:** Bash, Node.js, Prisma, PM2, existing project deployment structure

---

### Task 1: Add the deployment script

**Files:**
- Create: `/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/deploy/update.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/key-project-dashboard"
PM2_APP_NAME="key-project-dashboard"
HEALTHCHECK_URL="http://127.0.0.1:3000/api/health"

echo "[1/6] Entering application directory"
cd "$APP_DIR"

echo "[2/6] Pulling latest code"
git pull origin main

echo "[3/6] Installing dependencies"
npm install

echo "[4/6] Generating Prisma client"
npm run prisma:generate

echo "[5/6] Syncing database schema"
npx prisma db push

echo "[6/6] Reloading PM2 process"
pm2 reload "$PM2_APP_NAME"

echo "Running health check"
curl -fsS "$HEALTHCHECK_URL"
```

- [ ] **Step 2: Verify shell syntax**

Run: `bash -n deploy/update.sh`  
Expected: command exits with code 0 and no output

### Task 2: Document the script

**Files:**
- Modify: `/Users/kk/Documents/Codex/2026-05-27/ai-ai-ai/DEPLOY_MYSQL.md`

- [ ] **Step 1: Add a release workflow section**

Document the normal release flow:

```md
## 日常更新

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
```

- [ ] **Step 2: Correct deployment guidance**

Use `npx prisma db push` in the operational path instead of `npm run prisma:migrate`, because the current server-side RDS account does not have shadow database privileges required by `prisma migrate dev`.
