import { describe, expect, it } from "vitest";
import {
  createDistributedJobRunner,
  shutdownDistributedJobs,
  type BackgroundJobLeaseStore,
  type BackgroundJobSnapshot,
  type DistributedJobContext,
} from "./distributedJob";

type Row = {
  windowStart: Date;
  ownerToken: string | null;
  leaseUntil: Date | null;
  generation: number;
  status: "running" | "succeeded" | "failed";
  skips: number;
  snapshot?: BackgroundJobSnapshot<unknown>;
};

class InMemoryLeaseStore implements BackgroundJobLeaseStore {
  readonly rows = new Map<string, Row>();
  readonly runtimeLocks = new Set<string>();
  readonly runtimeControllers = new Map<string, AbortController>();

  async acquireRuntimeLock(
    jobName: string,
  ): Promise<{ signal: AbortSignal; release(): Promise<void> } | null> {
    if (this.runtimeLocks.has(jobName)) return null;
    const controller = new AbortController();
    this.runtimeLocks.add(jobName);
    this.runtimeControllers.set(jobName, controller);
    return {
      signal: controller.signal,
      release: async () => {
        if (this.runtimeControllers.get(jobName) === controller) {
          this.runtimeLocks.delete(jobName);
          this.runtimeControllers.delete(jobName);
        }
      },
    };
  }

  loseRuntimeLock(jobName: string): void {
    this.runtimeControllers
      .get(jobName)
      ?.abort(new Error("simulated PostgreSQL session loss"));
    this.runtimeControllers.delete(jobName);
    this.runtimeLocks.delete(jobName);
  }

  async claim(input: {
    jobName: string;
    windowStart: Date;
    ownerToken: string;
    leaseMs: number;
    now: Date;
  }): Promise<{ generation: number } | null> {
    const row = this.rows.get(input.jobName);
    const expired = !row?.leaseUntil || row.leaseUntil <= input.now;
    const mayReplaceOlder =
      !!row &&
      row.windowStart < input.windowStart &&
      (row.status !== "running" || expired);
    const mayTakeSameWindow =
      !!row &&
      row.windowStart.getTime() === input.windowStart.getTime() &&
      row.status !== "succeeded" &&
      expired;
    if (row && !mayReplaceOlder && !mayTakeSameWindow) return null;
    const generation = (row?.generation ?? 0) + 1;
    this.rows.set(input.jobName, {
      windowStart: input.windowStart,
      ownerToken: input.ownerToken,
      leaseUntil: new Date(input.now.getTime() + input.leaseMs),
      generation,
      status: "running",
      skips: row?.skips ?? 0,
      snapshot: row?.snapshot,
    });
    return { generation };
  }

  async recordSkip(jobName: string): Promise<void> {
    const row = this.rows.get(jobName);
    if (row) row.skips++;
  }

  async current(
    jobName: string,
  ): Promise<{ windowStart: Date; generation: number } | null> {
    const row = this.rows.get(jobName);
    return row
      ? { windowStart: row.windowStart, generation: row.generation }
      : null;
  }

  async renew(
    context: DistributedJobContext,
    leaseMs: number,
  ): Promise<boolean> {
    const row = this.rows.get(context.jobName);
    if (
      !row ||
      row.ownerToken !== context.ownerToken ||
      row.generation !== context.generation
    ) {
      return false;
    }
    row.leaseUntil = new Date(Date.now() + leaseMs);
    return true;
  }

  async finish(
    context: DistributedJobContext,
    outcome: { status: "succeeded" | "failed" },
  ): Promise<boolean> {
    const row = this.rows.get(context.jobName);
    if (
      !row ||
      row.ownerToken !== context.ownerToken ||
      row.generation !== context.generation
    ) {
      return false;
    }
    row.status = outcome.status;
    row.ownerToken = null;
    row.leaseUntil = null;
    return true;
  }

  async saveSnapshot(
    context: DistributedJobContext,
    _snapshotName: string,
    payload: unknown,
  ): Promise<boolean> {
    const row = this.rows.get(context.jobName);
    if (
      !row ||
      row.ownerToken !== context.ownerToken ||
      row.generation !== context.generation
    ) {
      return false;
    }
    row.snapshot = {
      payload,
      sourceWindowStart: context.windowStart,
      sourceGeneration: context.generation,
      updatedAt: new Date(),
    };
    return true;
  }

  async loadSnapshot<T>(
    jobName: string,
  ): Promise<BackgroundJobSnapshot<T> | null> {
    return (
      (this.rows.get(jobName)?.snapshot as BackgroundJobSnapshot<T> | undefined) ??
      null
    );
  }
}

