import { buildDemoPlan, buildPlanningPrompt, parsePlan } from '@ai-office/agents';
import {
  agents,
  agentRuns,
  approvals,
  handoffs,
  missions,
  orm,
  projects,
  taskDependencies,
  tasks,
  type Database,
} from '@ai-office/database';
import {
  type AgentRole,
  type CreateMissionInput,
  type MissionPlan,
  ORCHESTRATION_LIMITS,
} from '@ai-office/shared';
import type { OrchestratorContext } from './context.js';
import { emitEvent } from './events.js';
import { runAgentTurn, SessionBusyError } from './execution.js';

const { and, eq, inArray, asc } = orm;

type Agent = typeof agents.$inferSelect;
type Task = typeof tasks.$inferSelect;

export async function createMission(
  ctx: OrchestratorContext,
  projectId: string,
  input: CreateMissionInput,
  userId: string | null,
) {
  const team = await activeAgents(ctx.db, projectId);
  if (team.length === 0)
    throw new Error('Adicione pelo menos um agente antes de iniciar uma missão.');
  const planner = team.find((a) => a.role === 'strategist') ?? team[0]!;
  const [mission] = await ctx.db
    .insert(missions)
    .values({
      projectId,
      title: input.title,
      goal: input.goal,
      plannerAgentId: planner.id,
      createdBy: userId,
    })
    .returning();
  const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  await emitEvent(ctx, {
    type: 'mission.created',
    projectId,
    missionId: mission!.id,
    agentId: planner.id,
    demo: project?.mode === 'demo',
    summary: `Nova missão: ${input.title}`,
    payload: { title: input.title },
  });
  await ctx.queue.enqueue({ kind: 'plan', missionId: mission!.id });
  return mission!;
}

export function activeAgents(db: Database, projectId: string) {
  return db.query.agents.findMany({
    where: and(eq(agents.projectId, projectId), orm.isNull(agents.archivedAt)),
    orderBy: asc(agents.createdAt),
  });
}

