import { getPool } from "./db.js";

export async function dequeue() {
  const pool = getPool();
  const result = await pool.query(`
    UPDATE job_queue
    SET status = 'claimed', claimed_at = NOW()
    WHERE id = (
      SELECT id FROM job_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return result.rows[0] || null;
}

export async function completeJob(jobId, result = {}) {
  const pool = getPool();
  await pool.query(
    `UPDATE job_queue SET status = 'completed', completed_at = NOW(), result = $1 WHERE id = $2`,
    [JSON.stringify(result), jobId]
  );
}

export async function failJob(jobId, error) {
  const pool = getPool();
  await pool.query(
    `UPDATE job_queue SET status = 'failed', completed_at = NOW(), result = $1 WHERE id = $2`,
    [JSON.stringify({ error: String(error) }), jobId]
  );
}
