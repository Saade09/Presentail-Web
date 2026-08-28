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
  waitingCount: number;
  max: number | null;
};

function getLazyPool(): pg.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set — set it before starting the server.",
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
    return {
      available: false,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      max: null,
    };
  }
  return {
    available: true,
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
    max: _pool.options.max ?? null,
  };
}

export * from "./schema";
