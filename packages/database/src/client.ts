import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 10 });
  // Idle connections can be dropped by the server (restart, failover, Docker stop).
  // Without a listener, pg emits an unhandled 'error' and the whole process exits;
  // the pool discards the broken client and reconnects on the next query.
  pool.on('error', (err) => {
    console.error(`[database] conexão ociosa perdida: ${err.message}`);
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
