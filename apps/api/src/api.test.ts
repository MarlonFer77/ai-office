import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orm, providerConfigs } from '@ai-office/database';
import { executeTask, planMission, runChat } from '@ai-office/orchestrator';
import { createTestApp, resetDb, signUp, type TestApp } from './test/helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
beforeEach(async () => resetDb(t.h));
afterAll(async () => {
  await t.app.close();
  await t.h.close();
});

async function drain() {
  for (let job = t.queue.take(), i = 0; job && i < 100; job = t.queue.take(), i++) {
    if (job.kind === 'plan') await planMission(t.orch, job.missionId);
    else if (job.kind === 'task') await executeTask(t.orch, job.taskId);
    else await runChat(t.orch, job.runId);
  }
}

const api = (cookie: string) => ({
  get: (url: string) => t.app.inject({ method: 'GET', url, headers: { cookie } }),
  post: (url: string, payload?: unknown) =>
    t.app.inject({
      method: 'POST',
      url,
      headers: { cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    }),
  patch: (url: string, payload: unknown) =>
    t.app.inject({ method: 'PATCH', url, headers: { cookie }, payload: payload as object }),
  put: (url: string, payload: unknown) =>
    t.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object }),
});

describe('auth and authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('creates a workspace on first access and isolates projects between users', async () => {
    const a = api(await signUp(t.app, 'a@test.dev', 'Ana'));
    const b = api(await signUp(t.app, 'b@test.dev', 'Bruno'));
    const me = (await a.get('/api/me')).json();
    expect(me.user.email).toBe('a@test.dev');
    expect(me.workspaceId).toBeTruthy();

    const p = (await a.post('/api/projects', { name: 'Projeto A', mode: 'demo' })).json();
    expect((await b.get(`/api/projects/${p.id}`)).statusCode).toBe(404);
    expect((await b.get(`/api/projects/${p.id}/office`)).statusCode).toBe(404);
    expect((await b.get('/api/projects')).json()).toHaveLength(0);
    const agentsA = (await a.get(`/api/projects/${p.id}/agents`)).json();
    expect((await b.get(`/api/agents/${agentsA[0].id}/messages`)).statusCode).toBe(404);
    expect(
      (await b.post(`/api/agents/${agentsA[0].id}/messages`, { content: 'invasão' })).statusCode,
    ).toBe(404);
  });
});

