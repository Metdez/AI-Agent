import { describe, it, expect, afterAll } from "vitest";
import { enqueue } from "../../src/queue/enqueue.js";
import { getPool, closePool } from "../../src/queue/db.js";

const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe.skipIf(!DB_AVAILABLE)("enqueue", () => {
  afterAll(async () => { await closePool(); });

  it("inserts a job and returns an id", async () => {
    const id = await enqueue({
      source: "linear",
      eventType: "Issue.update",
      issueId: "TEST-1",
      state: "In Progress",
      payload: { action: "update", data: { id: "TEST-1" } },
    });
    expect(id).toBeGreaterThan(0);
  });
});