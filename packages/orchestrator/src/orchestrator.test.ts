import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ProviderError } from '@ai-office/agents';
import { agentRuns, agents, agentSessions, approvals, artifactVersions, artifacts, events, handoffs, messages, missions, orm, tasks, usageRecords } from '@ai-office/database';
import { createAgent, createProject } from './bootstrap.js';
import { abortLocalRun, executeTask, runAgentTurn, runChat, SessionBusyError } from './execution.js';
import { createMission, planMission, resolveApproval, retryTask } from './missions.js';
import type { OrchestratorContext } from './context.js';
import type { MemoryJobQueue } from './queue.js';
import { makeContext, resetDb, ScriptedAdapter, seedUser, testDb } from './test-helpers.js';

const { eq, asc } = orm;

/** Drains the in-memory queue like the worker would. */
async function drain(ctx: OrchestratorContext, queue: MemoryJobQueue, max = 100) {
  for (let i = 0; i < max; i++) {
    const job = queue.take();
    if (!job) return i;
    if (job.kind === 'plan') await planMission(ctx, job.missionId);
    else if (job.kind === 'task') await executeTask(ctx, job.taskId);
    else await runChat(ctx, job.runId);
  }
  throw new Error('queue did not drain');
}

beforeEach(async () => resetDb(await testDb()));
afterAll(async () => (await testDb()).close());

describe('projects and agents', () => {
  it('creates a project with 7 rooms and an isolated session per starter agent', async () => {
    const { ctx, h } = await makeContext();
    const { userId, workspaceId } = await seedUser(h);
    const p = await createProject(ctx, { name: 'P', objective: '', description: '', mode: 'demo', budgetLimitUsd: null, starterTeam: true, workspaceId, userId });
    const team = await h.db.query.agents.findMany({ where: eq(agents.projectId, p.id) });
    expect(team).toHaveLength(5);
    const rooms = await h.db.query.rooms.findMany({ where: (r, { eq: e }) => e(r.projectId, p.id) });
    expect(rooms).toHaveLength(7);
    const sessions = await h.db.query.agentSessions.findMany({ where: eq(agentSessions.projectId, p.id) });
    expect(new Set(sessions.map((s) => s.agentId)).size).toBe(5);
  });
});

describe('session isolation', () => {
  it('two agents on the same provider keep separate histories', async () => {
    const adapter = new ScriptedAdapter();
    const { ctx, h } = await makeContext({ adapterOverride: () => adapter });
    const { userId, workspaceId } = await seedUser(h);
    const p = await createProject(ctx, { name: 'P', objective: '', description: '', mode: 'real', budgetLimitUsd: null, starterTeam: false, workspaceId, userId });
    const base = { provider: 'anthropic' as const, model: 'claude-opus-5-5', systemPrompt: '', budgetLimitUsd: null, maxOutputTokens: 1000 };
    const a = await createAgent(ctx, p.id, { ...base, name: 'Claude Estrategista', role: 'strategist' });
    const b = await createAgent(ctx, p.id, { ...base, name: 'Claude Pesquisador', role: 'researcher' });
    await runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'segredo-do-A' });
    await runAgentTurn(ctx, { agent: b, project: p, kind: 'chat', prompt: 'pergunta-do-B' });
    await runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'continuação-A' });
    const [callA1, callB, callA2] = adapter.calls;
    expect(callB!.messages.map((m) => m.content).join('|')).not.toContain('segredo-do-A');
    expect(callB!.messages).toHaveLength(1);
    // Agent A continues where it left off: user, assistant, user.
    expect(callA2!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(callA2!.messages[0]!.content).toBe('segredo-do-A');
    expect(callA1!.system).toContain('Claude Estrategista');
    const usage = await h.db.query.usageRecords.findMany({ where: eq(usageRecords.projectId, p.id) });
    expect(usage).toHaveLength(3);
    expect(usage[0]!.costUsd).toBeCloseTo((100 * 4 + 50 * 20) / 1e6, 8);
  });

  it('prevents concurrent runs on the same session', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const adapter = new ScriptedAdapter(async () => {
      await gate;
      return 'ok';
    });
    const { ctx, h } = await makeContext({ adapterOverride: () => adapter });
    const { userId, workspaceId } = await seedUser(h);
    const p = await createProject(ctx, { name: 'P', objective: '', description: '', mode: 'real', budgetLimitUsd: null, starterTeam: false, workspaceId, userId });
    const a = await createAgent(ctx, p.id, { name: 'A', role: 'strategist', provider: 'anthropic', model: 'claude-opus-5-5', systemPrompt: '', budgetLimitUsd: null, maxOutputTokens: 1000 });
    const first = runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: '1' });
    await new Promise((r) => setTimeout(r, 100));
    await expect(runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: '2' })).rejects.toBeInstanceOf(SessionBusyError);
    release();
    await first;
    const session = await h.db.query.agentSessions.findFirst({ where: eq(agentSessions.agentId, a.id) });
    expect(session!.activeRunId).toBeNull();
  });
});

