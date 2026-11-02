import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitEvent } from '@ai-office/orchestrator';
import { createTestApp, resetDb, signUp, type TestApp } from './test/helpers.js';

let t: TestApp;
let base: string;
beforeAll(async () => {
  t = await createTestApp();
  await resetDb(t.h);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = t.app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await t.app.close();
  await t.h.close();
});

async function readEvents(url: string, cookie: string, headers: Record<string, string>, until: (ids: string[]) => boolean) {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { cookie, ...headers }, signal: controller.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const ids: string[] = [];
  const types: string[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !until(ids)) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = frame.split('\n').find((l) => l.startsWith('data: '));
      if (data && frame.includes('event: office')) {
        const e = JSON.parse(data.slice(6));
        ids.push(e.id);
        types.push(e.type);
      }
    }
  }
  controller.abort();
  return { ids, types };
}

describe('SSE stream', () => {
  it('replays from Last-Event-ID, streams live events and never duplicates', async () => {
    const cookie = await signUp(t.app, 'sse@test.dev');
    const create = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'S', mode: 'demo' }) });
    const p = await create.json();
    // 5 agent.created events exist already (ids 1..5 in this fresh DB, project-scoped).
    const first = await readEvents(`${base}/api/projects/${p.id}/events/stream`, cookie, {}, (ids) => ids.length >= 5);
    expect(first.types.every((x) => x === 'agent.created')).toBe(true);
    const lastSeen = first.ids[2]!;

    // Reconnect with Last-Event-ID: only newer events, then a live one.
    setTimeout(() => {
      void emitEvent(t.orch, { type: 'task.started', projectId: p.id, demo: true, summary: 'live', payload: {} });
    }, 300);
    const second = await readEvents(`${base}/api/projects/${p.id}/events/stream`, cookie, { 'last-event-id': lastSeen }, (ids) => ids.length >= 3);
    expect(second.ids).toEqual([first.ids[3], first.ids[4], expect.any(String)]);
    expect(second.types.at(-1)).toBe('task.started');
    expect(new Set(second.ids).size).toBe(second.ids.length);
  });

  it('requires authentication', async () => {
    const res = await fetch(`${base}/api/projects/x/events/stream`);
    expect(res.status).toBe(401);
  });
});
