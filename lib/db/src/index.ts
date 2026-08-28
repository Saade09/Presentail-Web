import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type Schema = typeof schema;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<Schema> | null = null;

export type DbPoolStats = {
  available: boolean;
  totalCount: number;
  idleCount: number;
  activeCount: number;
  waitingCount: number;
  max: number | null;
  maxReplicaCount: number;
  maxTotalConnections: number | null;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
  queryTimeoutMillis: number;
  acquisitions: number;
  acquisitionTimeouts: number;
  connectionErrors: number;
  queryTimeouts: number;
  statementTimeouts: number;
  idleClientErrors: number;
};

const DEFAULT_POOL_MAX = 10;
const DEFAULT_MAX_REPLICAS = 2;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
const DEFAULT_QUERY_TIMEOUT_MS = 20_000;

function positiveInt(
  raw: string | undefined,
  fallback: number,
  maximum = 60 * 60 * 1000,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), maximum);
}

export type DbPoolConfig = {
  max: number;
  maxReplicaCount: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
  queryTimeoutMillis: number;
};

export function getDbPoolConfig(
  env: NodeJS.ProcessEnv = process.env,
): DbPoolConfig {
  return {
    max: positiveInt(env.DB_POOL_MAX, DEFAULT_POOL_MAX, 100),
    maxReplicaCount: positiveInt(
      env.DB_POOL_MAX_REPLICAS,
      DEFAULT_MAX_REPLICAS,
      100,
    ),
    connectionTimeoutMillis: positiveInt(
      env.DB_POOL_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    idleTimeoutMillis: positiveInt(
      env.DB_POOL_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS,
    ),
    statementTimeoutMillis: positiveInt(
      env.DB_POOL_STATEMENT_TIMEOUT_MS,
      DEFAULT_STATEMENT_TIMEOUT_MS,
    ),
    queryTimeoutMillis: positiveInt(
      env.DB_POOL_QUERY_TIMEOUT_MS,
      DEFAULT_QUERY_TIMEOUT_MS,
    ),
  };
}

const poolCounters = {
  acquisitions: 0,
  acquisitionTimeouts: 0,
  connectionErrors: 0,
  queryTimeouts: 0,
  statementTimeouts: 0,
  idleClientErrors: 0,
};

function isTimeoutError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "57014" ||
    code === "ETIMEOUT" ||
    code === "ETIMEDOUT" ||
    /timeout|timed out/i.test(message)
  );
}

function isStatementTimeout(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "57014";
}

function recordConnectError(error: unknown): void {
  poolCounters.connectionErrors += 1;
  if (isTimeoutError(error)) poolCounters.acquisitionTimeouts += 1;
}

function recordQueryError(error: unknown): void {
  if (isTimeoutError(error)) poolCounters.queryTimeouts += 1;
  if (isStatementTimeout(error)) poolCounters.statementTimeouts += 1;
}

function getLazyPool(): pg.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set — set it before starting the server.",
      );
    }
    const config = getDbPoolConfig();
    const createdPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: config.max,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      statement_timeout: config.statementTimeoutMillis,
      query_timeout: config.queryTimeoutMillis,
      allowExitOnIdle: false,
    });

    // Pool events are intentionally aggregate-only. They expose pressure and
    // failure counts without connection strings, SQL, or customer data.
    createdPool.on("acquire", () => {
      poolCounters.acquisitions += 1;
    });
    createdPool.on("error", (error) => {
      if (isTimeoutError(error)) poolCounters.queryTimeouts += 1;
      else poolCounters.idleClientErrors += 1;
    });

    // `pg` does not emit a separate event for a connect() acquisition timeout.
    // Wrap the promise overload so the timeout and statement-timeout counters
    // remain observable while preserving the native Pool API.
    const nativeConnect = createdPool.connect.bind(createdPool) as (
      ...args: unknown[]
    ) => unknown;
    createdPool.connect = ((...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...callbackArgs: unknown[]) => {
          if (callbackArgs[0]) recordConnectError(callbackArgs[0]);
          return callback(...callbackArgs);
        };
      }
      const result = nativeConnect(...args);
      if (
        typeof result === "object" &&
        result !== null &&
        typeof (result as Promise<unknown>).catch === "function"
      ) {
        return (result as Promise<unknown>).catch((error: unknown) => {
          recordConnectError(error);
          throw error;
        });
      }
      return result;
    }) as pg.Pool["connect"];

    const nativeQuery = createdPool.query.bind(createdPool) as (
      ...args: unknown[]
    ) => unknown;
    createdPool.query = ((...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...callbackArgs: unknown[]) => {
          if (callbackArgs[0]) recordQueryError(callbackArgs[0]);
          return callback(...callbackArgs);
        };
      }
      const result = nativeQuery(...args);
      if (
        typeof result === "object" &&
        result !== null &&
        typeof (result as Promise<unknown>).catch === "function"
      ) {
        return (result as Promise<unknown>).catch((error: unknown) => {
          recordQueryError(error);
          throw error;
        });
      }
      return result;
    }) as pg.Pool["query"];

    _pool = createdPool;
  }
  return _pool;
}

function getLazyDb(): NodePgDatabase<Schema> {
  if (!_db) {
    _db = drizzle(getLazyPool(), { schema });
  }
  return _db;
}

function lazyProxy<T extends object>(getter: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const real = getter();
      const val = Reflect.get(real, prop, real);
      return typeof val === "function" ? (val as Function).bind(real) : val;
    },
    set(_target, prop, value) {
      return Reflect.set(getter(), prop, value);
    },
  });
}

export const pool: pg.Pool = lazyProxy(getLazyPool);
export const db: NodePgDatabase<Schema> = lazyProxy(getLazyDb);

/**
 * Return aggregate pool pressure without running a query or exposing
 * connection details. A not-yet-initialized pool is reported as unavailable.
 */
export function getPoolStats(): DbPoolStats {
  if (!_pool) {
    const config = getDbPoolConfig();
    return {
      available: false,
      totalCount: 0,
      idleCount: 0,
      activeCount: 0,
      waitingCount: 0,
      max: config.max,
      maxReplicaCount: config.maxReplicaCount,
      maxTotalConnections: config.max * config.maxReplicaCount,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      statementTimeoutMillis: config.statementTimeoutMillis,
      queryTimeoutMillis: config.queryTimeoutMillis,
      ...poolCounters,
    };
  }
  const config = getDbPoolConfig();
  return {
    available: true,
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    activeCount: Math.max(0, _pool.totalCount - _pool.idleCount),
    waitingCount: _pool.waitingCount,
    max: _pool.options.max ?? null,
    maxReplicaCount: config.maxReplicaCount,
    maxTotalConnections:
      (_pool.options.max ?? config.max) * config.maxReplicaCount,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    statementTimeoutMillis: config.statementTimeoutMillis,
    queryTimeoutMillis: config.queryTimeoutMillis,
    ...poolCounters,
  };
}

export * from "./schema";
