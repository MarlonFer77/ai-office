import { describe, expect, it } from 'vitest';
import { computeCost, DEFAULT_MODEL_PRICES } from './pricing.js';
import { buildDemoPlan, parsePlan } from './prompts.js';
import { decryptSecret, encryptSecret, keyHint } from './crypto.js';
import { DemoAdapter } from './providers/demo.js';

describe('pricing', () => {
  it('computes cost from published prices', () => {
    const r = computeCost('anthropic', 'claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }, DEFAULT_MODEL_PRICES);
    expect(r.costUsd).toBe(6);
  });
  it('returns null (unknown) instead of inventing a price', () => {
    expect(computeCost('openai', 'gpt-x', { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, DEFAULT_MODEL_PRICES).costUsd).toBeNull();
  });
  it('demo runs cost zero', () => {
    expect(computeCost('demo', 'demo-sim-1', { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, []).costUsd).toBe(0);
  });
});

describe('plans', () => {
  it('builds a valid demo plan for a two-agent team', () => {
    const plan = buildDemoPlan('Lançar app', ['strategist', 'researcher']);
    expect(plan.tasks.map((t) => t.key)).toEqual(['plan', 'research']);
    expect(plan.tasks.at(-1)?.requiresApproval).toBe(true);
  });
  it('parses JSON wrapped in prose and rejects cycles/unknown roles', () => {
    const ok = parsePlan('Aqui: {"summary":"s","tasks":[{"key":"a","title":"A","instruction":"i","role":"researcher"}]} fim', ['researcher']);
    expect(ok.tasks).toHaveLength(1);
    expect(() =>
      parsePlan('{"summary":"s","tasks":[{"key":"a","title":"A","instruction":"i","role":"researcher","dependsOn":["b"]},{"key":"b","title":"B","instruction":"i","role":"researcher"}]}', ['researcher']),
    ).toThrow(/cíclica/);
    expect(() => parsePlan('{"summary":"s","tasks":[{"key":"a","title":"A","instruction":"i","role":"creative"}]}', ['researcher'])).toThrow(/Papel/);
  });
});

describe('crypto', () => {
  it('round-trips and hides secrets', () => {
    const enc = encryptSecret('sk-ant-secret-123456', 'a-very-long-encryption-key');
    expect(enc).not.toContain('secret');
    expect(decryptSecret(enc, 'a-very-long-encryption-key')).toBe('sk-ant-secret-123456');
    expect(() => decryptSecret(enc, 'another-long-encryption-key')).toThrow();
    expect(keyHint('sk-ant-secret-123456')).toBe('sk-a…3456');
  });
});

describe('DemoAdapter', () => {
  it('is deterministic and labelled as demonstration', async () => {
    const a = new DemoAdapter();
    const req = { model: 'demo-sim-1', system: '[role:researcher] x', messages: [{ role: 'user' as const, content: 'Tarefa: Pesquisa' }], maxOutputTokens: 100 };
    const r1 = await a.generate(req);
    const r2 = await a.generate(req);
    expect(r1.text).toBe(r2.text);
    expect(r1.text).toContain('DEMONSTRAÇÃO');
    expect(r1.demo).toBe(true);
  });
});
