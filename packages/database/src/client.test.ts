import { describe, expect, it } from 'vitest';
import { createDb } from './client.js';

describe('createDb', () => {
  it('survives idle connections being terminated by the server', async () => {
    const url =
      process.env.TEST_DATABASE_URL ?? 'postgres://aioffice:aioffice@localhost:5432/aioffice_test';
    const a = createDb(url, { max: 2 });
    const admin = createDb(url, { max: 1 });
    const { rows } = await a.pool.query<{ pid: number }>('select pg_backend_pid() as pid');
    // Kill the pooled (now idle) backend, like a server restart would.
    await admin.pool.query('select pg_terminate_backend($1)', [rows[0]!.pid]);
    await new Promise((r) => setTimeout(r, 200));
    const again = await a.pool.query<{ ok: number }>('select 1 as ok');
    expect(again.rows[0]!.ok).toBe(1);
    await a.close();
    await admin.close();
  });
});
