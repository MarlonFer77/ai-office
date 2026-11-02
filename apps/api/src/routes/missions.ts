import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { approvals, handoffs, missions, orm, taskDependencies, tasks } from '@ai-office/database';
import { computeProgress, createMissionSchema, resolveApprovalSchema, TASK_STATUSES } from '@ai-office/shared';
import { audit, cancelMission, createMission, emitEvent, resolveApproval, retryTask } from '@ai-office/orchestrator';
import { type AppDeps, HttpError, loadProject } from '../app.js';
import { idParams, loadApproval, loadMission, loadTask } from './access.js';

const { and, eq, desc, asc, inArray } = orm;

export async function missionRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/projects/:id/missions', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const rows = await deps.db.query.missions.findMany({ where: eq(missions.projectId, project.id), orderBy: desc(missions.createdAt) });
    const allTasks = rows.length ? await deps.db.select({ missionId: tasks.missionId, status: tasks.status }).from(tasks).where(inArray(tasks.missionId, rows.map((r) => r.id))) : [];
    return rows.map((m) => ({ ...m, progress: computeProgress(allTasks.filter((t) => t.missionId === m.id).map((t) => t.status)) }));
  });

  app.post('/projects/:id/missions', async (req, reply) => {
    const project = await loadProject(deps, req, idParams(req.params));
    if (project.archivedAt) throw new HttpError(409, 'Projeto arquivado.');
    const input = createMissionSchema.parse(req.body);
    const active = await deps.db.query.missions.findFirst({ where: and(eq(missions.projectId, project.id), inArray(missions.status, ['planning', 'awaiting_plan_approval', 'running', 'awaiting_final_approval'])) });
    if (active) throw new HttpError(409, `Já existe uma missão ativa: "${active.title}". Conclua ou cancele antes de iniciar outra.`);
    try {
      const mission = await createMission(deps.orch, project.id, input, req.user!.id);
      await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'mission.create', resourceType: 'mission', resourceId: mission.id, ip: req.ip });
      return reply.status(201).send(mission);
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? err.message : 'Falha ao criar missão.');
    }
  });

  app.get('/missions/:id', async (req) => {
    const { mission } = await loadMission(deps, req, idParams(req.params));
    const taskRows = await deps.db.query.tasks.findMany({ where: eq(tasks.missionId, mission.id), orderBy: [desc(tasks.priority), asc(tasks.createdAt)] });
    const deps2 = taskRows.length ? await deps.db.query.taskDependencies.findMany({ where: inArray(taskDependencies.taskId, taskRows.map((t) => t.id)) }) : [];
    const handoffRows = await deps.db.query.handoffs.findMany({ where: eq(handoffs.missionId, mission.id), orderBy: asc(handoffs.createdAt) });
    const approvalRows = await deps.db.query.approvals.findMany({ where: eq(approvals.missionId, mission.id), orderBy: asc(approvals.createdAt) });
    return {
      mission,
      tasks: taskRows.map((t) => ({ ...t, dependsOn: deps2.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId) })),
      handoffs: handoffRows,
      approvals: approvalRows,
      progress: computeProgress(taskRows.map((t) => t.status)),
    };
  });

  app.post('/missions/:id/cancel', async (req) => {
    const { mission, project } = await loadMission(deps, req, idParams(req.params));
    await cancelMission(deps.orch, mission.id, 'Cancelada pelo diretor.');
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'mission.cancel', resourceType: 'mission', resourceId: mission.id, ip: req.ip });
    return { ok: true };
  });

  app.get('/projects/:id/tasks', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const q = z.object({ status: z.enum(TASK_STATUSES).optional(), agentId: z.string().max(64).optional() }).parse(req.query);
    return deps.db.query.tasks.findMany({
      where: and(eq(tasks.projectId, project.id), q.status ? eq(tasks.status, q.status) : undefined, q.agentId ? eq(tasks.assignedAgentId, q.agentId) : undefined),
      orderBy: desc(tasks.createdAt),
      limit: 200,
    });
  });

  app.post('/tasks/:id/retry', async (req) => {
    const { task, project } = await loadTask(deps, req, idParams(req.params));
    try {
      const t = await retryTask(deps.orch, task.id);
      await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: 'task.retry', resourceType: 'task', resourceId: task.id, ip: req.ip });
      return t;
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : 'Não foi possível reexecutar.');
    }
  });

  app.post('/tasks/:id/cancel', async (req) => {
    const { task, project } = await loadTask(deps, req, idParams(req.params));
    const [t] = await deps.db
      .update(tasks)
      .set({ status: 'cancelled' })
      .where(and(eq(tasks.id, task.id), inArray(tasks.status, ['pending', 'ready', 'waiting_dependency', 'failed'])))
      .returning();
    if (!t) throw new HttpError(409, 'A tarefa não pode ser cancelada no estado atual.');
    await emitEvent(deps.orch, { type: 'task.cancelled', projectId: project.id, taskId: t.id, missionId: t.missionId, agentId: t.assignedAgentId, demo: project.mode === 'demo', summary: `Tarefa cancelada: ${t.title}`, payload: {} });
    return t;
  });

  app.get('/projects/:id/approvals', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const q = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).parse(req.query);
    return deps.db.query.approvals.findMany({ where: and(eq(approvals.projectId, project.id), q.status ? eq(approvals.status, q.status) : undefined), orderBy: desc(approvals.createdAt), limit: 100 });
  });

  app.post('/approvals/:id/resolve', async (req) => {
    const { approval, project } = await loadApproval(deps, req, idParams(req.params));
    const input = resolveApprovalSchema.parse(req.body);
    try {
      await resolveApproval(deps.orch, approval.id, input.decision, req.user!.id, input.note);
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : 'Falha ao resolver aprovação.');
    }
    await audit(deps.db, { workspaceId: project.workspaceId, userId: req.user!.id, action: `approval.${input.decision}`, resourceType: 'approval', resourceId: approval.id, ip: req.ip });
    return { ok: true };
  });

  app.get('/projects/:id/handoffs', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    return deps.db.query.handoffs.findMany({ where: eq(handoffs.projectId, project.id), orderBy: desc(handoffs.createdAt), limit: 100 });
  });
}
