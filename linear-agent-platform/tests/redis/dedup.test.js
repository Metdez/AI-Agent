import { describe, it, expect } from "vitest";
import { isDuplicate, markProcessed } from "../../src/redis/client.js";

// These tests require a running Redis on localhost:6379
// Skip in CI/local if Redis is not available
const REDIS_AVAILABLE = process.env.REDIS_URL || false;

describe.skipIf(!REDIS_AVAILABLE)("deduplication", () => {
  const issueId = "test-issue-" + Date.now();
  const state = "In Progress";

  it("returns false for a new event", async () => {
    const result = await isDuplicate(issueId, state);
    expect(result).toBe(false);
  });

  it("returns true after marking as processed", async () => {
    const uniqueId = "dedup-test-" + Date.now();
    await markProcessed(uniqueId, "QA");
    const result = await isDuplicate(uniqueId, "QA");
    expect(result).toBe(true);
  });
});
