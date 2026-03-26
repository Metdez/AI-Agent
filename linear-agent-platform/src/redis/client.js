import Redis from "ioredis";

const DEDUP_TTL_SECONDS = 60;

let redis;

export function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  }
  return redis;
}

export async function isDuplicate(issueId, state) {
  const key = `webhook:dedup:${issueId}:${state}`;
  const exists = await getRedis().exists(key);
  return exists === 1;
}

export async function markProcessed(issueId, state) {
  const key = `webhook:dedup:${issueId}:${state}`;
  await getRedis().set(key, "1", "EX", DEDUP_TTL_SECONDS);
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
