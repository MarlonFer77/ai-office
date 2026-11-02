import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './openai.js';
import { jsonResponse, openaiFrame as f, sseResponse } from '../test-utils.js';

const chunk = (
  delta: Record<string, unknown>,
  finish: string | null = null,
  extra: Record<string, unknown> = {},
) => ({
  id: 'c1',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'gpt-test',
  choices: [{ index: 0, delta, finish_reason: finish }],
  ...extra,
});
const usageChunk = (p: number, c: number) => ({
  id: 'c1',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'gpt-test',
  choices: [],
  usage: { prompt_tokens: p, completion_tokens: c, total_tokens: p + c },
});

function adapterWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const client = new OpenAI({
    apiKey: 'sk-test',
    maxRetries: 0,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return new OpenAIAdapter({ apiKey: 'unused', client });
}
const baseReq = {
  model: 'gpt-test',
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'oi' }],
  maxOutputTokens: 100,
};

describe('OpenAIAdapter', () => {
  it('streams content and records usage from the final chunk', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        f(chunk({ role: 'assistant', content: 'Olá' })),
        f(chunk({ content: '!' }, 'stop')),
        f(usageChunk(9, 3)),
        f('[DONE]'),
      ]),
    );
    const deltas: string[] = [];
    const res = await adapterWith(fetchMock).generate({
      ...baseReq,
      onDelta: (d) => deltas.push(d),
    });
    expect(res.text).toBe('Olá!');
    expect(deltas).toEqual(['Olá', '!']);
    expect(res.usage).toMatchObject({ inputTokens: 9, outputTokens: 3 });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('executes tool calls and continues', async () => {
    const responses = [
      sseResponse([
        f(
          chunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'list_project_artifacts', arguments: '' },
              },
            ],
          }),
        ),
        f(chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }, 'tool_calls')),
        f(usageChunk(5, 2)),
        f('[DONE]'),
      ]),
      sseResponse([f(chunk({ content: 'ok' }, 'stop')), f(usageChunk(7, 1)), f('[DONE]')]),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const run = vi.fn(async () => 'nenhum');
    const res = await adapterWith(fetchMock).generate({
      ...baseReq,
      tools: [
        {
          name: 'list_project_artifacts',
          description: 'd',
          inputSchema: { type: 'object', properties: {} },
          run,
        },
      ],
    });
    expect(run).toHaveBeenCalledOnce();
    expect(res.text).toBe('ok');
    expect(res.usage.inputTokens).toBe(12);
    const second = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
  });

  it('maps auth and rate limit errors', async () => {
    const auth = await adapterWith(async () =>
      jsonResponse(401, { error: { message: 'bad key', type: 'invalid_request_error' } }),
    )
      .generate(baseReq)
      .catch((e) => e);
    expect(auth.code).toBe('auth');
    const rl = await adapterWith(async () =>
      jsonResponse(429, { error: { message: 'rate', type: 'rate_limit' } }),
    )
      .generate(baseReq)
      .catch((e) => e);
    expect(rl.code).toBe('rate_limit');
    expect(rl.retryable).toBe(true);
  });

  it('aborts in-flight streams', async () => {
    const controller = new AbortController();
    const adapter = adapterWith(
      async (_u, init) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('a'), { name: 'AbortError' })),
          ),
        ),
    );
    const p = adapter.generate({ ...baseReq, signal: controller.signal });
    controller.abort();
    expect((await p.catch((e) => e)).code).toBe('aborted');
  });
});
