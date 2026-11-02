import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic.js';
import { ProviderError } from '../errors.js';
import { anthropicFrame as f, jsonResponse, sseResponse } from '../test-utils.js';

const textStream = (text: string[], usage = { input_tokens: 12, output_tokens: 7 }) =>
  sseResponse([
    f('message_start', {
      type: 'message_start',
      message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1 } },
    }),
    f('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ...text.map((t) => f('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    f('content_block_stop', { type: 'content_block_stop', index: 0 }),
    f('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }),
    f('message_stop', { type: 'message_stop' }),
  ]);

const toolStream = () =>
  sseResponse([
    f('message_start', {
      type: 'message_start',
      message: { id: 'msg_0', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 1 } },
    }),
    f('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'list_project_artifacts', input: {} } }),
    f('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } }),
    f('content_block_stop', { type: 'content_block_stop', index: 0 }),
    f('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 9 } }),
    f('message_stop', { type: 'message_stop' }),
  ]);

function adapterWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const client = new Anthropic({ apiKey: 'sk-ant-test', maxRetries: 0, fetch: fetchImpl as unknown as typeof fetch });
  return new AnthropicAdapter({ apiKey: 'unused', client });
}

const baseReq = { model: 'claude-opus-5-5', system: 'sys', messages: [{ role: 'user' as const, content: 'oi' }], maxOutputTokens: 100 };

describe('AnthropicAdapter', () => {
  it('streams text deltas and reports usage', async () => {
    const deltas: string[] = [];
    const fetchMock = vi.fn(async () => textStream(['Olá', ', mundo']));
    const res = await adapterWith(fetchMock).generate({ ...baseReq, onDelta: (d) => deltas.push(d) });
    expect(deltas).toEqual(['Olá', ', mundo']);
    expect(res.text).toBe('Olá, mundo');
    expect(res.usage.inputTokens).toBe(12);
    expect(res.usage.outputTokens).toBe(7);
    expect(res.demo).toBe(false);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.system).toBe('sys');
    expect(body.stream).toBe(true);
  });

  it('runs authorised tools and loops back with tool results', async () => {
    const responses = [toolStream(), textStream(['Feito'])];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const run = vi.fn(async () => '- relatorio.md');
    const toolEvents: string[] = [];
    const res = await adapterWith(fetchMock).generate({
      ...baseReq,
      tools: [{ name: 'list_project_artifacts', description: 'd', inputSchema: { type: 'object', properties: {} }, run }],
      onToolEvent: (e) => toolEvents.push(e.phase),
    });
    expect(run).toHaveBeenCalledOnce();
    expect(toolEvents).toEqual(['started', 'completed']);
    expect(res.text).toBe('Feito');
    expect(res.usage.inputTokens).toBe(32);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).content[0].type).toBe('tool_result');
  });

  it('maps 401 to a non-retryable auth error', async () => {
    const adapter = adapterWith(async () => jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    const err = await adapter.generate(baseReq).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('auth');
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain('sk-ant');
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    const adapter = adapterWith(async () => jsonResponse(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
    const err = await adapter.generate(baseReq).catch((e) => e);
    expect(err.code).toBe('rate_limit');
    expect(err.retryable).toBe(true);
  });

  it('supports interruption via AbortSignal', async () => {
    const controller = new AbortController();
    const adapter = adapterWith(async (_url, init) => {
      if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    });
    const p = adapter.generate({ ...baseReq, signal: controller.signal });
    controller.abort();
    const err = await p.catch((e) => e);
    expect(err.code).toBe('aborted');
  });

  it('lists models through the Models API', async () => {
    const adapter = adapterWith(async () =>
      jsonResponse(200, { data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' }),
    );
    const v = await adapter.verify();
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.models[0]?.id).toBe('claude-opus-5-5');
  });
});
