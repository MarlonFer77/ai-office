import { describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import {
  agents,
  approvals,
  createDb,
  missions,
  orm,
  runMigrations,
  users,
  workspaceMembers,
  workspaces,
} from '@ai-office/database';
import {
  BullJobQueue,
  createProject,
  createMission,
  resolveApproval,
  silentLogger,
  QUEUE_NAME,
  type OrchestratorContext,
} from '@ai-office/orchestrator';
import { startWorker } from './worker.js';

const DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://aioffice:aioffice@localhost:5432/aioffice_test';
// Dedicated test DB index: this test FLUSHES it. Never point it at a shared Redis DB.
const REDIS = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

describe('BullMQ worker (real Redis + Postgres)', () => {
  it('executes a demo mission end-to-end through the queue, independent of any HTTP request', async () => {
    await runMigrations(DB);
    const { db, pool, close } = createDb(DB);
    await pool.query(
      `DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE'; END LOOP; END $$;`,
    );
    const flush = new Redis(REDIS);
    await flush.flushdb();
    await new Queue(QUEUE_NAME, { connection: { url: REDIS } })
      .obliterate({ force: true })
      .catch(() => undefined);

    const publisher = new Redis(REDIS);
    const control = new Redis(REDIS);
    const queue = new BullJobQueue(REDIS);
    const ctx: OrchestratorContext = {
      db,
      redis: publisher,
      queue,
      config: { encryptionKey: 'k'.repeat(20), demoChunkDelayMs: 0 },
      logger: silentLogger,
    };
    const worker = startWorker(ctx, REDIS, control, 4);
    try {
      await db.insert(users).values({ id: 'u1', name: 'U', email: 'u1@test.dev' });
      const [ws] = await db.insert(workspaces).values({ name: 'W' }).returning();
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: ws!.id, userId: 'u1', role: 'owner' });
      const p = await createProject(ctx, {
        name: 'Q',
        objective: '',
        description: '',
        mode: 'demo',
        budgetLimitUsd: null,
        starterTeam: true,
        workspaceId: ws!.id,
        userId: 'u1',
      });
      const m = await createMission(ctx, p.id, { title: 'M', goal: 'Lançar produto' }, 'u1');
      const waitFor = async (pred: () => Promise<boolean>, ms = 15000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (await pred()) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error('timeout');
      };
      const approvePending = async () => {
        const pending = await db.query.approvals.findFirst({
          where: orm.and(orm.eq(approvals.missionId, m.id), orm.eq(approvals.status, 'pending')),
        });
        if (pending) await resolveApproval(ctx, pending.id, 'approved', 'u1');
        return !!pending;
      };
      await waitFor(
        async () =>
          (await db.query.missions.findFirst({ where: orm.eq(missions.id, m.id) }))!.status ===
          'awaiting_plan_approval',
      );
      await approvePending();
      await waitFor(
        async () =>
          (await db.query.missions.findFirst({ where: orm.eq(missions.id, m.id) }))!.status ===
          'awaiting_final_approval',
      );
      await approvePending();
      await waitFor(
        async () =>
          (await db.query.missions.findFirst({ where: orm.eq(missions.id, m.id) }))!.status ===
          'completed',
      );
      const team = await db.query.agents.findMany({ where: orm.eq(agents.projectId, p.id) });
      expect(team.every((a) => a.status === 'idle')).toBe(true);
    } finally {
      await worker.close();
      await queue.close();
      publisher.disconnect();
      control.disconnect();
      flush.disconnect();
      await close();
    }
  }, 30000);
});
