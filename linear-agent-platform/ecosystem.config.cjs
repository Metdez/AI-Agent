module.exports = {
  apps: [
    {
      name: "webhook-server",
      script: "src/webhook-server/index.js",
      cwd: "/opt/linear-agent-platform",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/agents/webhook-server-error.log",
      out_file: "/var/log/agents/webhook-server-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: "sync-adapter",
      script: "src/sync-adapter/index.js",
      cwd: "/opt/linear-agent-platform",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/agents/sync-adapter-error.log",
      out_file: "/var/log/agents/sync-adapter-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
