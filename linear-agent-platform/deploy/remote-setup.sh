#!/bin/bash
set -e

echo "=== Setting up PostgreSQL database ==="
sudo -u postgres psql -c "CREATE USER agent WITH PASSWORD 'agent_secret_change_me';" 2>/dev/null || echo "User agent already exists"
sudo -u postgres psql -c "CREATE DATABASE agent_platform OWNER agent;" 2>/dev/null || echo "Database agent_platform already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE agent_platform TO agent;" 2>/dev/null || echo "Privileges already granted"
echo "PostgreSQL setup done."

echo "=== Verifying services ==="
systemctl enable postgresql
systemctl enable redis-server
systemctl enable nginx
systemctl start postgresql
systemctl start redis-server
systemctl start nginx
echo "Services enabled and started."

echo "=== Creating app directory ==="
mkdir -p /opt/linear-agent-platform
mkdir -p /var/log/agents

echo "=== Cloning repo ==="
if [ -d /opt/linear-agent-platform/.git ]; then
  cd /opt/linear-agent-platform
  git pull origin main
else
  git clone https://github.com/Metdez/AI-Agent.git /tmp/ai-agent-clone
  # The linear-agent-platform is a subdirectory in the repo
  cp -r /tmp/ai-agent-clone/linear-agent-platform/* /opt/linear-agent-platform/
  cp -r /tmp/ai-agent-clone/linear-agent-platform/.* /opt/linear-agent-platform/ 2>/dev/null || true
  rm -rf /tmp/ai-agent-clone
fi

echo "=== Installing npm dependencies ==="
cd /opt/linear-agent-platform
npm install --omit=dev

echo "=== Running database migration ==="
export DATABASE_URL="postgresql://agent:agent_secret_change_me@localhost:5432/agent_platform"
node src/queue/migrate.js

echo "=== Creating .env file ==="
cat > /opt/linear-agent-platform/.env << 'ENVEOF'
# ===========================================
# Linear AI Agent Platform - Environment
# ===========================================
# Fill in your API keys below, then restart:
#   pm2 restart all
# ===========================================

# --- Linear ---
LINEAR_API_KEY=your_linear_api_key_here
LINEAR_WEBHOOK_SECRET=your_linear_webhook_secret_here
LINEAR_TEAM_ID=your_linear_team_id_here

# --- GitHub ---
GITHUB_PAT=your_github_personal_access_token_here
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_here

# --- Anthropic (for AI agents) ---
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# --- Infrastructure (pre-configured, no changes needed) ---
DATABASE_URL=postgresql://agent:agent_secret_change_me@localhost:5432/agent_platform
REDIS_URL=redis://localhost:6379

# --- Server ---
PORT=3000
NODE_ENV=production
ENVEOF

echo "=== Configuring nginx ==="
cat > /etc/nginx/sites-available/linear-agent << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/linear-agent /etc/nginx/sites-enabled/linear-agent
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Starting PM2 services ==="
cd /opt/linear-agent-platform
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Health check:"
sleep 2
curl -s http://localhost:3000/health || echo "(health check may fail until API keys are set)"
echo ""
echo ""
echo "Next steps:"
echo "  1. Edit /opt/linear-agent-platform/.env"
echo "  2. Fill in your API keys"
echo "  3. Run: pm2 restart all"
echo "  4. Verify: curl http://167.99.50.105/health"
echo "============================================"