describe('mission orchestration (demo mode)', () => {
  it('runs plan → approval → tasks → handoff → artifact → final approval → completed', async () => {
    const { ctx, h, queue, redis } = await makeContext();
    const { userId, workspaceId } = await seedUser(h);
    const p = await createProject(ctx, { name: 'Demo', objective: '', description: '', mode: 'demo', budgetLimitUsd: null, starterTeam: false, workspaceId, userId });
    const base = { provider: 'demo' as const, model: 'demo-sim-1', systemPrompt: '', budgetLimitUsd: null, maxOutputTokens: 1000 };
    await createAgent(ctx, p.id, { ...base, name: 'Estrategista', role: 'strategist' });
    await createAgent(ctx, p.id, { ...base, name: 'Pesquisador', role: 'researcher' });

    const mission = await createMission(ctx, p.id, { title: 'Lançamento', goal: 'Estratégia de lançamento de software financeiro' }, userId);
    await drain(ctx, queue);
    let m = await h.db.query.missions.findFirst({ where: eq(missions.id, mission.id) });
    expect(m!.status).toBe('awaiting_plan_approval');
    const planApproval = await h.db.query.approvals.findFirst({ where: eq(approvals.missionId, mission.id) });
    expect(planApproval!.kind).toBe('mission_plan');

    await resolveApproval(ctx, planApproval!.id, 'approved', userId);
    await drain(ctx, queue);

    const ts = await h.db.query.tasks.findMany({ where: eq(tasks.missionId, mission.id), orderBy: asc(tasks.createdAt) });
    expect(ts.map((t) => t.key)).toEqual(['plan', 'research']);
    expect(ts[0]!.status).toBe('completed');
    expect(ts[1]!.status).toBe('awaiting_approval');

    const hs = await h.db.query.handoffs.findMany({ where: eq(handoffs.missionId, mission.id) });
    expect(hs).toHaveLength(1);
    expect(hs[0]!.status).toBe('consumed');
    expect(hs[0]!.contextSummary).toContain('DEMONSTRAÇÃO');

    // The researcher's briefing contained the handoff from the strategist.
    const researcherMsgs = await h.db.query.messages.findMany({ where: eq(messages.agentId, ts[1]!.assignedAgentId!), orderBy: asc(messages.seq) });
    expect(researcherMsgs[0]!.content).toContain('<handoff de="Estrategista"');

    const finalApproval = await h.db.query.approvals.findFirst({ where: eq(approvals.taskId, ts[1]!.id) });
    await resolveApproval(ctx, finalApproval!.id, 'approved', userId);
    await drain(ctx, queue);
    m = await h.db.query.missions.findFirst({ where: eq(missions.id, mission.id) });
    expect(m!.status).toBe('completed');

    const arts = await h.db.query.artifacts.findMany({ where: eq(artifacts.projectId, p.id) });
    expect(arts).toHaveLength(2);
    expect(arts.every((a) => a.demo)).toBe(true);

    const evs = await h.db.query.events.findMany({ where: eq(events.projectId, p.id), orderBy: asc(events.id) });
    const types = evs.map((e) => e.type);
    for (const t of ['mission.created', 'mission.planned', 'approval.requested', 'task.started', 'handoff.created', 'handoff.completed', 'artifact.created', 'task.completed', 'mission.completed']) {
      expect(types).toContain(t);
    }
    expect(evs.every((e) => e.demo)).toBe(true);
    // Ids are strictly increasing (replay order guaranteed).
    expect(evs.map((e) => e.id)).toEqual([...evs.map((e) => e.id)].sort((x, y) => x - y));
    expect(redis.published.some((p2) => p2.message.includes('agent.message.delta'))).toBe(true);
  });

  it('rejecting the final deliverable sends the task back with feedback and versions the artifact', async () => {
    const { ctx, h, queue } = await makeContext();
    const { userId, workspaceId } = await seedUser(h);
    const p = await createProject(ctx, { name: 'Demo', objective: '', description: '', mode: 'demo', budgetLimitUsd: null, starterTeam: false, workspaceId, userId });
    await createAgent(ctx, p.id, { name: 'Solo', role: 'strategist', provider: 'demo', model: 'demo-sim-1', systemPrompt: '', budgetLimitUsd: null, maxOutputTokens: 1000 });
    const mission = await createMission(ctx, p.id, { title: 'M', goal: 'G' }, userId);
    await drain(ctx, queue);
    const plan = await h.db.query.approvals.findFirst({ where: eq(approvals.missionId, mission.id) });
    await resolveApproval(ctx, plan!.id, 'approved', userId);
    await drain(ctx, queue);
    const task = (await h.db.query.tasks.findFirst({ where: eq(tasks.missionId, mission.id) }))!;
    const ap = await h.db.query.approvals.findFirst({ where: eq(approvals.taskId, task.id) });
    await resolveApproval(ctx, ap!.id, 'rejected', userId, 'Mais detalhes');
    await drain(ctx, queue);
    const after = (await h.db.query.tasks.findFirst({ where: eq(tasks.id, task.id) }))!;
    expect(after.status).toBe('awaiting_approval');
    expect(after.instruction).toContain('Mais detalhes');
    const versions = await h.db.query.artifactVersions.findMany({ where: eq(artifactVersions.artifactId, after.resultArtifactId!) });
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});

describe('failures, retries, interruption and budgets', () => {
  async function setupRealTask(adapter: ScriptedAdapter | { generate: ScriptedAdapter['generate'] }, budget: number | null = null) {
    const ad = adapter as ScriptedAdapter;
    const env = await makeContext({ adapterOverride: () => ad });
    const { userId, workspaceId } = await seedUser(env.h);
    const p = await createProject(env.ctx, { name: 'R', objective: '', description: '', mode: 'real', budgetLimitUsd: budget, starterTeam: false, workspaceId, userId });
    await createAgent(env.ctx, p.id, { name: 'Solo', role: 'strategist', provider: 'anthropic', model: 'claude-opus-5-5', systemPrompt: '', budgetLimitUsd: null, maxOutputTokens: 1000 });
    return { ...env, p, userId };
  }

  it('retries retryable provider errors with backoff, then fails and allows manual retry', async () => {
    let n = 0;
    const adapter = new ScriptedAdapter((req) => {
      n++;
      if (req.messages.at(-1)!.content.includes('Crie um plano')) {
        return '{"summary":"s","tasks":[{"key":"t1","title":"T1","instruction":"faça","role":"strategist","requiresApproval":false}]}';
      }
      throw new ProviderError('rate_limit', 'Limite', true, 429);
    });
    const { ctx, h, queue, p, userId } = await setupRealTask(adapter);
    const mission = await createMission(ctx, p.id, { title: 'M', goal: 'G' }, userId);
    await drain(ctx, queue);
    const plan = await h.db.query.approvals.findFirst({ where: eq(approvals.missionId, mission.id) });
    await resolveApproval(ctx, plan!.id, 'approved', userId);
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = queue.jobs.shift();
      if (!next) break;
      if (next.delayMs) delays.push(next.delayMs);
      if (next.job.kind === 'task') await executeTask(ctx, next.job.taskId);
    }
    const task = (await h.db.query.tasks.findFirst({ where: eq(tasks.missionId, mission.id) }))!;
    expect(task.status).toBe('failed');
    expect(task.attempts).toBe(3);
    expect(delays).toEqual([2000, 4000]);
    expect(n).toBe(4);
    expect((await h.db.query.missions.findFirst({ where: eq(missions.id, mission.id) }))!.status).toBe('failed');
    const evs = await h.db.query.events.findMany({ where: eq(events.projectId, p.id) });
    expect(evs.filter((e) => e.type === 'task.retrying')).toHaveLength(2);

    await retryTask(ctx, task.id);
    expect((await h.db.query.tasks.findFirst({ where: eq(tasks.id, task.id) }))!.status).toBe('ready');
  });

  it('non-retryable auth errors fail immediately', async () => {
    const adapter = new ScriptedAdapter(() => {
      throw new ProviderError('auth', 'Credenciais inválidas', false, 401);
    });
    const { ctx, h, p } = await setupRealTask(adapter);
    const agent = (await h.db.query.agents.findFirst({ where: eq(agents.projectId, p.id) }))!;
    await expect(runAgentTurn(ctx, { agent, project: p, kind: 'chat', prompt: 'oi' })).rejects.toThrow('Credenciais');
    const a2 = (await h.db.query.agents.findFirst({ where: eq(agents.id, agent.id) }))!;
    expect(a2.status).toBe('error');
    const run = await h.db.query.agentRuns.findFirst({ where: eq(agentRuns.agentId, agent.id) });
    expect(run!.status).toBe('failed');
  });

  it('interrupting a run cancels it and keeps the partial answer', async () => {
    const adapter = new ScriptedAdapter(async (req) => {
      req.onDelta?.('parcial ');
      await new Promise((_r, reject) => req.signal!.addEventListener('abort', () => reject(new ProviderError('aborted', 'Execução interrompida.', false))));
      return '';
    });
    const { ctx, h, p } = await setupRealTask(adapter);
    const agent = (await h.db.query.agents.findFirst({ where: eq(agents.projectId, p.id) }))!;
    const pending = runAgentTurn(ctx, { agent, project: p, kind: 'chat', prompt: 'escreva muito' }).catch((e) => e);
    await new Promise((r) => setTimeout(r, 150));
    const run = await h.db.query.agentRuns.findFirst({ where: eq(agentRuns.agentId, agent.id) });
    expect(abortLocalRun(run!.id)).toBe(true);
    const err = await pending;
    expect(err.code).toBe('aborted');
    const r2 = await h.db.query.agentRuns.findFirst({ where: eq(agentRuns.id, run!.id) });
    expect(r2!.status).toBe('cancelled');
    const msgs = await h.db.query.messages.findMany({ where: eq(messages.agentId, agent.id), orderBy: asc(messages.seq) });
    expect(msgs.at(-1)!.content).toContain('[interrompido]');
  });

  it('blocks real runs when the project budget is exhausted', async () => {
    const adapter = new ScriptedAdapter();
    const { ctx, h, p } = await setupRealTask(adapter, 0);
    const agent = (await h.db.query.agents.findFirst({ where: eq(agents.projectId, p.id) }))!;
    await expect(runAgentTurn(ctx, { agent, project: p, kind: 'chat', prompt: 'oi' })).rejects.toMatchObject({ code: 'budget' });
    expect(adapter.calls).toHaveLength(0);
    const evs = await h.db.query.events.findMany({ where: eq(events.projectId, p.id) });
    expect(evs.some((e) => e.type === 'budget.exceeded')).toBe(true);
  });
});
