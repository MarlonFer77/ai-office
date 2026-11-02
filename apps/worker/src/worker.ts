import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { agentRuns, agentSessions, agents, orm, tasks } from '@ai-office/database';
import {
  abortLocalRun,
  executeTask,
  type JobData,
  planMission,
  QUEUE_NAME,
  runChat,
  type OrchestratorContext,
} from '@ai-office/orchestrator';
import { RUN_CONTROL_CHANNEL } from '@ai-office/shared';

const { and, eq, inArray, lt } = orm;

export async function processJob(ctx: OrchestratorContext, data: JobData) {
  switch (data.kind) {
    case 'plan':
      return planMission(ctx, data.missionId);
    case 'task':
      return executeTask(ctx, data.taskId);
    case 'chat':
      return runChat(ctx, data.runId);
  }
}

/**
 * Recovers state left behind by a crashed worker: runs stuck in "running"
 * whose session lock is stale are marked failed and tasks re-queued.
 */
export async function recoverStaleWork(ctx: OrchestratorContext, staleMs = 10 * 60_000) {
  const cutoff = new Date(Date.now() - staleMs);
  const stale = await ctx.db.query.agentRuns.findMany({
    where: and(eq(agentRuns.status, 'running'), lt(agentRuns.startedAt, cutoff)),
  });
  for (const run of stale) {
    await ctx.db
      .update(agentRuns)
      .set({
        status: 'failed',
        error: 'Worker reiniciado durante a execução.',
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    await ctx.db
      .update(agentSessions)
      .set({ activeRunId: null, lockedAt: null })
      .where(eq(agentSessions.activeRunId, run.id));
    await ctx.db.update(agents).set({ status: 'idle' }).where(eq(agents.id, run.agentId));
    if (run.taskId) {
      const [t] = await ctx.db
        .update(tasks)
        .set({ status: 'ready' })
        .where(and(eq(tasks.id, run.taskId), eq(tasks.status, 'running')))
        .returning();
      if (t) await ctx.queue.enqueue({ kind: 'task', taskId: t.id });
    }
  }
  // Re-enqueue any ready task (e.g. after a Redis flush) — handlers are idempotent.
  const ready = await ctx.db.query.tasks.findMany({ where: inArray(tasks.status, ['ready']) });
  for (const t of ready) await ctx.queue.enqueue({ kind: 'task', taskId: t.id });
  return { recovered: stale.length, requeued: ready.length };
}

export function startWorker(
  ctx: OrchestratorContext,
  redisUrl: string,
  control: Redis,
  concurrency: number,
) {
  const worker = new Worker<JobData>(
    QUEUE_NAME,
    async (job: Job<JobData>) => {
      await processJob(ctx, job.data);
    },
    { connection: { url: redisUrl, maxRetriesPerRequest: null }, concurrency },
  );
  worker.on('failed', (job, err) =>
    ctx.logger.error({ err, jobId: job?.id, data: job?.data }, 'job failed'),
  );
  worker.on('error', (err) => ctx.logger.error({ err }, 'worker error'));

  // Cooperative cancellation requested by the API.
  void control.subscribe(RUN_CONTROL_CHANNEL);
  control.on('message', (_channel, message) => {
    try {
      const { runId } = JSON.parse(message) as { runId: string };
      if (abortLocalRun(runId)) ctx.logger.info({ runId }, 'run aborted');
    } catch {
      /* ignore malformed control messages */
    }
  });
  return worker;
}
