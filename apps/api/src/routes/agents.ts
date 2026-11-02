import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agentRuns, agents, agentSessions, messages, orm, tasks, usageRecords } from '@ai-office/database';
import { createAgentSchema, ROLE_ROOM, sendMessageSchema, updateAgentSchema } from '@ai-office/shared';
import { audit, createAgent, emitEvent, requestRunCancel } from '@ai-office/orchestrator';
import { type AppDeps, HttpError, loadProject } from '../app.js';
import { idParams, loadAgent, loadRun } from './access.js';

const { and, eq, desc, asc, lt, inArray, isNull, sql, sum } = orm;

export async function agentRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/projects/:id/agents', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    return deps.db.query.agents.findMany({ where: and(eq(agents.projectId, project.id), isNull(agents.archivedAt)), orderBy: asc(agents.createdAt) });
  });

  app.post('/projects/:id/agents', async (req, reply) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const input = createAgentSchema.parse(req.body);
    const agent = await createAgent(deps.orch, project.id, input);
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'agent.create', resourceType: 'agent', resourceId: agent.id, metadata: { provider: agent.provider, model: agent.model }, ip: req.ip });
    return reply.status(201).send(agent);
  });

  app.get('/agents/:id', async (req) => {
    const { agent } = await loadAgent(deps, req, idParams(req.params));
    const session = await deps.db.query.agentSessions.findFirst({ where: eq(agentSessions.agentId, agent.id) });
    const [usage] = await deps.db
      .select({ cost: sum(usageRecords.costUsd), input: sum(usageRecords.inputTokens), output: sum(usageRecords.outputTokens), runs: sql<number>`count(*)::int` })
      .from(usageRecords)
      .where(eq(usageRecords.agentId, agent.id));
    const agentTasks = await deps.db.query.tasks.findMany({ where: eq(tasks.assignedAgentId, agent.id), orderBy: desc(tasks.createdAt), limit: 30 });
    return {
      agent,
      session: session ? { id: session.id, busy: Boolean(session.activeRunId), activeRunId: session.activeRunId, version: session.version } : null,
      usage: { costUsd: usage?.cost == null ? 0 : Number(usage.cost), inputTokens: Number(usage?.input ?? 0), outputTokens: Number(usage?.output ?? 0), runs: usage?.runs ?? 0 },
      tasks: agentTasks,
    };
  });

  app.patch('/agents/:id', async (req) => {
    const { agent, project } = await loadAgent(deps, req, idParams(req.params));
    const input = updateAgentSchema.parse(req.body);
    const patch: Partial<typeof agents.$inferInsert> = { ...input };
    delete (patch as { roomKind?: unknown }).roomKind;
    const roomKind = input.roomKind ?? (input.role ? ROLE_ROOM[input.role] : undefined);
    if (roomKind) {
      const room = await deps.db.query.rooms.findFirst({ where: (r, { and: a, eq: e }) => a(e(r.projectId, project.id), e(r.kind, roomKind)) });
      patch.roomId = room?.id ?? null;
    }
    if (input.paused === false && agent.status === 'paused') patch.status = 'idle';
    if (input.paused === true) patch.status = 'paused';
    const [updated] = await deps.db.update(agents).set(patch).where(eq(agents.id, agent.id)).returning();
    await emitEvent(deps.orch, {
      type: input.paused === true ? 'agent.paused' : 'agent.updated',
      projectId: project.id,
      agentId: agent.id,
      demo: project.mode === 'demo',
      summary: input.paused === true ? `${updated!.name} foi pausado` : `${updated!.name} foi atualizado`,
      payload: { fields: Object.keys(input), status: updated!.status, roomId: updated!.roomId },
    });
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'agent.update', resourceType: 'agent', resourceId: agent.id, metadata: { fields: Object.keys(input) }, ip: req.ip });
    return updated;
  });

  app.delete('/agents/:id', async (req) => {
    const { agent, project } = await loadAgent(deps, req, idParams(req.params));
    await deps.db.update(agents).set({ archivedAt: new Date(), paused: true, status: 'disconnected' }).where(eq(agents.id, agent.id));
    await emitEvent(deps.orch, { type: 'agent.updated', projectId: project.id, agentId: agent.id, demo: project.mode === 'demo', summary: `${agent.name} saiu da equipe`, payload: { archived: true } });
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'agent.archive', resourceType: 'agent', resourceId: agent.id, ip: req.ip });
    return { ok: true };
  });

  /** Paginated history of this agent's own session, plus pending (queued) chat inputs. */
  app.get('/agents/:id/messages', async (req) => {
    const { agent } = await loadAgent(deps, req, idParams(req.params));
    const q = z.object({ before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const rows = await deps.db.query.messages.findMany({
      where: and(eq(messages.agentId, agent.id), q.before ? lt(messages.seq, q.before) : undefined),
      orderBy: desc(messages.seq),
      limit: q.limit,
    });
    const pending = await deps.db.query.agentRuns.findMany({
      where: and(eq(agentRuns.agentId, agent.id), eq(agentRuns.kind, 'chat'), eq(agentRuns.status, 'queued')),
      orderBy: asc(agentRuns.createdAt),
    });
    return {
      messages: rows.reverse(),
      pending: pending.map((r) => ({ runId: r.id, content: r.input ?? '', createdAt: r.createdAt })),
      hasMore: rows.length === q.limit,
    };
  });

  app.post('/agents/:id/messages', { config: { rateLimit: { max: deps.env.NODE_ENV === 'test' ? 10_000 : 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { agent, project } = await loadAgent(deps, req, idParams(req.params));
    if (agent.archivedAt) throw new HttpError(409, 'Agente arquivado.');
    const { content } = sendMessageSchema.parse(req.body);
    const session = await deps.db.query.agentSessions.findFirst({ where: eq(agentSessions.agentId, agent.id) });
    if (!session) throw new HttpError(500, 'Sessão do agente inexistente.');
    const demo = project.mode === 'demo' || agent.provider === 'demo';
    const [run] = await deps.db
      .insert(agentRuns)
      .values({
        projectId: project.id,
        agentId: agent.id,
        sessionId: session.id,
        kind: 'chat',
        provider: demo ? 'demo' : agent.provider,
        model: demo ? 'demo-sim-1' : agent.model,
        demo,
        input: content,
      })
      .returning();
    await deps.db.update(agents).set({ status: agent.paused ? 'paused' : session.activeRunId ? agent.status : 'queued' }).where(eq(agents.id, agent.id));
    await deps.orch.queue.enqueue({ kind: 'chat', runId: run!.id });
    return reply.status(202).send({ run, busy: Boolean(session.activeRunId), paused: agent.paused });
  });

  app.get('/agents/:id/runs', async (req) => {
    const { agent } = await loadAgent(deps, req, idParams(req.params));
    return deps.db.query.agentRuns.findMany({ where: eq(agentRuns.agentId, agent.id), orderBy: desc(agentRuns.createdAt), limit: 50 });
  });

  /** Interrupts a queued or running run (cooperative abort in the worker). */
  app.post('/runs/:id/cancel', async (req) => {
    const { run, project } = await loadRun(deps, req, idParams(req.params));
    if (!['queued', 'running'].includes(run.status)) throw new HttpError(409, 'Execução já finalizada.');
    if (run.status === 'queued') {
      await deps.db.update(agentRuns).set({ status: 'cancelled', cancelRequested: true, finishedAt: new Date() }).where(and(eq(agentRuns.id, run.id), inArray(agentRuns.status, ['queued'])));
      const others = await deps.db.query.agentRuns.findFirst({ where: and(eq(agentRuns.agentId, run.agentId), inArray(agentRuns.status, ['queued', 'running'])) });
      if (!others) await deps.db.update(agents).set({ status: 'idle' }).where(and(eq(agents.id, run.agentId), eq(agents.status, 'queued')));
      await emitEvent(deps.orch, { type: 'agent.idle', projectId: project.id, agentId: run.agentId, demo: run.demo, summary: 'Mensagem na fila cancelada', payload: { runId: run.id } });
    } else {
      await requestRunCancel(deps.orch, run.id);
    }
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'run.cancel', resourceType: 'agent_run', resourceId: run.id, ip: req.ip });
    return { ok: true };
  });
}
