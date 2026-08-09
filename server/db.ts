import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Please add a database to your project.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * node-postgres emits `error` on *idle* clients — a connection dropped by the
 * database rather than by a query. There is no request to reject, so the event
 * has no other listener, and an unhandled 'error' on an EventEmitter is an
 * uncaughtException, which ends the process.
 *
 * That is how a database hiccup used to take the whole site down: the same
 * Express process serves the built frontend, so losing it serves nothing at
 * all. A pool that cannot reach Postgres should cost the API, not the app.
 */
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
