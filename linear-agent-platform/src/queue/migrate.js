import "dotenv/config";
import { getPool, closePool } from "./db.js";

async function migrate() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id SERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      issue_id VARCHAR(100),
      state VARCHAR(100),
      payload JSONB NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
    CREATE INDEX IF NOT EXISTS idx_job_queue_created ON job_queue(created_at);
  `);

  console.log("Migration complete: job_queue table ready");
  await closePool();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});