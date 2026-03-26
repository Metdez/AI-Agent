import { getPool, closePool } from "./db.js";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS job_queue (
    id           BIGSERIAL PRIMARY KEY,
    source       TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    issue_id     TEXT NOT NULL,
    state        TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'pending',
    claimed_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result       JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
`;

export async function migrate() {
  const pool = getPool();
  await pool.query(CREATE_TABLE);
}

// Run directly: node src/queue/migrate.js
if (process.argv[1] && process.argv[1].endsWith("migrate.js")) {
  migrate()
    .then(() => { console.log("Migration complete"); closePool(); })
    .catch((err) => { console.error("Migration failed", err); process.exit(1); });
}
