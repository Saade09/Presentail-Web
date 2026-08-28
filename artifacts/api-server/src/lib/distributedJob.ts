import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { recordWorkerRun, recordWorkerSkip } from "./operationalMetrics";

export type DistributedJobContext = {
  jobName: string;
  windowStart: Date;
  ownerToken: string;
  generation: number;
  signal: AbortSignal;
};

export type DistributedJobResult<T> =
  | { status: "ran"; value: T; context: DistributedJobContext }
  | {
      status: "skipped";
      reason: "claimed" | "database-error";
      windowStart: Date;
      generation: number | null;
    };

export type BackgroundJobSnapshot<T> = {
  payload: T;
  sourceWindowStart: Date;
  sourceGeneration: number;
  updatedAt: Date;
};

type ClaimInput = {
  jobName: string;
  windowStart: Date;
  ownerToken: string;
  leaseMs: number;
  now: Date;
};

type DistributedJobRuntimeLock = {
  signal: AbortSignal;
  release(): Promise<void>;
};

export interface BackgroundJobLeaseStore {
  acquireRuntimeLock(jobName: string): Promise<DistributedJobRuntimeLock | null>;
  claim(input: ClaimInput): Promise<{ generation: number } | null>;
  current(
    jobName: string,
  ): Promise<{ windowStart: Date; generation: number } | null>;
  recordSkip(jobName: string): Promise<void>;
  renew(context: DistributedJobContext, leaseMs: number): Promise<boolean>;
  finish(
    context: DistributedJobContext,
    outcome: { status: "succeeded" | "failed"; durationMs: number; error?: string },
  ): Promise<boolean>;
  saveSnapshot(
    context: DistributedJobContext,
    snapshotName: string,
    payload: unknown,
  ): Promise<boolean>;
  loadSnapshot<T>(
    snapshotName: string,
  ): Promise<BackgroundJobSnapshot<T> | null>;
}

const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

function leaseFlagName(jobName: string): string {
  const normalized = jobName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `DISTRIBUTED_JOB_${normalized}_LEASE_ENABLED`;
}

export function isDistributedLeaseEnabled(jobName: string): boolean {
  const globalValue = process.env.DISTRIBUTED_JOB_LEASES_ENABLED;
  if (globalValue && FALSE_VALUES.has(globalValue.toLowerCase())) return false;
  const jobValue = process.env[leaseFlagName(jobName)];
  return !jobValue || !FALSE_VALUES.has(jobValue.toLowerCase());
}

class PostgresBackgroundJobLeaseStore implements BackgroundJobLeaseStore {
  async acquireRuntimeLock(
    jobName: string,
  ): Promise<DistributedJobRuntimeLock | null> {
    const client = await pool.connect();
    const ownership = new AbortController();
    const onError = (error: Error) => ownership.abort(error);
    client.on("error", onError);
    try {
      const result = await client.query<{ acquired: boolean }>(
        `
          SELECT pg_try_advisory_lock(
            hashtextextended($1, 4732)
          ) AS acquired
        `,
        [jobName],
      );
      if (!result.rows[0]?.acquired) {
        client.off("error", onError);
        client.release();
        return null;
      }
    } catch (error) {
      client.off("error", onError);
      client.release(true);
      throw error;
    }

    let released = false;
    return {
      signal: ownership.signal,
      release: async () => {
        if (released) return;
        released = true;
        client.off("error", onError);
        try {
          await client.query(
            `SELECT pg_advisory_unlock(hashtextextended($1, 4732))`,
            [jobName],
          );
          client.release();
        } catch {
          client.release(true);
        }
      },
    };
  }

  async claim(input: ClaimInput): Promise<{ generation: number } | null> {
    const result = await pool.query<{ generation: number }>(
      `
        INSERT INTO background_job_leases (
          job_name, window_start, owner_token, lease_until, generation,
          status, run_count, last_started_at, updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          now() + ($4 * interval '1 millisecond'),
          1,
          'running',
          1,
          now(),
          now()
        )
        ON CONFLICT (job_name) DO UPDATE SET
          window_start = EXCLUDED.window_start,
          owner_token = EXCLUDED.owner_token,
          lease_until = EXCLUDED.lease_until,
          generation = background_job_leases.generation + 1,
          status = 'running',
          run_count = background_job_leases.run_count + 1,
          last_started_at = EXCLUDED.last_started_at,
          last_error = NULL,
          updated_at = EXCLUDED.updated_at
        WHERE (
          background_job_leases.window_start < EXCLUDED.window_start
          AND (
            background_job_leases.status <> 'running'
            OR background_job_leases.lease_until IS NULL
            OR background_job_leases.lease_until <= now()
          )
        ) OR (
          background_job_leases.window_start = EXCLUDED.window_start
          AND background_job_leases.status <> 'succeeded'
          AND (
            background_job_leases.lease_until IS NULL
            OR background_job_leases.lease_until <= now()
          )
        )
        RETURNING generation
      `,
      [
        input.jobName,
        input.windowStart,
        input.ownerToken,
        input.leaseMs,
      ],
    );
    return result.rows[0] ?? null;
  }

