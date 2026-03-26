#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/linear-agent-platform"

echo "=== Pulling latest code ==="
git -C "$APP_DIR" pull origin main

echo "=== Installing production dependencies ==="
npm --prefix "$APP_DIR" install --omit=dev

echo "=== Running database migrations ==="
node "$APP_DIR/src/queue/migrate.js"

echo "=== Reloading PM2 processes ==="
pm2 reload ecosystem.config.js --update-env

echo "=== Deploy complete ==="