/** Worker: the planner agent turns the goal into structured tasks awaiting human approval. */
export async function planMission(ctx: OrchestratorContext, missionId: string): Promise<void> {
  const mission = await ctx.db.query.missions.findFirst({ where: eq(missions.id, missionId) });
  if (!mission || mission.status !== 'planning') return;
  const project = (await ctx.db.query.projects.findFirst({
    where: eq(projects.id, mission.projectId),
  }))!;
  const team = await activeAgents(ctx.db, mission.projectId);
  const planner = team.find((a) => a.id === mission.plannerAgentId) ?? team[0];
  if (!planner) return failMission(ctx, mission, 'Nenhum agente disponível para planejar.');
  const roles = [...new Set(team.map((a) => a.role))] as AgentRole[];

  let plan: MissionPlan;
  try {
    const result = await runAgentTurn(ctx, {
      agent: planner,
      project,
      kind: 'plan',
      missionId,
      prompt: buildPlanningPrompt(mission.goal, roles),
      demoOverrideText: (p) =>
        `Plano estruturado (demonstração):\n\n${JSON.stringify(buildDemoPlan(mission.goal, roles), null, 2)}\n\n${p}`,
    });
    plan = result.demo ? buildDemoPlan(mission.goal, roles) : parsePlan(result.text, roles);
  } catch (err) {
    if (err instanceof SessionBusyError) {
      await ctx.queue.enqueue({ kind: 'plan', missionId }, { delayMs: 2000 });
      return;
    }
    return failMission(
      ctx,
      mission,
      `Falha no planejamento: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await ctx.db.transaction(async (tx) => {
    const keyToId = new Map<string, string>();
    for (const t of plan.tasks.slice(0, ORCHESTRATION_LIMITS.maxTasksPerMission)) {
      const assignee = pickAgent(team, t.role);
      const [row] = await tx
        .insert(tasks)
        .values({
          projectId: mission.projectId,
          missionId,
          key: t.key,
          title: t.title,
          instruction: t.instruction,
          role: t.role,
          assignedAgentId: assignee?.id ?? null,
          priority: t.priority,
          requiresApproval: t.requiresApproval,
          maxAttempts: ORCHESTRATION_LIMITS.maxAttemptsPerTask,
        })
        .returning();
      keyToId.set(t.key, row!.id);
      for (const dep of t.dependsOn) {
        const depId = keyToId.get(dep);
        if (depId)
          await tx.insert(taskDependencies).values({ taskId: row!.id, dependsOnTaskId: depId });
      }
    }
    await tx
      .update(missions)
      .set({ status: 'awaiting_plan_approval', planSummary: plan.summary })
      .where(eq(missions.id, missionId));
    await tx.insert(approvals).values({
      projectId: mission.projectId,
      missionId,
      kind: 'mission_plan',
      title: `Aprovar plano: ${mission.title}`,
      details: plan.summary,
      requestedByAgentId: planner.id,
    });
  });
  const demo = project.mode === 'demo' || planner.provider === 'demo';
  await emitEvent(ctx, {
    type: 'mission.planned',
    projectId: mission.projectId,
    missionId,
    agentId: planner.id,
    demo,
    summary: `${planner.name} propôs um plano com ${plan.tasks.length} tarefas`,
    payload: { taskCount: plan.tasks.length },
  });
  await emitEvent(ctx, {
    type: 'approval.requested',
    projectId: mission.projectId,
    missionId,
    agentId: planner.id,
    demo,
    summary: `Plano de "${mission.title}" aguarda sua aprovação`,
    payload: { kind: 'mission_plan' },
  });
}

/** Least-busy agent of the role; falls back to any agent. */
function pickAgent(team: Agent[], role: AgentRole): Agent | undefined {
  const candidates = team.filter((a) => a.role === role && !a.paused);
  return candidates[0] ?? team.find((a) => a.role === role) ?? team[0];
}

async function failMission(
  ctx: OrchestratorContext,
  mission: typeof missions.$inferSelect,
  error: string,
) {
  await ctx.db.update(missions).set({ status: 'failed', error }).where(eq(missions.id, mission.id));
  const project = await ctx.db.query.projects.findFirst({
    where: eq(projects.id, mission.projectId),
  });
  await emitEvent(ctx, {
    type: 'mission.failed',
    projectId: mission.projectId,
    missionId: mission.id,
    demo: project?.mode === 'demo',
    summary: `Missão "${mission.title}" falhou: ${error}`,
    payload: { error },
  });
}

/** Applies a human decision on an approval request. */
export async function resolveApproval(
  ctx: OrchestratorContext,
  approvalId: string,
  decision: 'approved' | 'rejected',
  userId: string,
  note?: string,
) {
  const [approval] = await ctx.db
    .update(approvals)
    .set({ status: decision, resolvedBy: userId, note: note ?? null, resolvedAt: new Date() })
    .where(and(eq(approvals.id, approvalId), eq(approvals.status, 'pending')))
    .returning();
  if (!approval) throw new Error('Aprovação não encontrada ou já resolvida.');
  const project = (await ctx.db.query.projects.findFirst({
    where: eq(projects.id, approval.projectId),
  }))!;
  const demo = project.mode === 'demo';
  await emitEvent(ctx, {
    type: 'approval.resolved',
    projectId: approval.projectId,
    missionId: approval.missionId,
    taskId: approval.taskId,
    demo,
    summary: `${decision === 'approved' ? 'Aprovado' : 'Rejeitado'}: ${approval.title}`,
    payload: { decision, kind: approval.kind, note: note ?? null },
  });

  if (approval.kind === 'mission_plan' && approval.missionId) {
    if (decision === 'rejected')
      return cancelMission(ctx, approval.missionId, 'Plano rejeitado pelo diretor.');
    await ctx.db
      .update(missions)
      .set({ status: 'running' })
      .where(eq(missions.id, approval.missionId));
    await emitEvent(ctx, {
      type: 'mission.started',
      projectId: approval.projectId,
      missionId: approval.missionId,
      demo,
      summary: 'Missão em execução',
      payload: {},
    });
    const missionTasks = await ctx.db.query.tasks.findMany({
      where: eq(tasks.missionId, approval.missionId),
    });
    for (const t of missionTasks) await refreshTaskReadiness(ctx, t.id);
    return;
  }

  if (approval.kind === 'task_result' && approval.taskId) {
    const task = await ctx.db.query.tasks.findFirst({ where: eq(tasks.id, approval.taskId) });
    if (!task) return;
    if (decision === 'approved') {
      if (task.missionId)
        await ctx.db
          .update(missions)
          .set({ status: 'running' })
          .where(
            and(eq(missions.id, task.missionId), eq(missions.status, 'awaiting_final_approval')),
          );
      await completeTask(ctx, task);
    } else if (task.attempts < task.maxAttempts) {
      // Rejection sends the task back with the director's feedback (bounded by maxAttempts).
      if (task.missionId)
        await ctx.db
          .update(missions)
          .set({ status: 'running' })
          .where(
            and(eq(missions.id, task.missionId), eq(missions.status, 'awaiting_final_approval')),
          );
      await ctx.db
        .update(tasks)
        .set({
          status: 'ready',
          instruction: `${task.instruction}\n\nFeedback do diretor: ${note ?? 'refazer com mais qualidade.'}`,
        })
        .where(eq(tasks.id, task.id));
      await setAgentStatus(ctx, task.assignedAgentId, 'idle');
      await emitEvent(ctx, {
        type: 'task.retrying',
        projectId: task.projectId,
        taskId: task.id,
        missionId: task.missionId,
        agentId: task.assignedAgentId,
        demo,
        summary: `Tarefa "${task.title}" devolvida para ajustes`,
        payload: { reason: 'rejected' },
      });
      await ctx.queue.enqueue({ kind: 'task', taskId: task.id });
    } else {
      await failTask(ctx, task, 'Resultado rejeitado e limite de tentativas atingido.');
    }
  }
}

export async function setAgentStatus(
  ctx: OrchestratorContext,
  agentId: string | null,
  status: Agent['status'],
  lastError?: string | null,
) {
  if (!agentId) return;
  await ctx.db
    .update(agents)
    .set({ status, ...(lastError !== undefined ? { lastError } : {}) })
    .where(eq(agents.id, agentId));
}

/** Moves a pending/waiting task to ready when all dependencies completed. */
export async function refreshTaskReadiness(ctx: OrchestratorContext, taskId: string) {
  const task = await ctx.db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task || !['pending', 'waiting_dependency'].includes(task.status)) return;
  const mission = task.missionId
    ? await ctx.db.query.missions.findFirst({ where: eq(missions.id, task.missionId) })
    : null;
  if (mission && mission.status !== 'running') return;
  const deps = await ctx.db
    .select({ status: tasks.status })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(eq(taskDependencies.taskId, taskId));
  const ready = deps.every((d) => d.status === 'completed');
  const next = ready ? 'ready' : 'waiting_dependency';
  if (next === task.status) return;
  const [updated] = await ctx.db
    .update(tasks)
    .set({ status: next })
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ['pending', 'waiting_dependency'])))
    .returning();
  if (updated && next === 'ready') {
    const project = await ctx.db.query.projects.findFirst({
      where: eq(projects.id, task.projectId),
    });
    await emitEvent(ctx, {
      type: 'task.ready',
      projectId: task.projectId,
      taskId,
      missionId: task.missionId,
      agentId: task.assignedAgentId,
      demo: project?.mode === 'demo',
      summary: `Tarefa pronta: ${task.title}`,
      payload: {},
    });
    await ctx.queue.enqueue({ kind: 'task', taskId });
  }
}

/** Marks a task complete, creates handoffs to dependents and advances the mission. */
export async function completeTask(ctx: OrchestratorContext, task: Task) {
  const [done] = await ctx.db
    .update(tasks)
    .set({ status: 'completed', completedAt: new Date(), error: null })
    .where(and(eq(tasks.id, task.id), inArray(tasks.status, ['running', 'awaiting_approval'])))
    .returning();
  if (!done) return;
  const project = (await ctx.db.query.projects.findFirst({
    where: eq(projects.id, task.projectId),
  }))!;
  const demo = project.mode === 'demo';
  const agent = task.assignedAgentId
    ? await ctx.db.query.agents.findFirst({ where: eq(agents.id, task.assignedAgentId) })
    : null;
  await setAgentStatus(ctx, task.assignedAgentId, 'idle', null);
  await emitEvent(ctx, {
    type: 'task.completed',
    projectId: task.projectId,
    taskId: task.id,
    missionId: task.missionId,
    agentId: task.assignedAgentId,
    demo,
    summary: `${agent?.name ?? 'Agente'} concluiu "${task.title}"`,
    payload: { artifactId: done.resultArtifactId },
  });
  await emitEvent(ctx, {
    type: 'agent.idle',
    projectId: task.projectId,
    agentId: task.assignedAgentId,
    demo,
    summary: `${agent?.name ?? 'Agente'} está disponível`,
    payload: {},
  });

  // Handoffs: share a scoped summary + artifact reference with each dependent task's agent.
  const dependents = await ctx.db
    .select({ task: tasks })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(eq(taskDependencies.dependsOnTaskId, task.id));
  const lastRun = await ctx.db.query.agentRuns.findFirst({
    where: and(eq(agentRuns.taskId, task.id), eq(agentRuns.status, 'succeeded')),
    orderBy: orm.desc(agentRuns.createdAt),
  });
  const summary = await taskOutputSummary(ctx.db, task.id);
  for (const { task: dep } of dependents) {
    if (dep.status === 'cancelled') continue;
    const toAgent = dep.assignedAgentId
      ? await ctx.db.query.agents.findFirst({ where: eq(agents.id, dep.assignedAgentId) })
      : null;
    const [h] = await ctx.db
      .insert(handoffs)
      .values({
        projectId: task.projectId,
        missionId: task.missionId,
        sourceTaskId: task.id,
        targetTaskId: dep.id,
        fromAgentId: task.assignedAgentId,
        toAgentId: dep.assignedAgentId,
        instruction: dep.instruction,
        contextSummary: summary,
        artifactIds: done.resultArtifactId ? [done.resultArtifactId] : [],
        status: 'delivered',
      })
      .returning();
    await emitEvent(ctx, {
      type: 'handoff.created',
      projectId: task.projectId,
      missionId: task.missionId,
      taskId: dep.id,
      agentId: task.assignedAgentId,
      demo,
      summary: `${agent?.name ?? 'Agente'} enviou "${task.title}" para ${toAgent?.name ?? 'a equipe'}`,
      payload: {
        handoffId: h!.id,
        fromAgentId: task.assignedAgentId,
        toAgentId: dep.assignedAgentId,
        runId: lastRun?.id ?? null,
      },
    });
    await refreshTaskReadiness(ctx, dep.id);
  }
  if (task.missionId) await maybeCompleteMission(ctx, task.missionId);
}

async function taskOutputSummary(db: Database, taskId: string): Promise<string> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task?.resultArtifactId) return task?.title ?? '';
  const version = await db.query.artifactVersions.findFirst({
    where: (v, { eq: e }) => e(v.artifactId, task.resultArtifactId!),
    orderBy: (v, { desc }) => desc(v.version),
  });
  return (version?.content ?? '').slice(0, ORCHESTRATION_LIMITS.maxHandoffSummaryChars);
}

async function maybeCompleteMission(ctx: OrchestratorContext, missionId: string) {
  const all = await ctx.db.query.tasks.findMany({ where: eq(tasks.missionId, missionId) });
  const open = all.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  if (open.length > 0) return;
  const [m] = await ctx.db
    .update(missions)
    .set({ status: 'completed', completedAt: new Date() })
    .where(
      and(
        eq(missions.id, missionId),
        inArray(missions.status, ['running', 'awaiting_final_approval']),
      ),
    )
    .returning();
  if (!m) return;
  const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, m.projectId) });
  await emitEvent(ctx, {
    type: 'mission.completed',
    projectId: m.projectId,
    missionId,
    demo: project?.mode === 'demo',
    summary: `Missão concluída: ${m.title}`,
    payload: { tasks: all.length },
  });
}

export async function failTask(ctx: OrchestratorContext, task: Task, error: string) {
  await ctx.db.update(tasks).set({ status: 'failed', error }).where(eq(tasks.id, task.id));
  await setAgentStatus(ctx, task.assignedAgentId, 'error', error);
  if (task.missionId) {
    const [m] = await ctx.db
      .update(missions)
      .set({ status: 'failed', error: `Tarefa "${task.title}" falhou.` })
      .where(
        and(
          eq(missions.id, task.missionId),
          inArray(missions.status, ['running', 'awaiting_final_approval']),
        ),
      )
      .returning();
    if (m) {
      const p = await ctx.db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
      await emitEvent(ctx, {
        type: 'mission.failed',
        projectId: task.projectId,
        missionId: m.id,
        demo: p?.mode === 'demo',
        summary: `Missão "${m.title}" interrompida: tarefa falhou (é possível reexecutá-la).`,
        payload: {},
      });
    }
  }
  const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, task.projectId) });
  await emitEvent(ctx, {
    type: 'task.failed',
    projectId: task.projectId,
    taskId: task.id,
    missionId: task.missionId,
    agentId: task.assignedAgentId,
    demo: project?.mode === 'demo',
    summary: `Tarefa "${task.title}" falhou: ${error}`,
    payload: { error },
  });
}

export async function cancelMission(ctx: OrchestratorContext, missionId: string, reason: string) {
  const [m] = await ctx.db
    .update(missions)
    .set({ status: 'cancelled', error: reason })
    .where(
      and(
        eq(missions.id, missionId),
        inArray(missions.status, [
          'planning',
          'awaiting_plan_approval',
          'running',
          'awaiting_final_approval',
        ]),
      ),
    )
    .returning();
  if (!m) return;
  await ctx.db
    .update(tasks)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(tasks.missionId, missionId),
        inArray(tasks.status, ['pending', 'ready', 'waiting_dependency', 'awaiting_approval']),
      ),
    );
  await ctx.db
    .update(approvals)
    .set({ status: 'rejected', note: reason, resolvedAt: new Date() })
    .where(and(eq(approvals.missionId, missionId), eq(approvals.status, 'pending')));
  // Running tasks are interrupted cooperatively.
  const running = await ctx.db.query.agentRuns.findMany({
    where: and(
      eq(agentRuns.missionId, missionId),
      inArray(agentRuns.status, ['queued', 'running']),
    ),
  });
  for (const r of running) await requestRunCancel(ctx, r.id);
  const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, m.projectId) });
  await emitEvent(ctx, {
    type: 'mission.cancelled',
    projectId: m.projectId,
    missionId,
    demo: project?.mode === 'demo',
    summary: `Missão cancelada: ${m.title}`,
    payload: { reason },
  });
}

export async function requestRunCancel(ctx: OrchestratorContext, runId: string) {
  await ctx.db.update(agentRuns).set({ cancelRequested: true }).where(eq(agentRuns.id, runId));
  await ctx.redis.publish('ai-office:run-control', JSON.stringify({ runId, action: 'cancel' }));
}

/** Allows a failed task to run again (manual retry). */
export async function retryTask(ctx: OrchestratorContext, taskId: string) {
  const [t] = await ctx.db
    .update(tasks)
    .set({ status: 'ready', error: null, attempts: 0 })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, 'failed')))
    .returning();
  if (!t) throw new Error('Somente tarefas com falha podem ser reexecutadas.');
  if (t.missionId) {
    await ctx.db
      .update(missions)
      .set({ status: 'running', error: null })
      .where(and(eq(missions.id, t.missionId), eq(missions.status, 'failed')));
  }
  await ctx.queue.enqueue({ kind: 'task', taskId });
  return t;
}
