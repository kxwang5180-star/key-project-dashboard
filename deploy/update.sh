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
pm2 reload "$PM2_APP_NAME" --update-env

echo "Running health check"
curl -fsS "$HEALTHCHECK_URL"
