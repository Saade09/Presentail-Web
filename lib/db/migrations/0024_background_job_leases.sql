-- Cross-replica ownership, execution metrics, and optional shared snapshots
-- for recurring API jobs.
CREATE TABLE IF NOT EXISTS background_job_leases (
  job_name text PRIMARY KEY NOT NULL,
  window_start timestamptz NOT NULL,
  owner_token text,
  lease_until timestamptz,
  generation integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  run_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  skip_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_duration_ms integer,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_job_leases_status_check
    CHECK (status IN ('idle', 'running', 'succeeded', 'failed'))
);

CREATE TABLE IF NOT EXISTS background_job_snapshots (
  snapshot_name text PRIMARY KEY NOT NULL,
  payload jsonb NOT NULL,
  source_window_start timestamptz NOT NULL,
  source_generation integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);