describe("distributed background jobs", () => {
  it("allows only one of two API processes to execute a due window", async () => {
    const store = new InMemoryLeaseStore();
    const now = () => new Date("2026-08-27T10:00:05.000Z");
    const processA = createDistributedJobRunner({
      store,
      now,
      ownerToken: () => "process-a",
    });
    const processB = createDistributedJobRunner({
      store,
      now,
      ownerToken: () => "process-b",
    });
    let executions = 0;
    const task = async () => {
      executions++;
      await Promise.resolve();
    };

    const results = await Promise.all([
      processA({ jobName: "catalog-images", intervalMs: 60_000, task }),
      processB({ jobName: "catalog-images", intervalMs: 60_000, task }),
    ]);

    expect(executions).toBe(1);
    expect(results.filter((result) => result.status === "ran")).toHaveLength(1);
    expect(results.filter((result) => result.status === "skipped")).toHaveLength(1);
    expect(store.rows.get("catalog-images")?.skips).toBe(1);
  });

  it("permits takeover after a stopped owner's lease expires", async () => {
    const store = new InMemoryLeaseStore();
    let current = new Date("2026-08-27T10:00:05.000Z");
    const runner = createDistributedJobRunner({
      store,
      now: () => current,
      ownerToken: () => "replacement-process",
    });
    store.rows.set("seo-audit", {
      windowStart: new Date("2026-08-27T10:00:00.000Z"),
      ownerToken: "stopped-process",
      leaseUntil: new Date("2026-08-27T10:01:00.000Z"),
      generation: 7,
      status: "running",
      skips: 0,
    });

    const beforeExpiry = await runner({
      jobName: "seo-audit",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: async () => "unexpected",
    });
    expect(beforeExpiry.status).toBe("skipped");

    current = new Date("2026-08-27T10:01:01.000Z");
    const afterExpiry = await runner({
      jobName: "seo-audit",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: async () => "taken-over",
    });

    expect(afterExpiry.status).toBe("ran");
    expect(store.rows.get("seo-audit")?.generation).toBe(8);
    expect(store.rows.get("seo-audit")?.status).toBe("succeeded");
  });

  it("does not overlap a live owner after the visible lease expires", async () => {
    const store = new InMemoryLeaseStore();
    let releaseTask!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseTask = resolve;
    });
    const first = createDistributedJobRunner({
      store,
      now: () => new Date("2026-08-27T10:00:00.000Z"),
      ownerToken: () => "process-a",
    })({
      jobName: "long-running-job",
      intervalMs: 60_000,
      leaseMs: 1_000,
      task: async () => blocked,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await createDistributedJobRunner({
      store,
      now: () => new Date("2026-08-27T10:02:00.000Z"),
      ownerToken: () => "process-b",
    })({
      jobName: "long-running-job",
      intervalMs: 60_000,
      leaseMs: 1_000,
      task: async () => {
        throw new Error("second process overlapped the live owner");
      },
    });

    expect(second).toMatchObject({ status: "skipped", reason: "claimed" });
    releaseTask();
    await first;
    expect(store.runtimeLocks.size).toBe(0);
  });

  it("stops a connection-lost owner before takeover performs more work", async () => {
    const store = new InMemoryLeaseStore();
    let oldOwnerEffects = 0;
    let replacementEffects = 0;
    const first = createDistributedJobRunner({
      store,
      now: () => new Date("2026-08-27T10:00:00.000Z"),
      ownerToken: () => "process-a",
    })({
      jobName: "connection-loss-job",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: async (context) => {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(context.signal.reason),
            { once: true },
          );
        });
        oldOwnerEffects++;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    store.loseRuntimeLock("connection-loss-job");
    await expect(first).rejects.toThrow("simulated PostgreSQL session loss");

    const replacement = await createDistributedJobRunner({
      store,
      now: () => new Date("2026-08-27T10:02:00.000Z"),
      ownerToken: () => "process-b",
    })({
      jobName: "connection-loss-job",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: async () => {
        replacementEffects++;
      },
    });

    expect(replacement.status).toBe("ran");
    expect(oldOwnerEffects).toBe(0);
    expect(replacementEffects).toBe(1);
  });

  it("fails closed when durable lease acquisition is unavailable", async () => {
    const store = new InMemoryLeaseStore();
    store.claim = async () => {
      throw new Error("database unavailable");
    };
    const runner = createDistributedJobRunner({ store });
    let executed = false;

    const result = await runner({
      jobName: "os-products",
      intervalMs: 60_000,
      task: async () => {
        executed = true;
      },
    });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "database-error",
    });
    expect(executed).toBe(false);
  });

  it("aborts a job at its explicit deadline and releases ownership", async () => {
    const store = new InMemoryLeaseStore();
    const runner = createDistributedJobRunner({ store });
    const run = runner({
      jobName: "deadline-job",
      intervalMs: 60_000,
      timeoutMs: 1_000,
      task: async (context) => {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(context.signal.reason), {
            once: true,
          });
        });
      },
    });

    await expect(run).rejects.toThrow("Distributed job timed out");
    expect(store.runtimeLocks.size).toBe(0);
    expect(store.rows.get("deadline-job")?.status).toBe("failed");
  });

  it("keeps the ownership fence while a timed-out task is still settling", async () => {
    const store = new InMemoryLeaseStore();
    const runner = createDistributedJobRunner({ store });
    let settleTask!: () => void;
    const run = runner({
      jobName: "non-cooperative-job",
      intervalMs: 60_000,
      timeoutMs: 1_000,
      task: () => new Promise<void>((resolve) => {
        settleTask = resolve;
      }),
    });

    await expect(run).rejects.toThrow("Distributed job timed out");
    expect(store.runtimeLocks.size).toBe(1);

    settleTask();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.runtimeLocks.size).toBe(0);
    expect(store.rows.get("non-cooperative-job")?.status).toBe("failed");
  });

  it("fences the process if the retained timeout lock is later lost", async () => {
    const store = new InMemoryLeaseStore();
    let settleTask!: () => void;
    const fatalLosses: string[] = [];
    const runner = createDistributedJobRunner({
      store,
      onFatalOwnershipLoss: (jobName) => fatalLosses.push(jobName),
    });
    const run = runner({
      jobName: "timeout-then-session-loss",
      intervalMs: 60_000,
      timeoutMs: 1_000,
      task: () => new Promise<void>((resolve) => {
        settleTask = resolve;
      }),
    });

    await expect(run).rejects.toThrow("Distributed job timed out");
    expect(store.rows.get("timeout-then-session-loss")?.status).toBe("running");
    store.loseRuntimeLock("timeout-then-session-loss");
    expect(fatalLosses).toEqual(["timeout-then-session-loss"]);

    const replacement = await runner({
      jobName: "timeout-then-session-loss",
      intervalMs: 60_000,
      task: async () => {
        throw new Error("replacement must remain fenced");
      },
    });
    expect(replacement.status).toBe("skipped");
    settleTask();
  });

  it("keeps the durable lease and fences the process on non-cooperative session loss", async () => {
    const store = new InMemoryLeaseStore();
    let settleTask!: () => void;
    const fatalLosses: string[] = [];
    const runner = createDistributedJobRunner({
      store,
      now: () => new Date("2026-08-27T10:00:01.000Z"),
      onFatalOwnershipLoss: (jobName) => fatalLosses.push(jobName),
    });
    const run = runner({
      jobName: "lost-session-job",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: () => new Promise<void>((resolve) => {
        settleTask = resolve;
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.loseRuntimeLock("lost-session-job");

    await expect(run).rejects.toThrow("simulated PostgreSQL session loss");
    expect(fatalLosses).toEqual(["lost-session-job"]);
    expect(store.rows.get("lost-session-job")?.status).toBe("running");

    let replacementRan = false;
    const immediateReplacement = await runner({
      jobName: "lost-session-job",
      intervalMs: 60_000,
      leaseMs: 60_000,
      task: async () => {
        replacementRan = true;
      },
    });
    expect(immediateReplacement.status).toBe("skipped");
    expect(replacementRan).toBe(false);
    settleTask();
  });

  it.each(["returned false", "threw"] as const)(
    "fences the process when heartbeat renewal %s during non-cooperative work",
    async (failureMode) => {
      const store = new InMemoryLeaseStore();
      let settleTask!: () => void;
      const fatalLosses: string[] = [];
      store.renew = async () => {
        if (failureMode === "threw") throw new Error("renewal unavailable");
        return false;
      };
      const runner = createDistributedJobRunner({
        store,
        onFatalOwnershipLoss: (jobName) => fatalLosses.push(jobName),
      });
      const run = runner({
        jobName: `renewal-${failureMode}`,
        intervalMs: 60_000,
        leaseMs: 3_000,
        timeoutMs: 5_000,
        task: () => new Promise<void>((resolve) => {
          settleTask = resolve;
        }),
      });

      await expect(run).rejects.toThrow(
        failureMode === "threw" ? "renewal unavailable" : "Distributed lease lost",
      );
      expect(fatalLosses).toEqual([`renewal-${failureMode}`]);
      expect(store.rows.get(`renewal-${failureMode}`)?.status).toBe("running");

      let replacementRan = false;
      const replacement = await runner({
        jobName: `renewal-${failureMode}`,
        intervalMs: 60_000,
        leaseMs: 3_000,
        task: async () => {
          replacementRan = true;
        },
      });
      expect(replacement.status).toBe("skipped");
      expect(replacementRan).toBe(false);
      settleTask();
    },
  );

  it("aborts in-flight work and releases locks during runtime shutdown", async () => {
    const store = new InMemoryLeaseStore();
    const runner = createDistributedJobRunner({ store });
    const run = runner({
      jobName: "shutdown-job",
      intervalMs: 60_000,
      task: async (context) => {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(context.signal.reason), {
            once: true,
          });
        });
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await shutdownDistributedJobs(1_000);
    await expect(run).rejects.toThrow("shutting down");
    expect(store.runtimeLocks.size).toBe(0);
  });
});