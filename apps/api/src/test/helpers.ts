import { createDb, runMigrations, type DbHandle } from '@ai-office/database';
import { MemoryJobQueue, silentLogger, type OrchestratorContext } from '@ai-office/orchestrator';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { createAuth } from '../auth.js';
import { loadEnv } from '../env.js';
import { EventHub } from '../hub.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://aioffice:aioffice@localhost:5432/aioffice_test';

/** Minimal in-process pub/sub so the SSE path runs without Redis in tests. */
export class FakeRedis {
  private handlers: ((pattern: string, channel: string, message: string) => void)[] = [];
  async psubscribe() {
    return 1;
  }
  on(_event: string, h: (pattern: string, channel: string, message: string) => void) {
    this.handlers.push(h);
    return this;
  }
  async publish(channel: string, message: string) {
    for (const h of this.handlers) h('ai-office:events:*', channel, message);
    return 1;
  }
}

export interface TestApp {
  app: FastifyInstance;
  h: DbHandle;
  queue: MemoryJobQueue;
  orch: OrchestratorContext;
}

let handle: DbHandle | undefined;
export async function createTestApp(): Promise<TestApp> {
  if (!handle) {
    await runMigrations(TEST_DB_URL);
    handle = createDb(TEST_DB_URL, { max: 5 });
  }
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    BETTER_AUTH_URL: 'http://localhost:4000',
    ENCRYPTION_KEY: 'test-encryption-key-123456',
    WEB_ORIGIN: 'http://localhost:3000',
  });
  const redis = new FakeRedis();
  const hub = new EventHub(redis as never);
  await hub.start();
  const queue = new MemoryJobQueue();
  const orch: OrchestratorContext = { db: handle.db, redis, queue, config: { encryptionKey: env.ENCRYPTION_KEY, demoChunkDelayMs: 0 }, logger: silentLogger };
  const app = await buildApp({ env, db: handle.db, auth: createAuth(handle.db, env), hub, storage: null, orch });
  return { app, h: handle, queue, orch };
}

export async function resetDb(h: DbHandle) {
  await h.pool.query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP; END $$;`);
}

/** Signs up and returns the session cookie header. */
export async function signUp(app: FastifyInstance, email: string, name = 'Teste'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email, password: 'senha-segura-123', name }, headers: { origin: 'http://localhost:3000' } });
  if (res.statusCode !== 200) throw new Error(`sign-up failed ${res.statusCode}: ${res.body}`);
  const raw = res.headers['set-cookie'];
  const cookies = (Array.isArray(raw) ? raw : [raw ?? '']).map((c) => c.split(';')[0]).join('; ');
  return cookies;
}
