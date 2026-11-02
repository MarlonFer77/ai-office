import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  agents,
  agentSessions,
  approvals,
  events,
  missions,
  orm,
  projects,
  rooms,
  tasks,
  usageRecords,
} from '@ai-office/database';
import { computeProgress, createProjectSchema, updateProjectSchema } from '@ai-office/shared';
import { audit, createProject } from '@ai-office/orchestrator';
import { type AppDeps, loadProject } from '../app.js';
import { idParams } from './access.js';

const { and, eq, desc, asc, isNull, isNotNull, lt, sql, sum, inArray } = orm;

export async function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/projects', async (req) => {
    const q = z.object({ archived: z.enum(['true', 'false']).default('false') }).parse(req.query);
    const rows = await deps.db.query.projects.findMany({
      where: and(
        eq(projects.workspaceId, req.workspaceId!),
        q.archived === 'true' ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
      orderBy: desc(projects.updatedAt),
    });
    const ids = rows.map((r) => r.id);
    const taskRows = ids.length
      ? await deps.db
          .select({ projectId: tasks.projectId, status: tasks.status })
          .from(tasks)
          .where(inArray(tasks.projectId, ids))
      : [];
    const agentCounts = ids.length
      ? await deps.db
          .select({ projectId: agents.projectId, n: sql<number>`count(*)::int` })
          .from(agents)
          .where(and(inArray(agents.projectId, ids), isNull(agents.archivedAt)))
          .groupBy(agents.projectId)
      : [];
    return rows.map((p) => ({
      ...p,
      progress: computeProgress(taskRows.filter((t) => t.projectId === p.id).map((t) => t.status)),
      agentCount: agentCounts.find((a) => a.projectId === p.id)?.n ?? 0,
    }));
  });

  app.post('/projects', async (req, reply) => {
    const input = createProjectSchema.parse(req.body);
    const project = await createProject(deps.orch, {
      ...input,
      workspaceId: req.workspaceId!,
      userId: req.user!.id,
    });
    return reply.status(201).send(project);
  });

  app.get('/projects/:id', async (req) => loadProject(deps, req, idParams(req.params)));

  app.patch('/projects/:id', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const input = updateProjectSchema.parse(req.body);
    const [updated] = await deps.db
      .update(projects)
      .set(input)
      .where(eq(projects.id, project.id))
      .returning();
    await audit(deps.db, {
      workspaceId: project.workspaceId,
      userId: req.user!.id,
      action: 'project.update',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { fields: Object.keys(input) },
      ip: req.ip,
    });
    return updated;
  });

  app.post('/projects/:id/archive', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(req.body ?? {});
    const [updated] = await deps.db
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(projects.id, project.id))
      .returning();
    await audit(deps.db, {
      workspaceId: project.workspaceId,
      userId: req.user!.id,
      action: archived ? 'project.archive' : 'project.unarchive',
      resourceType: 'project',
      resourceId: project.id,
      ip: req.ip,
    });
    return updated;
  });

  /** One-shot snapshot of everything the office scene needs. */
  app.get('/projects/:id/office', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const [roomRows, agentRows, sessionRows, taskRows, missionRows, pendingApprovals, usage] =
      await Promise.all([
        deps.db.query.rooms.findMany({
          where: eq(rooms.projectId, project.id),
          orderBy: asc(rooms.gridY),
        }),
        deps.db.query.agents.findMany({
          where: and(eq(agents.projectId, project.id), isNull(agents.archivedAt)),
          orderBy: asc(agents.createdAt),
        }),
        deps.db.query.agentSessions.findMany({ where: eq(agentSessions.projectId, project.id) }),
        deps.db.query.tasks.findMany({
          where: eq(tasks.projectId, project.id),
          orderBy: asc(tasks.createdAt),
        }),
        deps.db.query.missions.findMany({
          where: eq(missions.projectId, project.id),
          orderBy: desc(missions.createdAt),
          limit: 10,
        }),
        deps.db.query.approvals.findMany({
          where: and(eq(approvals.projectId, project.id), eq(approvals.status, 'pending')),
          orderBy: desc(approvals.createdAt),
        }),
        deps.db
          .select({
            cost: sum(usageRecords.costUsd),
            input: sum(usageRecords.inputTokens),
            output: sum(usageRecords.outputTokens),
          })
          .from(usageRecords)
          .where(eq(usageRecords.projectId, project.id)),
      ]);
    const lastEvent = await deps.db.query.events.findFirst({
      where: eq(events.projectId, project.id),
      orderBy: desc(events.id),
    });
    return {
      project,
      rooms: roomRows,
      agents: agentRows.map((a) => ({
        ...a,
        busy: Boolean(sessionRows.find((s) => s.agentId === a.id)?.activeRunId),
        openTasks: taskRows.filter(
          (t) => t.assignedAgentId === a.id && !['completed', 'cancelled'].includes(t.status),
        ).length,
      })),
      tasks: taskRows,
      missions: missionRows,
      approvals: pendingApprovals,
      progress: computeProgress(taskRows.map((t) => t.status)),
      usage: {
        costUsd: Number(usage[0]?.cost ?? 0),
        inputTokens: Number(usage[0]?.input ?? 0),
        outputTokens: Number(usage[0]?.output ?? 0),
      },
      lastEventId: lastEvent ? String(lastEvent.id) : '0',
    };
  });

  /** Persisted event history (paginated, newest first). */
  app.get('/projects/:id/events', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const q = z
      .object({
        before: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        type: z.string().max(60).optional(),
      })
      .parse(req.query);
    const rows = await deps.db.query.events.findMany({
      where: and(
        eq(events.projectId, project.id),
        q.before ? lt(events.id, q.before) : undefined,
        q.type ? eq(events.type, q.type) : undefined,
      ),
      orderBy: desc(events.id),
      limit: q.limit,
    });
    return rows.map((e) => ({ ...e, id: String(e.id), createdAt: e.createdAt.toISOString() }));
  });

  app.get('/projects/:id/usage', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const byAgent = await deps.db
      .select({
        agentId: usageRecords.agentId,
        provider: usageRecords.provider,
        model: usageRecords.model,
        runs: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${usageRecords.inputTokens}),0)::int`,
        outputTokens: sql<number>`coalesce(sum(${usageRecords.outputTokens}),0)::int`,
        costUsd: sum(usageRecords.costUsd),
        unknownCostRuns: sql<number>`count(*) filter (where ${usageRecords.costUsd} is null)::int`,
        demoRuns: sql<number>`count(*) filter (where ${usageRecords.demo})::int`,
      })
      .from(usageRecords)
      .where(eq(usageRecords.projectId, project.id))
      .groupBy(usageRecords.agentId, usageRecords.provider, usageRecords.model);
    const total = byAgent.reduce((n, r) => n + Number(r.costUsd ?? 0), 0);
    return {
      budgetLimitUsd: project.budgetLimitUsd,
      totalCostUsd: total,
      rows: byAgent.map((r) => ({ ...r, costUsd: r.costUsd == null ? null : Number(r.costUsd) })),
    };
  });
}
