import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type Schema = typeof schema;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<Schema> | null = null;

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

export * from "./schema";
