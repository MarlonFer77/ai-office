import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '@ai-office/agents';
import { agents, orm, providerConfigs, usageRecords } from '@ai-office/database';
import { createAgent, createProject } from './bootstrap.js';
import { executeTask, runAgentTurn } from './execution.js';
import { ProviderBusyError } from './providers.js';
import { createMission, planMission, resolveApproval } from './missions.js';
import { makeContext, resetDb, ScriptedAdapter, seedUser, testDb } from './test-helpers.js';

const { eq } = orm;

beforeEach(async () => resetDb(await testDb()));
afterAll(async () => (await testDb()).close());

async function setupGroq(
  adapter: ScriptedAdapter,
  cfg: Partial<typeof providerConfigs.$inferInsert> = {},
) {
  const env = await makeContext({ adapterOverride: () => adapter });
  const { userId, workspaceId } = await seedUser(env.h);
  await env.h.db.insert(providerConfigs).values({
    workspaceId,
    provider: 'groq',
    encryptedApiKey: encryptSecret('gsk_test_key_123', env.ctx.config.encryptionKey),
    keyHint: 'gsk_…_123',
    enabled: true,
    freeTier: true,
    defaultModel: 'llama-test',
    ...cfg,
  });
  const p = await createProject(env.ctx, {
    name: 'G',
    objective: '',
    description: '',
    mode: 'real',
    budgetLimitUsd: null,
    starterTeam: false,
    workspaceId,
    userId,
  });
  const mk = (name: string) =>
    createAgent(env.ctx, p.id, {
      name,
      role: 'researcher',
      provider: 'groq',
      model: 'llama-test',
      systemPrompt: '',
      budgetLimitUsd: null,
      maxOutputTokens: 4000,
    });
  return { ...env, p, userId, workspaceId, mk };
}

describe('Groq (OpenAI-compatible) provider in the orchestrator', () => {
  it('records free-tier runs at zero cost and caps output tokens', async () => {
    const adapter = new ScriptedAdapter();
    const { ctx, h, p, mk } = await setupGroq(adapter);
    const a = await mk('Groq Pesquisador');
    await runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'oi' });
    expect(adapter.calls[0]!.maxOutputTokens).toBe(1500);
    const [u] = await h.db.query.usageRecords.findMany({ where: eq(usageRecords.agentId, a.id) });
    expect(u!.provider).toBe('groq');
    expect(u!.costUsd).toBe(0);
    expect(u!.priceSource).toMatch(/gratuito/);
  });

  it('records unknown cost when the account is not declared free', async () => {
    const adapter = new ScriptedAdapter();
    const { ctx, h, p, mk } = await setupGroq(adapter, { freeTier: false });
    const a = await mk('Groq Pago');
    await runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'oi' });
    const [u] = await h.db.query.usageRecords.findMany({ where: eq(usageRecords.agentId, a.id) });
    expect(u!.costUsd).toBeNull();
  });

  it('trims long histories to the free-tier token budget', async () => {
    const adapter = new ScriptedAdapter(() => 'x'.repeat(4000));
    const { ctx, p, mk } = await setupGroq(adapter);
    const a = await mk('Groq Longo');
    for (let i = 0; i < 6; i++) {
      const fresh = (await ctx.db.query.agents.findFirst({ where: eq(agents.id, a.id) }))!;
      await runAgentTurn(ctx, {
        agent: fresh,
        project: p,
        kind: 'chat',
        prompt: `pergunta ${i} ${'y'.repeat(1000)}`,
      });
    }
    const last = adapter.calls.at(-1)!;
    const chars = last.messages.reduce((n, m) => n + m.content.length, 0) + last.system.length;
    expect(chars).toBeLessThanOrEqual(3500 * 4 + 2000);
    expect(last.messages.at(-1)!.content).toContain('pergunta 5');
    expect(last.messages[0]!.role).toBe('user');
  });

  it('limits simultaneous runs per provider and re-queues tasks instead of failing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const adapter = new ScriptedAdapter(async (req) => {
      if (req.messages.at(-1)!.content === 'bloqueia') await gate;
      return 'ok';
    });
    const { ctx, h, p, mk, queue, userId } = await setupGroq(adapter, { maxConcurrency: 1 });
    const a = await mk('Groq A');
    const b = await mk('Groq B');
    const first = runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'bloqueia' });
    await new Promise((r) => setTimeout(r, 100));
    await expect(
      runAgentTurn(ctx, { agent: b, project: p, kind: 'chat', prompt: 'oi' }),
    ).rejects.toBeInstanceOf(ProviderBusyError);
    // No orphan run or message was written for the rejected attempt.
    expect(
      await h.db.query.agentRuns.findMany({ where: (r, { eq: e }) => e(r.agentId, b.id) }),
    ).toHaveLength(0);

    // A task that hits the busy provider goes back to "ready" with a delayed retry.
    adapter.calls.length = 0;
    const plan =
      '{"summary":"s","tasks":[{"key":"t1","title":"T1","instruction":"i","role":"researcher"}]}';
    const planner = new ScriptedAdapter(() => plan);
    ctx.adapterOverride = (prov) => (prov === 'groq' ? planner : undefined);
    release();
    await first;
    const m = await createMission(ctx, p.id, { title: 'M', goal: 'G' }, userId);
    await planMission(ctx, queue.take()!.kind === 'plan' ? m.id : m.id);
    const approval = await h.db.query.approvals.findFirst({
      where: (x, { eq: e }) => e(x.missionId, m.id),
    });
    await resolveApproval(ctx, approval!.id, 'approved', userId);
    const taskJob = queue.jobs.find((j) => j.job.kind === 'task')!.job as { taskId: string };
    queue.jobs.length = 0;
    // Occupy the only slot with a blocked chat, then try the task.
    let release2!: () => void;
    const gate2 = new Promise<void>((r) => (release2 = r));
    ctx.adapterOverride = () => new ScriptedAdapter(async () => (await gate2, 'ok'));
    const blocker = runAgentTurn(ctx, { agent: a, project: p, kind: 'chat', prompt: 'segura' });
    await new Promise((r) => setTimeout(r, 100));
    expect(await executeTask(ctx, taskJob.taskId)).toBe('requeued');
    const t = await h.db.query.tasks.findFirst({
      where: (x, { eq: e }) => e(x.id, taskJob.taskId),
    });
    expect(t!.status).toBe('ready');
    expect(t!.attempts).toBe(0);
    expect(queue.jobs[0]!.delayMs).toBeGreaterThan(0);
    release2();
    await blocker;
  });

  it('builds the starter team on Groq when it is the configured provider', async () => {
    const adapter = new ScriptedAdapter();
    const env = await makeContext({ adapterOverride: () => adapter });
    const { userId, workspaceId } = await seedUser(env.h);
    await env.h.db.insert(providerConfigs).values({
      workspaceId,
      provider: 'groq',
      encryptedApiKey: encryptSecret('gsk_test_key_123', env.ctx.config.encryptionKey),
      enabled: true,
      freeTier: true,
      availableModels: ['whisper-large-v3', 'modelo-chat-1'],
    });
    const p = await createProject(env.ctx, {
      name: 'S',
      objective: '',
      description: '',
      mode: 'real',
      budgetLimitUsd: null,
      starterTeam: true,
      workspaceId,
      userId,
    });
    const team = await env.h.db.query.agents.findMany({ where: eq(agents.projectId, p.id) });
    expect(team.every((x) => x.provider === 'groq' && x.model === 'modelo-chat-1')).toBe(true);
    expect(team[0]!.name).toBe('Groq Estrategista');
  });
});