  async current(
    jobName: string,
  ): Promise<{ windowStart: Date; generation: number } | null> {
    const result = await pool.query<{
      window_start: Date;
      generation: number;
    }>(
      `
        SELECT window_start, generation
        FROM background_job_leases
        WHERE job_name = $1
          AND (
            status = 'succeeded'
            OR (status = 'running' AND lease_until > now())
          )
      `,
      [jobName],
    );
    const row = result.rows[0];
    return row
      ? {
          windowStart: new Date(row.window_start),
          generation: row.generation,
        }
      : null;
  }

  async recordSkip(jobName: string): Promise<void> {
    await pool.query(
      `
        UPDATE background_job_leases
        SET skip_count = skip_count + 1, updated_at = now()
        WHERE job_name = $1
      `,
      [jobName],
    );
  }

  async renew(
    context: DistributedJobContext,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await pool.query(
      `
        UPDATE background_job_leases
        SET lease_until = now() + ($5 * interval '1 millisecond'),
            updated_at = now()
        WHERE job_name = $1
          AND window_start = $2
          AND owner_token = $3
          AND generation = $4
          AND status = 'running'
      `,
      [
        context.jobName,
        context.windowStart,
        context.ownerToken,
        context.generation,
        leaseMs,
      ],
    );
    return result.rowCount === 1;
  }

  async finish(
    context: DistributedJobContext,
    outcome: {
      status: "succeeded" | "failed";
      durationMs: number;
      error?: string;
    },
  ): Promise<boolean> {
    const result = await pool.query(
      `
        UPDATE background_job_leases
        SET status = $5,
            lease_until = NULL,
            owner_token = NULL,
            last_finished_at = now(),
            last_duration_ms = $6,
            last_error = $7,
            success_count = success_count + CASE WHEN $5 = 'succeeded' THEN 1 ELSE 0 END,
            failure_count = failure_count + CASE WHEN $5 = 'failed' THEN 1 ELSE 0 END,
            updated_at = now()
        WHERE job_name = $1
          AND window_start = $2
          AND owner_token = $3
          AND generation = $4
      `,
      [
        context.jobName,
        context.windowStart,
        context.ownerToken,
        context.generation,
        outcome.status,
        outcome.durationMs,
        outcome.error ?? null,
      ],
    );
    return result.rowCount === 1;
  }

  async saveSnapshot(
    context: DistributedJobContext,
    snapshotName: string,
    payload: unknown,
  ): Promise<boolean> {
    const result = await pool.query(
      `
        WITH current_owner AS (
          SELECT 1
          FROM background_job_leases
          WHERE job_name = $1
            AND window_start = $2
            AND owner_token = $3
            AND generation = $4
            AND status = 'running'
            AND lease_until > now()
        )
        INSERT INTO background_job_snapshots (
          snapshot_name,
          payload,
          source_window_start,
          source_generation,
          updated_at
        )
        SELECT $5, $6::jsonb, $2, $4, now()
        FROM current_owner
        ON CONFLICT (snapshot_name) DO UPDATE SET
          payload = EXCLUDED.payload,
          source_window_start = EXCLUDED.source_window_start,
          source_generation = EXCLUDED.source_generation,
          updated_at = EXCLUDED.updated_at
      `,
      [
        context.jobName,
        context.windowStart,
        context.ownerToken,
        context.generation,
        snapshotName,
        JSON.stringify(payload),
      ],
    );
    return result.rowCount === 1;
  }

  async loadSnapshot<T>(
    snapshotName: string,
  ): Promise<BackgroundJobSnapshot<T> | null> {
    const result = await pool.query<{
      snapshot: T;
      source_window_start: Date;
      source_generation: number;
      snapshot_updated_at: Date;
    }>(
      `
        SELECT
          payload AS snapshot,
          source_window_start,
          source_generation,
          updated_at AS snapshot_updated_at
        FROM background_job_snapshots
        WHERE snapshot_name = $1
      `,
      [snapshotName],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      payload: row.snapshot,
      sourceWindowStart: new Date(row.source_window_start),
      sourceGeneration: row.source_generation,
      updatedAt: new Date(row.snapshot_updated_at),
    };
  }
}

