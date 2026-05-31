import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Warn at import time rather than throwing. The error surfaces when a query
  // is actually attempted, so CI environments that import @workspace/db only
  // for type-checking or test mocking don't fail at module load.
  process.emitWarning(
    "DATABASE_URL is not set — database queries will fail when attempted.",
    "PresentailDbWarning",
  );
}

export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : undefined,
);
export const db = drizzle(pool, { schema });

export * from "./schema";
