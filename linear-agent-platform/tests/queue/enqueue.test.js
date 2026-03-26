import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPool, closePool } from "../../src/queue/db.js";
import { migrate } from "../../src/queue/migrate.js";
import { enqueue } from "../../src/queue/enqueue.js";

describe("enqueue", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    await getPool().query("DELETE FROM job_queue");
  });

  it("inserts a job and returns an id", async () => {
    const id = await enqueue({
      source: "linear",
      eventType: "Issue",
      issueId: "abc123",
      state: "In Progress",
      payload: { action: "update" },
    });
    expect(typeof id).toBe("bigint");
  });

  it("stores the correct fields", async () => {
    await enqueue({
      source: "linear",
      eventType: "Issue",
      issueId: "xyz789",
      state: "Triage",
      payload: { foo: "bar" },
    });

    const result = await getPool().query("SELECT * FROM job_queue WHERE issue_id = 'xyz789'");
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.source).toBe("linear");
    expect(row.event_type).toBe("Issue");
    expect(row.state).toBe("Triage");
    expect(row.status).toBe("pending");
    expect(row.payload).toEqual({ foo: "bar" });
  });
});
