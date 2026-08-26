import { Pool, neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { NeonDatabase, drizzle as drizzleOverPool } from "drizzle-orm/neon-serverless";
import { env } from "@/src/lib/env";
import * as schema from "@/src/db/schema";

/**
 * Reads, and any write that is a single statement, go over Neon's HTTP driver:
 * no connection to set up, one round trip, nothing to tear down.
 *
 * Its one limitation is that it cannot hold a transaction open, which is why
 * `withTransaction` below exists alongside it rather than replacing it.
 */
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });

/** The transaction handle handed to `withTransaction`'s callback. */
export type Tx = Parameters<Parameters<NeonDatabase<typeof schema>["transaction"]>[0]>[0];

/**
 * Runs `fn` inside one real Postgres transaction, over a WebSocket connection.
 *
 * Everything that has to happen atomically — a POS sale's order, its lines,
 * its events and every stock movement behind them — used to be a sequence of
 * independent HTTP requests with hand-written compensating undo for each one,
 * because `neon-http` has no `BEGIN`. That was both the most fragile code in
 * the repo and the most expensive: twenty-odd sequential round trips for a
 * single counter sale, each one holding Neon's compute awake.
 *
 * Two things to keep in mind when reaching for this:
 *
 *  - **Only for genuinely atomic multi-statement units.** Opening a WebSocket
 *    costs more than a single HTTP round trip, so a lone `INSERT` or `UPDATE`
 *    belongs on `db`, not here.
 *  - **Throw to roll back.** Any error escaping `fn` aborts the transaction and
 *    is re-thrown; nothing partial survives. That is the whole point, and it
 *    is why the manual reversal helpers this replaced are gone rather than
 *    kept as a fallback.
 *
 * The pool is created per call and always closed, which is what a serverless
 * invocation wants — a module-level pool would outlive the request that opened
 * it and leak connections against Neon's limit. No `neonConfig` setup is
 * needed: Node 22+ (Vercel's runtime, and local dev) provides a global
 * `WebSocket`, which the driver picks up on its own.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    return await drizzleOverPool(pool, { schema }).transaction(fn);
  } finally {
    await pool.end();
  }
}
