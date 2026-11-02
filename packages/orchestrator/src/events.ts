import { events } from '@ai-office/database';
import { type NewOfficeEvent, type OfficeEvent, projectChannel } from '@ai-office/shared';
import type { OrchestratorContext } from './context.js';

/**
 * Persists an event (append-only log, monotonic id) and fans it out on Redis.
 * Persist-then-publish guarantees that reconnecting clients can replay from
 * Last-Event-ID without gaps.
 */
export async function emitEvent(
  ctx: Pick<OrchestratorContext, 'db' | 'redis' | 'logger'>,
  e: NewOfficeEvent,
): Promise<OfficeEvent> {
  const [row] = await ctx.db
    .insert(events)
    .values({
      projectId: e.projectId,
      type: e.type,
      agentId: e.agentId ?? null,
      taskId: e.taskId ?? null,
      missionId: e.missionId ?? null,
      demo: e.demo,
      summary: e.summary,
      payload: e.payload,
    })
    .returning();
  const event: OfficeEvent = {
    ...e,
    id: String(row!.id),
    agentId: e.agentId ?? null,
    taskId: e.taskId ?? null,
    missionId: e.missionId ?? null,
    createdAt: row!.createdAt.toISOString(),
  };
  try {
    await ctx.redis.publish(projectChannel(e.projectId), JSON.stringify(event));
  } catch (err) {
    ctx.logger.warn(
      { err },
      'event publish failed (persisted, clients will catch up on reconnect)',
    );
  }
  return event;
}

/** Transient streaming delta (not persisted; final message is). */
export async function publishDelta(
  ctx: Pick<OrchestratorContext, 'redis'>,
  input: {
    projectId: string;
    agentId: string;
    runId: string;
    text: string;
    demo: boolean;
    seq: number;
  },
) {
  const event: OfficeEvent = {
    id: `delta:${input.runId}:${input.seq}`,
    type: 'agent.message.delta',
    projectId: input.projectId,
    agentId: input.agentId,
    taskId: null,
    missionId: null,
    demo: input.demo,
    summary: '',
    payload: { runId: input.runId, text: input.text, seq: input.seq },
    createdAt: new Date().toISOString(),
  };
  await ctx.redis
    .publish(projectChannel(input.projectId), JSON.stringify(event))
    .catch(() => undefined);
}
