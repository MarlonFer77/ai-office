import { describe, expect, it } from 'vitest';
import { ROOM_BLUEPRINTS, type OfficeEvent } from '@ai-office/shared';
import { applyEvent, arcPoint, initialSceneState, tickScene } from './scene-state.js';
import { assignSeats, seatsForRoom } from './layout.js';
import {
  fitCamera,
  pointInPolygon,
  rectPolygon,
  screenToTile,
  tileToScreen,
  worldBounds,
} from './iso.js';

const ev = (p: Partial<OfficeEvent>): OfficeEvent => ({
  id: '1',
  type: 'agent.started',
  projectId: 'p',
  agentId: 'a',
  demo: false,
  summary: '',
  payload: {},
  createdAt: '',
  ...p,
});
const rooms = ROOM_BLUEPRINTS.map((r, i) => ({ ...r, id: `r${i}` }));

describe('iso math', () => {
  it('round-trips tile ↔ screen', () => {
    const s = tileToScreen(5, 3);
    const t = screenToTile(s.x, s.y);
    expect(t.x).toBeCloseTo(5);
    expect(t.y).toBeCloseTo(3);
  });
  it('hit-tests room polygons', () => {
    const poly = rectPolygon(0, 0, 4, 4);
    expect(pointInPolygon(tileToScreen(2, 2), poly)).toBe(true);
    expect(pointInPolygon(tileToScreen(6, 6), poly)).toBe(false);
  });
  it('fits the camera inside the viewport', () => {
    const cam = fitCamera(worldBounds(rooms), 1000, 600);
    expect(cam.scale).toBeGreaterThan(0.3);
    expect(cam.scale).toBeLessThan(1.6);
  });
});

describe('layout', () => {
  it('places every agent inside its room and never in the director room', () => {
    const director = rooms.find((r) => r.kind === 'director')!;
    const strategy = rooms.find((r) => r.kind === 'strategy')!;
    const seats = assignSeats(rooms, [
      { id: 'a', roomId: strategy.id },
      { id: 'b', roomId: strategy.id },
      { id: 'c', roomId: director.id },
    ]);
    expect(seats.get('a')!.roomId).toBe(strategy.id);
    expect(seats.get('c')!.roomId).not.toBe(director.id);
    for (const s of seatsForRoom(strategy, 4)) {
      expect(s.tx).toBeGreaterThan(strategy.gridX);
      expect(s.tx).toBeLessThan(strategy.gridX + strategy.width);
      expect(s.ty).toBeLessThan(strategy.gridY + strategy.depth);
    }
  });
});

describe('scene reducer', () => {
  const base = initialSceneState([
    { id: 'a', status: 'idle', provider: 'anthropic' },
    { id: 'b', status: 'idle', provider: 'anthropic' },
  ]);
  it('reflects real run lifecycle events', () => {
    let s = applyEvent(base, ev({ type: 'agent.started', payload: { kind: 'task' } }), 0);
    expect(s.agents.a!.status).toBe('running');
    s = applyEvent(
      s,
      ev({ id: '2', type: 'agent.tool.started', payload: { tool: 'list_project_artifacts' } }),
      1,
    );
    expect(s.agents.a!.caption).toContain('list_project_artifacts');
    s = applyEvent(s, ev({ id: '3', type: 'approval.requested' }), 2);
    expect(s.agents.a!.status).toBe('awaiting_approval');
    s = applyEvent(s, ev({ id: '4', type: 'agent.error' }), 3);
    expect(s.agents.a!.status).toBe('error');
    expect(s.pulses).toHaveLength(1);
    expect(s.lastEventId).toBe('4');
  });
  it('animates handoffs between known agents only and expires them', () => {
    const s = applyEvent(
      base,
      ev({ id: '9', type: 'handoff.created', payload: { fromAgentId: 'a', toAgentId: 'b' } }),
      1000,
    );
    expect(s.handoffs).toHaveLength(1);
    expect(tickScene(s, 1000 + 5000).handoffs).toHaveLength(0);
    const unknown = applyEvent(
      base,
      ev({ type: 'handoff.created', payload: { fromAgentId: 'a', toAgentId: 'zzz' } }),
      0,
    );
    expect(unknown.handoffs).toHaveLength(0);
  });
  it('ignores events for agents not in the scene and does not move the cursor on deltas', () => {
    const s = applyEvent(
      base,
      ev({ id: 'delta:r:1', type: 'agent.message.delta', agentId: 'ghost' }),
    );
    expect(s.agents).toEqual(base.agents);
    expect(s.lastEventId).toBeNull();
  });
  it('computes arc endpoints', () => {
    expect(arcPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(arcPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toEqual({ x: 10, y: 0 });
  });
});
