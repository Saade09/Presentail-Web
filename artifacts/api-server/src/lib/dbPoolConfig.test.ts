import { describe, expect, it } from "vitest";
import { getDbPoolConfig, getPoolStats } from "@workspace/db";

describe("database pool configuration", () => {
  it("uses bounded defaults sized for two measured replicas", () => {
    expect(getDbPoolConfig({})).toEqual({
      max: 10,
      maxReplicaCount: 2,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statementTimeoutMillis: 15_000,
      queryTimeoutMillis: 20_000,
    });
  });

  it("accepts explicit positive budgets and rejects invalid values", () => {
    expect(
      getDbPoolConfig({
        DB_POOL_MAX: "12",
        DB_POOL_MAX_REPLICAS: "3",
        DB_POOL_CONNECTION_TIMEOUT_MS: "2500",
        DB_POOL_IDLE_TIMEOUT_MS: "45000",
        DB_POOL_STATEMENT_TIMEOUT_MS: "8000",
        DB_POOL_QUERY_TIMEOUT_MS: "9000",
      }),
    ).toEqual({
      max: 12,
      maxReplicaCount: 3,
      connectionTimeoutMillis: 2_500,
      idleTimeoutMillis: 45_000,
      statementTimeoutMillis: 8_000,
      queryTimeoutMillis: 9_000,
    });
    expect(getDbPoolConfig({ DB_POOL_MAX: "0" }).max).toBe(10);
  });

  it("exposes the configured envelope before the lazy pool is opened", () => {
    expect(getPoolStats()).toMatchObject({
      available: false,
      totalCount: 0,
      activeCount: 0,
      idleCount: 0,
      waitingCount: 0,
      max: 10,
      maxReplicaCount: 2,
      maxTotalConnections: 20,
      connectionTimeoutMillis: 5_000,
      statementTimeoutMillis: 15_000,
      queryTimeoutMillis: 20_000,
      acquisitionTimeouts: 0,
    });
  });
});