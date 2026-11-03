import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { orm, providerConfigs, usageRecords } from '@ai-office/database';
import { runChat } from '@ai-office/orchestrator';
import { createTestApp, resetDb, signUp, type TestApp } from './test/helpers.js';

let t: TestApp;
let fake: Server;
let fakeUrl: string;
const requests: { path: string; body: Record<string, unknown> | null }[] = [];

beforeAll(async () => {
  t = await createTestApp();
  // Minimal OpenAI-compatible server (stands in for a local Ollama).
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) : null });
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [
              { id: 'qwen-local', object: 'model', created: 0, owned_by: 'me' },
              { id: 'nomic-embed-text', object: 'model', created: 0, owned_by: 'me' },
            ],
          }),
        );
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const frame = (d: unknown) => res.write(`data: ${JSON.stringify(d)}\n\n`);
        const base = { id: 'x', object: 'chat.completion.chunk', created: 1, model: 'qwen-local' };
        frame({
          ...base,
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Resposta ' }, finish_reason: null },
          ],
        });
        frame({
          ...base,
          choices: [{ index: 0, delta: { content: 'local' }, finish_reason: 'stop' }],
        });
        frame({
          ...base,
          choices: [],
          usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22 },
        });
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
});
beforeEach(async () => resetDb(t.h));
afterAll(async () => {
  fake.close();
  await t.app.close();
  await t.h.close();
});

const api = (cookie: string) => ({
  get: (url: string) => t.app.inject({ method: 'GET', url, headers: { cookie } }),
  post: (url: string, payload?: unknown) =>
    t.app.inject({
      method: 'POST',
      url,
      headers: { cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    }),
  put: (url: string, payload: unknown) =>
    t.app.inject({ method: 'PUT', url, headers: { cookie }, payload: payload as object }),
});

describe('Groq provider settings', () => {
  it('lists all providers with presets and stores the Groq key encrypted as free tier', async () => {
    const a = api(await signUp(t.app, 'groq@test.dev'));
    const list = (await a.get('/api/providers')).json();
    expect(list.map((p: { provider: string }) => p.provider)).toEqual([
      'anthropic',
      'openai',
      'groq',
      'openrouter',
      'ollama',
    ]);
    const groq = list.find((p: { provider: string }) => p.provider === 'groq');
    expect(groq).toMatchObject({
      requiresApiKey: true,
      baseUrl: 'https://api.groq.com/openai/v1',
      freeTier: true,
      configured: false,
    });

    expect((await a.put('/api/providers/groq', { enabled: true })).statusCode).toBe(400);
    const saved = await a.put('/api/providers/groq', {
      apiKey: 'gsk_super_secret_value_99',
      enabled: true,
      defaultModel: 'llama-x',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('super_secret');
    expect(saved.json()).toMatchObject({ configured: true, freeTier: true, keyHint: 'gsk_…e_99' });
    const row = await t.h.db.query.providerConfigs.findFirst({
      where: orm.eq(providerConfigs.provider, 'groq'),
    });
    expect(row!.encryptedApiKey).toMatch(/^v1:/);
    expect(row!.freeTier).toBe(true);
  });

  it('refuses to change fixed provider URLs (SSRF protection)', async () => {
    const a = api(await signUp(t.app, 'ssrf@test.dev'));
    const res = await a.put('/api/providers/groq', {
      apiKey: 'gsk_super_secret_value_99',
      baseUrl: 'http://169.254.169.254/latest',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Local OpenAI-compatible provider end-to-end', () => {
  it('verifies the server, lists chat models and runs a real chat turn through the SDK at zero cost', async () => {
    const a = api(await signUp(t.app, 'local@test.dev'));
    expect(
      (
        await a.put('/api/providers/ollama', {
          enabled: true,
          baseUrl: fakeUrl,
          defaultModel: 'qwen-local',
        })
      ).statusCode,
    ).toBe(200);
    const verified = (await a.post('/api/providers/ollama/verify', {})).json();
    expect(verified.lastCheckOk).toBe(true);
    expect(verified.availableModels).toEqual(['qwen-local']); // embedding model filtered out

    const p = (
      await a.post('/api/projects', { name: 'Local', mode: 'real', starterTeam: false })
    ).json();
    const agent = (
      await a.post(`/api/projects/${p.id}/agents`, {
        name: 'Local Pesquisador',
        role: 'researcher',
        provider: 'ollama',
        model: 'qwen-local',
      })
    ).json();
    const { run } = (
      await a.post(`/api/agents/${agent.id}/messages`, { content: 'Olá, modelo local' })
    ).json();
    expect(run.demo).toBe(false);
    for (let job = t.queue.take(); job; job = t.queue.take())
      if (job.kind === 'chat') await runChat(t.orch, job.runId);

    const msgs = (await a.get(`/api/agents/${agent.id}/messages`)).json();
    expect(msgs.messages.map((m: { content: string }) => m.content)).toEqual([
      'Olá, modelo local',
      'Resposta local',
    ]);
    expect(msgs.messages[1].demo).toBe(false);
    const chat = requests.find((r) => r.path === '/v1/chat/completions')!;
    expect(chat.body!.model).toBe('qwen-local');
    expect(chat.body!.max_tokens).toBeLessThanOrEqual(1500);
    const [usage] = await t.h.db.query.usageRecords.findMany({
      where: orm.eq(usageRecords.agentId, agent.id),
    });
    expect(usage).toMatchObject({
      provider: 'ollama',
      inputTokens: 20,
      outputTokens: 2,
      costUsd: 0,
    });
  });
});