const postgresStore = new PostgresBackgroundJobLeaseStore();

type RunnerDependencies = {
  store?: BackgroundJobLeaseStore;
  now?: () => Date;
  ownerToken?: () => string;
};

export function createDistributedJobRunner(
  dependencies: RunnerDependencies = {},
) {
  const store = dependencies.store ?? postgresStore;
  const now = dependencies.now ?? (() => new Date());
  const ownerToken =
    dependencies.ownerToken ??
    (() => `${process.pid}:${randomUUID()}`);

  return async function runDistributedJob<T>(options: {
    jobName: string;
    intervalMs: number;
    leaseMs?: number;
    task: (context: DistributedJobContext) => Promise<T>;
  }): Promise<DistributedJobResult<T>> {
    const { jobName, intervalMs, task } = options;
    const leaseMs = options.leaseMs ?? Math.max(intervalMs, 5 * 60_000);
    if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
      throw new Error(`Invalid distributed job interval for ${jobName}`);
    }

    if (!isDistributedLeaseEnabled(jobName)) {
      logger.warn(
        { jobName, flag: leaseFlagName(jobName) },
        "background job distributed lease disabled; using legacy scheduling",
      );
      const current = now();
      const context: DistributedJobContext = {
        jobName,
        windowStart: new Date(
          Math.floor(current.getTime() / intervalMs) * intervalMs,
        ),
        ownerToken: "lease-disabled",
        generation: 0,
        signal: new AbortController().signal,
      };
      const startedAt = Date.now();
      try {
        const value = await task(context);
        recordWorkerRun(jobName, "success", Date.now() - startedAt);
        return { status: "ran", value, context };
      } catch (error) {
        recordWorkerRun(jobName, "failure", Date.now() - startedAt);
        throw error;
      }
    }

    const current = now();
    const windowStart = new Date(
      Math.floor(current.getTime() / intervalMs) * intervalMs,
    );
    const token = ownerToken();
    let runtimeLock: DistributedJobRuntimeLock | null;
    try {
      runtimeLock = await store.acquireRuntimeLock(jobName);
    } catch (error) {
      recordWorkerSkip(jobName, "database-error");
      logger.error(
        {
          jobName,
          err: error instanceof Error ? error.message : String(error),
        },
        "background job runtime lock acquisition failed; job skipped",
      );
      return {
        status: "skipped",
        reason: "database-error",
        windowStart,
        generation: null,
      };
    }

    if (!runtimeLock) {
      let currentClaim: {
        windowStart: Date;
        generation: number;
      } | null = null;
      try {
        for (let attempt = 0; attempt < 20 && !currentClaim; attempt += 1) {
          currentClaim = await store.current(jobName);
          if (!currentClaim) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        await store.recordSkip(jobName);
      } catch (error) {
        logger.warn(
          {
            jobName,
            err: error instanceof Error ? error.message : String(error),
          },
          "background job runtime-lock skip metric failed",
        );
      }
      recordWorkerSkip(jobName, "claimed");
      return {
        status: "skipped",
        reason: "claimed",
        windowStart: currentClaim?.windowStart ?? windowStart,
        generation: currentClaim?.generation ?? null,
      };
    }

    let claim: { generation: number } | null;
    try {
      claim = await store.claim({
        jobName,
        windowStart,
        ownerToken: token,
        leaseMs,
        now: current,
      });
    } catch (error) {
      recordWorkerSkip(jobName, "database-error");
      await runtimeLock.release();
      logger.error(
        {
          jobName,
          windowStart: windowStart.toISOString(),
          err: error instanceof Error ? error.message : String(error),
        },
        "background job lease acquisition failed; job skipped",
      );
      return {
        status: "skipped",
        reason: "database-error",
        windowStart,
        generation: null,
      };
    }

    if (!claim) {
      let currentClaim: {
        windowStart: Date;
        generation: number;
      } | null = null;
      try {
        [currentClaim] = await Promise.all([
          store.current(jobName),
          store.recordSkip(jobName),
        ]);
      } catch (error) {
        logger.warn(
          {
            jobName,
            err: error instanceof Error ? error.message : String(error),
          },
          "background job skip metric failed",
        );
      }
      recordWorkerSkip(jobName, "claimed");
      logger.info(
        { jobName, windowStart: windowStart.toISOString() },
        "background job skipped; due window already claimed",
      );
      await runtimeLock.release();
      return {
        status: "skipped",
        reason: "claimed",
        windowStart: currentClaim?.windowStart ?? windowStart,
        generation: currentClaim?.generation ?? null,
      };
    }

    const ownership = new AbortController();
    const context: DistributedJobContext = {
      jobName,
      windowStart,
      ownerToken: token,
      generation: claim.generation,
      signal: AbortSignal.any([ownership.signal, runtimeLock.signal]),
    };
    const startedAt = Date.now();
    let renewal = Promise.resolve();
    const heartbeatMs = Math.max(1_000, Math.floor(leaseMs / 3));
    const heartbeat = setInterval(() => {
      renewal = renewal.then(async () => {
        try {
          const renewed = await store.renew(context, leaseMs);
          if (!renewed) {
            ownership.abort(
              new Error(`Distributed lease lost for ${jobName}`),
            );
            logger.error(
              { jobName, generation: context.generation },
              "background job lease ownership was lost",
            );
          }
        } catch (error) {
          ownership.abort(error);
          logger.warn(
            {
              jobName,
              err: error instanceof Error ? error.message : String(error),
            },
            "background job lease renewal failed",
          );
        }
      });
    }, heartbeatMs);
    heartbeat.unref?.();

    let value: T;
    try {
      value = await task(context);
      context.signal.throwIfAborted();
    } catch (error) {
      clearInterval(heartbeat);
      await renewal;
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await store.finish(context, {
          status: "failed",
          durationMs,
          error: message.slice(0, 1_000),
        });
      } catch (finishError) {
        logger.error(
          {
            jobName,
            err:
              finishError instanceof Error
                ? finishError.message
                : String(finishError),
          },
          "background job failure metric could not be recorded",
        );
      }
      recordWorkerRun(jobName, "failure", durationMs);
      logger.error(
        {
          jobName,
          windowStart: windowStart.toISOString(),
          generation: context.generation,
          durationMs,
          err: message,
        },
        "background job failed",
      );
      await runtimeLock.release();
      throw error;
    }

    clearInterval(heartbeat);
    await renewal;
    const durationMs = Date.now() - startedAt;
    let finishRecorded = false;
    try {
      finishRecorded = await store.finish(context, {
        status: "succeeded",
        durationMs,
      });
      if (!finishRecorded) {
        logger.error(
          { jobName, generation: context.generation },
          "background job completed after losing lease; success metric not recorded",
        );
      }
    } catch (error) {
      logger.error(
        {
          jobName,
          generation: context.generation,
          err: error instanceof Error ? error.message : String(error),
        },
        "background job completed but success metric could not be recorded",
      );
    }
    recordWorkerRun(
      jobName,
      finishRecorded ? "success" : "unowned",
      durationMs,
    );
    logger.info(
      {
        jobName,
        windowStart: windowStart.toISOString(),
        generation: context.generation,
        durationMs,
        finishRecorded,
      },
      "background job completed",
    );
    await runtimeLock.release();
    return { status: "ran", value, context };
  };
}

