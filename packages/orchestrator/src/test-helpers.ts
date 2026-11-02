import { createDb, runMigrations, users, workspaces, workspaceMembers, type DbHandle } from '@ai-office/database';
import type { GenerateRequest, GenerateResult, ProviderAdapter } from '@ai-office/agents';
import { MemoryJobQueue } from './queue.js';
import { silentLogger, type OrchestratorContext } from './context.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://aioffice:aioffice@localhost:5432/aioffice_test';

let handle: DbHandle | undefined;
export async function testDb() {
  if (!handle) {
    await runMigrations(TEST_DB_URL);
    handle = createDb(TEST_DB_URL, { max: 5 });
  }
  return handle;
}

export async function resetDb(h: DbHandle) {
  await h.pool.query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP; END $$;`);
}

export class RecordingPublisher {
  published: { channel: string; message: string }[] = [];
  async publish(channel: string, message: string) {
    this.published.push({ channel, message });
    return 1;
  }
}

/** Fake "real" adapter that records exactly what history each call received. */
export class ScriptedAdapter implements ProviderAdapter {
  readonly id = 'anthropic' as const;
  readonly demo = false;
  calls: GenerateRequest[] = [];
  constructor(private readonly respond: (req: GenerateRequest, n: number) => Promise<string> | string = (r) => `eco: ${r.messages.at(-1)?.content.slice(0, 40)}`) {}
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push({ ...req, messages: [...req.messages] });
    const text = await this.respond(req, this.calls.length);
    req.onDelta?.(text);
    return { text, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: 'end_turn', model: req.model, demo: false };
  }
  async listModels() {
    return [];
  }
  async verify() {
    return { ok: true as const, models: [] };
  }
}

export async function makeContext(overrides: Partial<OrchestratorContext> = {}) {
  const h = await testDb();
  const queue = new MemoryJobQueue();
  const redis = new RecordingPublisher();
  const ctx: OrchestratorContext = {
    db: h.db,
    redis,
    queue,
    config: { encryptionKey: 'test-encryption-key-123456', demoChunkDelayMs: 0 },
    logger: silentLogger,
    ...overrides,
  };
  return { ctx, queue, redis, h };
}

export async function seedUser(h: DbHandle, id = 'user-1') {
  await h.db.insert(users).values({ id, name: 'Diretor', email: `${id}@test.dev` });
  const [ws] = await h.db.insert(workspaces).values({ name: 'WS' }).returning();
  await h.db.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: id, role: 'owner' });
  return { userId: id, workspaceId: ws!.id };
}
