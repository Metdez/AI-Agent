import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool, closePool } from "../../src/queue/db.js";
import { migrate } from "../../src/queue/migrate.js";
import { enqueue } from "../../src/queue/enqueue.js";
import { dequeue, completeJob, failJob } from "../../src/queue/dequeue.js";

describe("dequeue", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    await getPool().query("DELETE FROM job_queue");
  });

  it("returns null when queue is empty", async () => {
    const job = await dequeue();
    expect(job).toBeNull();
  });

  it("claims the oldest pending job", async () => {
    await enqueue({ source: "linear", eventType: "Issue", issueId: "a", state: "Triage", payload: {} });
    await enqueue({ source: "linear", eventType: "Issue", issueId: "b", state: "Backlog", payload: {} });

    const job = await dequeue();
    expect(job).not.toBeNull();
    expect(job.issue_id).toBe("a");
    expect(job.status).toBe("claimed");
    expect(job.claimed_at).not.toBeNull();
  });

  it("does not return same job twice", async () => {
    await enqueue({ source: "linear", eventType: "Issue", issueId: "c", state: "In Progress", payload: {} });

    const job1 = await dequeue();
    const job2 = await dequeue();
    expect(job1).not.toBeNull();
    expect(job2).toBeNull();
  });

  it("completeJob sets status to completed", async () => {
    await enqueue({ source: "linear", eventType: "Issue", issueId: "d", state: "In Review", payload: {} });
    const job = await dequeue();
    await completeJob(job.id, { agentResult: "done" });

    const result = await getPool().query("SELECT * FROM job_queue WHERE id = $1", [job.id]);
    const row = result.rows[0];
    expect(row.status).toBe("completed");
    expect(row.result).toEqual({ agentResult: "done" });
  });

  it("failJob sets status to failed", async () => {
    await enqueue({ source: "linear", eventType: "Issue", issueId: "e", state: "QA", payload: {} });
    const job = await dequeue();
    await failJob(job.id, "Something broke");

    const result = await getPool().query("SELECT * FROM job_queue WHERE id = $1", [job.id]);
    const row = result.rows[0];
    expect(row.status).toBe("failed");
    expect(row.result.error).toBe("Something broke");
  });
});
