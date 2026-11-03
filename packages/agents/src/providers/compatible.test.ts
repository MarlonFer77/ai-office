import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './openai.js';
import { createAdapter } from '../factory.js';
import { computeCost, NON_CHAT_MODEL } from '../pricing.js';
import { jsonResponse, openaiFrame as f, sseResponse } from '../test-utils.js';

const chunk = (
  delta: Record<string, unknown>,
  finish: string | null = null,
  extra: Record<string, unknown> = {},
) => ({
  id: 'c',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'llama-x',
  choices: [{ index: 0, delta, finish_reason: finish }],
  ...extra,
});

function groq(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const client = new OpenAI({
    apiKey: 'gsk_test',
    baseURL: 'https://api.groq.com/openai/v1',
    maxRetries: 0,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return new OpenAIAdapter({ apiKey: 'unused', client, providerId: 'groq', label: 'Groq' });
}
const req = {
  model: 'llama-x',
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'oi' }],
  maxOutputTokens: 900,
};

describe('OpenAI-compatible providers (Groq)', () => {
  it('calls the Groq endpoint with max_tokens and reads x_groq usage', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        f(chunk({ role: 'assistant', content: 'Olá' })),
        f(chunk({}, 'stop', { x_groq: { usage: { prompt_tokens: 11, completion_tokens: 4 } } })),
        f('[DONE]'),
      ]),
    );
    const res = await groq(fetchMock).generate(req);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(900);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(res.text).toBe('Olá');
    expect(res.usage).toMatchObject({ inputTokens: 11, outputTokens: 4 });
  });

  it('retries once without tools when the model rejects tool definitions', async () => {
    const responses = [
      jsonResponse(400, {
        error: { message: 'tools are not supported by this model', type: 'invalid_request_error' },
      }),
      sseResponse([f(chunk({ content: 'sem ferramentas' }, 'stop')), f('[DONE]')]),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const res = await groq(fetchMock).generate({
      ...req,
      tools: [
        {
          name: 'list_project_artifacts',
          description: 'd',
          inputSchema: { type: 'object', properties: {} },
          run: async () => '',
        },
      ],
    });
    expect(res.text).toBe('sem ferramentas');
    const second = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(second.tools).toBeUndefined();
  });

  it('maps free-tier 429 to a retryable rate-limit error with the provider name', async () => {
    const err = await groq(async () =>
      jsonResponse(429, { error: { message: 'Rate limit reached for model', type: 'tokens' } }),
    )
      .generate(req)
      .catch((e) => e);
    expect(err.code).toBe('rate_limit');
    expect(err.retryable).toBe(true);
    const conn = await groq(async () => {
      throw new TypeError('fetch failed');
    })
      .generate(req)
      .catch((e) => e);
    expect(conn.message).toContain('Groq');
  });
});

describe('factory and pricing for compatible providers', () => {
  it('requires a key for Groq but not for Ollama, and only Ollama accepts a custom URL', () => {
    expect(() => createAdapter({ provider: 'groq' })).toThrow(/Groq/);
    const ollama = createAdapter({
      provider: 'ollama',
      baseUrl: 'http://192.168.0.10:11434/v1',
    }) as unknown as { client: OpenAI };
    expect(ollama.client.baseURL).toBe('http://192.168.0.10:11434/v1');
    const g = createAdapter({
      provider: 'groq',
      apiKey: 'gsk_x',
      baseUrl: 'http://evil.internal/v1',
    }) as unknown as { client: OpenAI; id: string };
    expect(g.client.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(g.id).toBe('groq');
  });

  it('records zero cost for local and declared free-tier usage, unknown otherwise', () => {
    const u = { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(computeCost('ollama', 'qwen', u, []).costUsd).toBe(0);
    expect(computeCost('groq', 'llama-x', u, [], { freeTier: true }).costUsd).toBe(0);
    expect(computeCost('groq', 'llama-x', u, []).costUsd).toBeNull();
  });

  it('recognises non-chat models', () => {
    expect(NON_CHAT_MODEL.test('whisper-large-v3')).toBe(true);
    expect(NON_CHAT_MODEL.test('canopylabs/orpheus-v1-english')).toBe(true);
    expect(NON_CHAT_MODEL.test('openai/gpt-oss-20b')).toBe(false);
    expect(NON_CHAT_MODEL.test('llama-3.3-70b-versatile')).toBe(false);
  });
});
