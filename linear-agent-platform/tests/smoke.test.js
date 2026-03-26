import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool, closePool } from "../src/queue/db.js";
import { migrate } from "../src/queue/migrate.js";
import { enqueue } from "../src/queue/enqueue.js";
import { dequeue, completeJob } from "../src/queue/dequeue.js";
import { getAgentForState } from "../src/sync-adapter/state-router.js";

describe("End-to-end: webhook → queue → route", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    await getPool().query("DELETE FROM job_queue");
  });

  it("enqueues an In Progress event, dequeues it, routes to dev agent", async () => {
    // Simulate webhook handler enqueueing a job
    const jobId = await enqueue({
      source: "linear",
      eventType: "Issue",
      issueId: "smoke-test-001",
      state: "In Progress",
      payload: { action: "update" },
    });

    expect(typeof jobId).toBe("bigint");

    // Simulate sync adapter dequeueing
    const job = await dequeue();
    expect(job).not.toBeNull();
    expect(job.issue_id).toBe("smoke-test-001");
    expect(job.state).toBe("In Progress");
    expect(job.status).toBe("claimed");

    // Route to correct agent
    const agent = getAgentForState(job.state);
    expect(agent).not.toBeNull();
    expect(agent.name).toBe("dev");
    expect(agent.nextState).toBe("In Review");

    // Mark complete
    await completeJob(job.id, { agentName: agent.name });

    const result = await getPool().query("SELECT status, result FROM job_queue WHERE id = $1", [job.id]);
    expect(result.rows[0].status).toBe("completed");
    expect(result.rows[0].result.agentName).toBe("dev");
  });
});
