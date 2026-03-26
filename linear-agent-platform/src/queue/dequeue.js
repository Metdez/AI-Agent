import { getPool } from "./db.js";

export async function dequeue() {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE job_queue
     SET status = 'processing', claimed_at = NOW()
     WHERE id = (
       SELECT id FROM job_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  return result.rows[0] || null;
}

export async function completeJob(jobId, result) {
  const pool = getPool();
  await pool.query(
    `UPDATE job_queue
     SET status = 'completed', completed_at = NOW(), result = $2
     WHERE id = $1`,
    [jobId, JSON.stringify(result)]
  );
}

export async function failJob(jobId, error) {
  const pool = getPool();
  await pool.query(
    `UPDATE job_queue
     SET status = 'failed', completed_at = NOW(), result = $2
     WHERE id = $1`,
    [jobId, JSON.stringify({ error: error.message || String(error) })]
  );
}