describe('projects, agents and chat', () => {
  it('validates payloads', async () => {
    const a = api(await signUp(t.app, 'v@test.dev'));
    const res = await a.post('/api/projects', { name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('supports project CRUD, archive and office snapshot', async () => {
    const a = api(await signUp(t.app, 'c@test.dev'));
    const p = (
      await a.post('/api/projects', { name: 'P1', objective: 'Obj', mode: 'demo' })
    ).json();
    const office = (await a.get(`/api/projects/${p.id}/office`)).json();
    expect(office.rooms).toHaveLength(7);
    expect(office.agents).toHaveLength(5);
    expect(office.progress.percent).toBe(0);
    expect((await a.patch(`/api/projects/${p.id}`, { name: 'P1 renomeado' })).json().name).toBe(
      'P1 renomeado',
    );
    await a.post(`/api/projects/${p.id}/archive`, { archived: true });
    expect((await a.get('/api/projects')).json()).toHaveLength(0);
    expect((await a.get('/api/projects?archived=true')).json()).toHaveLength(1);
  });

  it('keeps chats per agent independent and persisted', async () => {
    const a = api(await signUp(t.app, 'd@test.dev'));
    const p = (
      await a.post('/api/projects', { name: 'P', mode: 'demo', starterTeam: false })
    ).json();
    const mk = (name: string) =>
      a.post(`/api/projects/${p.id}/agents`, {
        name,
        role: 'researcher',
        provider: 'demo',
        model: 'demo-sim-1',
      });
    const x = (await mk('Claude Estrategista')).json();
    const y = (await mk('Claude Pesquisador')).json();
    expect(
      (await a.post(`/api/agents/${x.id}/messages`, { content: 'mensagem para X' })).statusCode,
    ).toBe(202);
    // Before the worker runs, the input shows as pending.
    expect((await a.get(`/api/agents/${x.id}/messages`)).json().pending).toHaveLength(1);
    await drain();
    await a.post(`/api/agents/${y.id}/messages`, { content: 'mensagem para Y' });
    await drain();
    const mx = (await a.get(`/api/agents/${x.id}/messages`)).json();
    const my = (await a.get(`/api/agents/${y.id}/messages`)).json();
    expect(mx.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(mx.messages[0].content).toBe('mensagem para X');
    expect(mx.messages[1].demo).toBe(true);
    expect(my.messages.map((m: { content: string }) => m.content).join()).not.toContain(
      'mensagem para X',
    );
    const detail = (await a.get(`/api/agents/${x.id}`)).json();
    expect(detail.usage.runs).toBe(1);
    expect(detail.usage.costUsd).toBe(0);
  });

  it('pauses agents and cancels queued runs', async () => {
    const a = api(await signUp(t.app, 'e@test.dev'));
    const p = (
      await a.post('/api/projects', { name: 'P', mode: 'demo', starterTeam: false })
    ).json();
    const x = (
      await a.post(`/api/projects/${p.id}/agents`, {
        name: 'X',
        role: 'creative',
        provider: 'demo',
        model: 'demo-sim-1',
      })
    ).json();
    expect((await a.patch(`/api/agents/${x.id}`, { paused: true })).json().status).toBe('paused');
    const { run } = (await a.post(`/api/agents/${x.id}/messages`, { content: 'oi' })).json();
    expect((await a.post(`/api/runs/${run.id}/cancel`)).statusCode).toBe(200);
    await drain();
    const runs = (await a.get(`/api/agents/${x.id}/runs`)).json();
    expect(runs[0].status).toBe('cancelled');
  });
});

describe('missions over HTTP (demo mode)', () => {
  it('runs a full mission and exposes tasks, handoffs, artifacts and history', async () => {
    const a = api(await signUp(t.app, 'f@test.dev'));
    const p = (
      await a.post('/api/projects', { name: 'P', mode: 'demo', starterTeam: false })
    ).json();
    await a.post(`/api/projects/${p.id}/agents`, {
      name: 'Estrategista',
      role: 'strategist',
      provider: 'demo',
      model: 'demo-sim-1',
    });
    await a.post(`/api/projects/${p.id}/agents`, {
      name: 'Pesquisador',
      role: 'researcher',
      provider: 'demo',
      model: 'demo-sim-1',
    });
    const m = (
      await a.post(`/api/projects/${p.id}/missions`, {
        title: 'Lançamento',
        goal: 'Estratégia de lançamento',
      })
    ).json();
    expect(
      (await a.post(`/api/projects/${p.id}/missions`, { title: 'Outra', goal: 'x' })).statusCode,
    ).toBe(409);
    await drain();
    for (let i = 0; i < 3; i++) {
      const pending = (await a.get(`/api/projects/${p.id}/approvals?status=pending`)).json();
      if (!pending.length) break;
      expect(
        (await a.post(`/api/approvals/${pending[0].id}/resolve`, { decision: 'approved' }))
          .statusCode,
      ).toBe(200);
      await drain();
    }
    const detail = (await a.get(`/api/missions/${m.id}`)).json();
    expect(detail.mission.status).toBe('completed');
    expect(detail.progress.percent).toBe(100);
    expect(detail.handoffs).toHaveLength(1);
    expect(detail.tasks.map((x: { key: string }) => x.key)).toEqual(['plan', 'research']);
    expect(detail.tasks[1].dependsOn).toEqual([detail.tasks[0].id]);

    const library = (await a.get(`/api/projects/${p.id}/artifacts?q=pesquisa`)).json();
    expect(library.length).toBeGreaterThan(0);
    const dl = await a.get(`/api/artifacts/${library[0].id}/versions/1/download`);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.body).toContain('DEMONSTRAÇÃO');

    const v2 = await a.post(`/api/artifacts/${library[0].id}/versions`, {
      content: '# Revisado',
      note: 'ajuste',
    });
    expect(v2.json().version).toBe(2);

    const history = (await a.get(`/api/projects/${p.id}/events?limit=200`)).json();
    expect(history.some((e: { type: string }) => e.type === 'mission.completed')).toBe(true);
    const office = (await a.get(`/api/projects/${p.id}/office`)).json();
    expect(office.progress.percent).toBe(100);
  });
});

describe('provider credentials', () => {
  it('stores keys encrypted and never returns them', async () => {
    const a = api(await signUp(t.app, 'g@test.dev'));
    const res = await a.put('/api/providers/anthropic', {
      apiKey: 'sk-ant-super-secret-key-0001',
      enabled: true,
      defaultModel: 'claude-opus-5-5',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('super-secret');
    expect(res.json()).toMatchObject({ configured: true, keyHint: 'sk-a…0001' });
    const list = await a.get('/api/providers');
    expect(list.body).not.toContain('super-secret');
    const row = await t.h.db.query.providerConfigs.findFirst({
      where: orm.eq(providerConfigs.provider, 'anthropic'),
    });
    expect(row!.encryptedApiKey).toMatch(/^v1:/);
    expect(row!.encryptedApiKey).not.toContain('super-secret');
    const audit = (await a.get('/api/audit-logs')).json();
    expect(audit.some((l: { action: string }) => l.action === 'provider.credentials.update')).toBe(
      true,
    );
  });

  it('accepts price overrides without code changes', async () => {
    const a = api(await signUp(t.app, 'h@test.dev'));
    const res = await a.put('/api/prices', {
      provider: 'openai',
      model: 'my-model',
      inputPerMTokUsd: 1,
      outputPerMTokUsd: 2,
      source: 'Tabela oficial consultada em 2026-11-02',
    });
    expect(res.statusCode).toBe(200);
    expect((await a.get('/api/prices')).json().overrides).toHaveLength(1);
  });
});
