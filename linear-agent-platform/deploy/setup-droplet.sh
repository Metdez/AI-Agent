#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-admin@example.com}"
APP_DIR="/opt/linear-agent-platform"
LOG_DIR="/var/log/agents"

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== Installing PM2 ==="
npm install -g pm2
pm2 startup systemd -u root --hp /root

echo "=== Installing nginx ==="
apt-get install -y nginx

echo "=== Installing certbot ==="
apt-get install -y certbot python3-certbot-nginx

echo "=== Installing PostgreSQL ==="
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Create database and user
sudo -u postgres psql -c "CREATE USER agent WITH PASSWORD 'changeme';" || true
sudo -u postgres psql -c "CREATE DATABASE agent_platform OWNER agent;" || true

echo "=== Installing Redis ==="
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

echo "=== Creating app user ==="
useradd -m -s /bin/bash agent || true

echo "=== Creating app directory ==="
mkdir -p "$APP_DIR"
chown agent:agent "$APP_DIR"

echo "=== Creating log directory ==="
mkdir -p "$LOG_DIR"
chown agent:agent "$LOG_DIR"

echo "=== Copying nginx config ==="
cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/linear-agents
ln -sf /etc/nginx/sites-available/linear-agents /etc/nginx/sites-enabled/linear-agents
rm -f /etc/nginx/sites-enabled/default

if [ -n "$DOMAIN" ]; then
  echo "=== Obtaining SSL certificate for $DOMAIN ==="
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
fi

echo "=== Reloading nginx ==="
nginx -t && systemctl reload nginx

echo "=== Done! ==="
echo "Now copy your app to $APP_DIR, create .env, then run: pm2 start ecosystem.config.js"
