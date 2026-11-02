'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyEvent, initialSceneState, tickScene, type SceneState } from '@ai-office/office-engine';
import type { Agent, OfficeEvent } from './types';

type ViewMode = 'office' | 'list';

interface UiState {
  projectId: string | null;
  viewMode: ViewMode;
  selectedAgentId: string | null;
  selectedRoomId: string | null;
  missionDialogOpen: boolean;
  setProjectId: (id: string | null) => void;
  setViewMode: (m: ViewMode) => void;
  selectAgent: (id: string | null) => void;
  selectRoom: (id: string | null) => void;
  setMissionDialogOpen: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      projectId: null,
      viewMode: 'office',
      selectedAgentId: null,
      selectedRoomId: null,
      missionDialogOpen: false,
      setProjectId: (projectId) => set({ projectId, selectedAgentId: null, selectedRoomId: null }),
      setViewMode: (viewMode) => set({ viewMode }),
      selectAgent: (selectedAgentId) => set({ selectedAgentId, ...(selectedAgentId ? { selectedRoomId: null } : {}) }),
      selectRoom: (selectedRoomId) => set({ selectedRoomId, ...(selectedRoomId ? { selectedAgentId: null } : {}) }),
      setMissionDialogOpen: (missionDialogOpen) => set({ missionDialogOpen }),
    }),
    { name: 'ai-office-ui', partialize: (s) => ({ projectId: s.projectId, viewMode: s.viewMode }) },
  ),
);

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

interface LiveState {
  projectId: string | null;
  scene: SceneState;
  feed: OfficeEvent[];
  seen: Set<string>;
  status: StreamStatus;
  /** Live streamed text per run (deltas), cleared when the final message lands. */
  streaming: Record<string, { agentId: string; text: string; demo: boolean }>;
  reset: (projectId: string, agents: Agent[], history: OfficeEvent[]) => void;
  syncAgents: (agents: Agent[]) => void;
  ingest: (e: OfficeEvent) => boolean;
  tick: () => void;
  setStatus: (s: StreamStatus) => void;
  clearStream: (runId: string) => void;
}

const FEED_LIMIT = 200;

export const useLive = create<LiveState>()((set, get) => ({
  projectId: null,
  scene: initialSceneState([]),
  feed: [],
  seen: new Set(),
  status: 'idle',
  streaming: {},
  reset: (projectId, agents, history) =>
    set({
      projectId,
      scene: { ...initialSceneState(agents), lastEventId: history[0]?.id ?? null },
      feed: history.slice(0, FEED_LIMIT),
      seen: new Set(history.map((e) => e.id)),
      streaming: {},
    }),
  syncAgents: (agents) =>
    set((s) => {
      const next = { ...s.scene.agents };
      for (const a of agents) {
        const cur = next[a.id];
        next[a.id] = cur ? { ...cur, status: a.status, demo: a.provider === 'demo' } : { id: a.id, status: a.status, caption: null, lastActivityAt: 0, demo: a.provider === 'demo' };
      }
      return { scene: { ...s.scene, agents: next } };
    }),
  /** Returns false for duplicates (already-seen persisted ids). */
  ingest: (e) => {
    const s = get();
    if (e.projectId !== s.projectId) return false;
    if (e.type === 'agent.message.delta') {
      const runId = String(e.payload.runId);
      const cur = s.streaming[runId];
      set({
        streaming: { ...s.streaming, [runId]: { agentId: e.agentId ?? '', text: (cur?.text ?? '') + String(e.payload.text ?? ''), demo: e.demo } },
        scene: applyEvent(s.scene, e),
      });
      return true;
    }
    if (s.seen.has(e.id)) return false;
    const seen = new Set(s.seen);
    seen.add(e.id);
    set({ seen, scene: applyEvent(s.scene, e), feed: [e, ...s.feed].slice(0, FEED_LIMIT) });
    return true;
  },
  tick: () => set((s) => {
    const scene = tickScene(s.scene);
    return scene === s.scene ? s : { scene };
  }),
  setStatus: (status) => set({ status }),
  clearStream: (runId) => set((s) => {
    if (!s.streaming[runId]) return s;
    const { [runId]: _, ...rest } = s.streaming;
    return { streaming: rest };
  }),
}));
