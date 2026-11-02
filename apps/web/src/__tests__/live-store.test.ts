import { beforeEach, describe, expect, it } from 'vitest';
import { useLive } from '@/lib/store';
import type { Agent, OfficeEvent } from '@/lib/types';

const agent = { id: 'a1', status: 'idle', provider: 'demo' } as Agent;
const ev = (p: Partial<OfficeEvent>): OfficeEvent => ({
  id: '10',
  type: 'agent.started',
  projectId: 'p1',
  agentId: 'a1',
  demo: true,
  summary: 's',
  payload: {},
  createdAt: new Date().toISOString(),
  ...p,
});

describe('live store', () => {
  beforeEach(() => useLive.getState().reset('p1', [agent], []));

  it('ignores duplicate persisted events (reconnect replays)', () => {
    expect(useLive.getState().ingest(ev({ id: '11' }))).toBe(true);
    expect(useLive.getState().ingest(ev({ id: '11' }))).toBe(false);
    expect(useLive.getState().feed).toHaveLength(1);
    expect(useLive.getState().scene.agents.a1!.status).toBe('running');
  });

  it('ignores events from other projects', () => {
    expect(useLive.getState().ingest(ev({ id: '12', projectId: 'other' }))).toBe(false);
  });

  it('accumulates streamed deltas per run without touching the feed', () => {
    const d = (seq: number, text: string) =>
      ev({
        id: `delta:r1:${seq}`,
        type: 'agent.message.delta',
        payload: { runId: 'r1', text, seq },
      });
    useLive.getState().ingest(d(0, 'Olá'));
    useLive.getState().ingest(d(1, ', mundo'));
    expect(useLive.getState().streaming.r1!.text).toBe('Olá, mundo');
    expect(useLive.getState().feed).toHaveLength(0);
    useLive.getState().clearStream('r1');
    expect(useLive.getState().streaming.r1).toBeUndefined();
  });

  it('tracks handoff animations only from real events', () => {
    useLive.getState().reset('p1', [agent, { ...agent, id: 'a2' }], []);
    useLive
      .getState()
      .ingest(
        ev({ id: '20', type: 'handoff.created', payload: { fromAgentId: 'a1', toAgentId: 'a2' } }),
      );
    expect(useLive.getState().scene.handoffs).toHaveLength(1);
  });
});
