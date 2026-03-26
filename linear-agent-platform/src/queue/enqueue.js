import { getPool } from "./db.js";

export async function enqueue({ source, eventType, issueId, state, payload = {} }) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO job_queue (source, event_type, issue_id, state, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [source, eventType, issueId, state, JSON.stringify(payload)]
  );
  return result.rows[0].id;
}
