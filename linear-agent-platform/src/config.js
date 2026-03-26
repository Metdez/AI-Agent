import "dotenv/config";

const required = [
  "LINEAR_API_KEY",
  "LINEAR_TEAM_ID",
  "GITHUB_PAT",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const config = {
  linear: {
    apiKey: process.env.LINEAR_API_KEY,
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
    teamId: process.env.LINEAR_TEAM_ID,
  },
  github: {
    pat: process.env.GITHUB_PAT,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
  },
};
