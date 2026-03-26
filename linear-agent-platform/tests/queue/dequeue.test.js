import { describe, it, expect, afterAll } from "vitest";
import { enqueue } from "../../src/queue/enqueue.js";
import { dequeue, completeJob } from "../../src/queue/dequeue.js";
import { closePool } from "../../src/queue/db.js";

const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe.skipIf(!DB_AVAILABLE)("dequeue", () => {
  afterAll(async () => { await closePool(); });

  it("claims the oldest pending job", async () => {
    const id = await enqueue({
      source: "linear",
      eventType: "Issue.update",
      issueId: "DEQUEUE-TEST-" + Date.now(),
      state: "QA",
      payload: { test: true },
    });

    const job = await dequeue();
    expect(job).not.toBeNull();
    expect(job.status).toBe("processing");
  });

  it("returns null when queue is empty after draining", async () => {
    let job;
    do {
      job = await dequeue();
      if (job) await completeJob(job.id, { drained: true });
    } while (job);

    const empty = await dequeue();
    expect(empty).toBeNull();
  });
});