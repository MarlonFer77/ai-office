import type { AgentStatus, OfficeEvent } from '@ai-office/shared';

export interface AgentVisual {
  id: string;
  status: AgentStatus;
  /** Short verifiable caption shown above the avatar (e.g. tool name). */
  caption: string | null;
  /** Timestamp of last real activity. */
  lastActivityAt: number;
  demo: boolean;
}

export interface HandoffAnimation {
  key: string;
  fromAgentId: string;
  toAgentId: string;
  startedAt: number;
  durationMs: number;
  label: string;
}

export interface SceneState {
  agents: Record<string, AgentVisual>;
  handoffs: HandoffAnimation[];
  /** Highlight pulses on rooms/agents after completions. */
  pulses: { key: string; agentId: string; kind: 'success' | 'error'; startedAt: number }[];
  lastEventId: string | null;
}

export function initialSceneState(
  agents: { id: string; status: AgentStatus; provider: string }[],
): SceneState {
  const map: Record<string, AgentVisual> = {};
  for (const a of agents) {
    map[a.id] = {
      id: a.id,
      status: a.status,
      caption: null,
      lastActivityAt: 0,
      demo: a.provider === 'demo',
    };
  }
  return { agents: map, handoffs: [], pulses: [], lastEventId: null };
}

export const HANDOFF_DURATION_MS = 1800;
const PULSE_MS = 1400;

/**
 * Pure reducer: real backend events → visual state. Visual activity is only
 * ever driven by events that the backend actually emitted.
 */
export function applyEvent(state: SceneState, e: OfficeEvent, now = Date.now()): SceneState {
  const agentId = e.agentId ?? null;
  const patchAgent = (id: string | null, patch: Partial<AgentVisual>): SceneState['agents'] => {
    if (!id || !state.agents[id]) return state.agents;
    return {
      ...state.agents,
      [id]: { ...state.agents[id]!, ...patch, lastActivityAt: now, demo: e.demo },
    };
  };
  const next: SceneState = { ...state, lastEventId: /^\d+$/.test(e.id) ? e.id : state.lastEventId };
  switch (e.type) {
    case 'agent.started':
      return {
        ...next,
        agents: patchAgent(agentId, {
          status: 'running',
          caption:
            e.payload.kind === 'plan'
              ? 'planejando'
              : e.payload.kind === 'chat'
                ? 'respondendo'
                : 'trabalhando',
        }),
      };
    case 'agent.message.delta':
      return state.agents[agentId ?? '']?.status === 'running'
        ? state
        : { ...next, agents: patchAgent(agentId, { status: 'running', caption: 'respondendo' }) };
    case 'agent.tool.started':
      return {
        ...next,
        agents: patchAgent(agentId, { caption: `ferramenta: ${String(e.payload.tool ?? '')}` }),
      };
    case 'agent.tool.completed':
      return { ...next, agents: patchAgent(agentId, { caption: 'trabalhando' }) };
    case 'agent.idle':
    case 'agent.message':
      return e.type === 'agent.message' && e.payload.kind !== 'chat'
        ? next
        : { ...next, agents: patchAgent(agentId, { status: 'idle', caption: null }) };
    case 'agent.error':
      return {
        ...next,
        agents: patchAgent(agentId, { status: 'error', caption: 'erro' }),
        pulses: agentId
          ? [...prune(state.pulses, now), { key: e.id, agentId, kind: 'error', startedAt: now }]
          : state.pulses,
      };
    case 'agent.paused':
      return { ...next, agents: patchAgent(agentId, { status: 'paused', caption: 'pausado' }) };
    case 'agent.updated': {
      const status = e.payload.status as AgentStatus | undefined;
      return status
        ? {
            ...next,
            agents: patchAgent(agentId, {
              status,
              caption: status === 'paused' ? 'pausado' : null,
            }),
          }
        : next;
    }
    case 'approval.requested':
      return {
        ...next,
        agents: patchAgent(agentId, {
          status: 'awaiting_approval',
          caption: 'aguardando aprovação',
        }),
      };
    case 'task.completed':
      return {
        ...next,
        agents: patchAgent(agentId, { status: 'idle', caption: null }),
        pulses: agentId
          ? [...prune(state.pulses, now), { key: e.id, agentId, kind: 'success', startedAt: now }]
          : state.pulses,
      };
    case 'task.failed':
      return {
        ...next,
        agents: patchAgent(agentId, { status: 'error', caption: 'tarefa falhou' }),
        pulses: agentId
          ? [...prune(state.pulses, now), { key: e.id, agentId, kind: 'error', startedAt: now }]
          : state.pulses,
      };
    case 'handoff.created': {
      const from = (e.payload.fromAgentId as string | null) ?? null;
      const to = (e.payload.toAgentId as string | null) ?? null;
      if (!from || !to || !state.agents[from] || !state.agents[to]) return next;
      return {
        ...next,
        handoffs: [
          ...pruneHandoffs(state.handoffs, now),
          {
            key: e.id,
            fromAgentId: from,
            toAgentId: to,
            startedAt: now,
            durationMs: HANDOFF_DURATION_MS,
            label: e.summary,
          },
        ],
      };
    }
    case 'agent.created':
      if (!agentId || state.agents[agentId]) return next;
      return {
        ...next,
        agents: {
          ...state.agents,
          [agentId]: {
            id: agentId,
            status: 'idle',
            caption: null,
            lastActivityAt: now,
            demo: e.demo,
          },
        },
      };
    default:
      return next;
  }
}

const prune = (p: SceneState['pulses'], now: number) =>
  p.filter((x) => now - x.startedAt < PULSE_MS);
const pruneHandoffs = (h: HandoffAnimation[], now: number) =>
  h.filter((x) => now - x.startedAt < x.durationMs);

/** Drops finished animations; returns the same object when nothing changed. */
export function tickScene(state: SceneState, now = Date.now()): SceneState {
  const handoffs = pruneHandoffs(state.handoffs, now);
  const pulses = prune(state.pulses, now);
  if (handoffs.length === state.handoffs.length && pulses.length === state.pulses.length)
    return state;
  return { ...state, handoffs, pulses };
}

/** Quadratic arc position for a handoff packet, t in [0,1]. */
export function arcPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
  lift = 90,
) {
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) - lift;
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * my + t * t * b.y,
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