export const runDistributedJob = createDistributedJobRunner();

export async function saveBackgroundJobSnapshot(
  context: DistributedJobContext,
  payload: unknown,
  snapshotName = context.jobName,
): Promise<void> {
  if (context.generation === 0) return;
  const saved = await postgresStore.saveSnapshot(
    context,
    snapshotName,
    payload,
  );
  if (!saved) {
    throw new Error(
      `Lost distributed job lease before saving ${snapshotName} snapshot`,
    );
  }
}

export async function loadBackgroundJobSnapshot<T>(
  snapshotName: string,
): Promise<BackgroundJobSnapshot<T> | null> {
  return postgresStore.loadSnapshot<T>(snapshotName);
}

export async function waitForBackgroundJobSnapshot<T>(
  jobName: string,
  expected:
    | { windowStart: Date; generation: number | null }
    | null,
  timeoutMs = 60_000,
): Promise<BackgroundJobSnapshot<T> | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const snapshot = await loadBackgroundJobSnapshot<T>(jobName);
      if (
        snapshot &&
        (!expected ||
          (snapshot.sourceWindowStart.getTime() ===
            expected.windowStart.getTime() &&
            expected.generation !== null &&
            snapshot.sourceGeneration === expected.generation))
      ) {
        return snapshot;
      }
    } catch (error) {
      logger.warn(
        {
          jobName,
          err: error instanceof Error ? error.message : String(error),
        },
        "background job snapshot read failed",
      );
      return null;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      timer.unref?.();
    });
  } while (Date.now() < deadline);
  return null;
}