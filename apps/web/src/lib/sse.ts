'use client';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from './queries';
import { useLive } from './store';
import type { OfficeEvent } from './types';

/**
 * Subscribes to the project's SSE stream. Native EventSource resends
 * Last-Event-ID on automatic reconnects; on hard failures we reconnect with
 * exponential backoff using ?since=<last id>. Duplicates are dropped in the
 * live store; query caches are invalidated (debounced) by event type.
 */
export function useProjectStream(projectId: string | null, startAfter: string | null) {
  const qc = useQueryClient();
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId || startAfter === null) return;
    let es: EventSource | null = null;
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const live = useLive.getState();

    const flush = () => {
      timer.current = null;
      for (const k of pending.current) void qc.invalidateQueries({ queryKey: JSON.parse(k) });
      pending.current.clear();
    };
    const invalidate = (...keys: readonly unknown[][]) => {
      for (const k of keys) pending.current.add(JSON.stringify(k));
      if (!timer.current) timer.current = setTimeout(flush, 250);
    };

    const onEvent = (e: OfficeEvent) => {
      if (!useLive.getState().ingest(e)) return;
      if (e.type === 'agent.message.delta') return;
      const pid = e.projectId;
      invalidate([...qk.office(pid)]);
      if (e.agentId) invalidate([...qk.agent(e.agentId)], [...qk.runs(e.agentId)]);
      if (e.type === 'agent.message' || e.type === 'agent.started' || e.type === 'agent.idle' || e.type === 'agent.error') {
        if (e.agentId) invalidate([...qk.messages(e.agentId)]);
        if (e.type === 'agent.message' && e.payload.runId) setTimeout(() => useLive.getState().clearStream(String(e.payload.runId)), 400);
      }
      if (e.type.startsWith('task.') || e.type.startsWith('mission.') || e.type.startsWith('approval.') || e.type.startsWith('handoff.')) {
        invalidate(['missions', pid], ['mission'], ['tasks', pid], ['approvals', pid], ['handoffs', pid]);
      }
      if (e.type === 'artifact.created') invalidate(['artifacts', pid], ['artifact']);
      if (e.type === 'agent.message') invalidate(['usage', pid]);
      if (e.type === 'agent.created' || e.type === 'agent.updated') invalidate(['agents', pid]);
    };

    const connect = (since: string) => {
      live.setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      es = new EventSource(`/api/projects/${projectId}/events/stream?since=${encodeURIComponent(since)}`, { withCredentials: true });
      es.addEventListener('ready', () => {
        attempt = 0;
        useLive.getState().setStatus('open');
      });
      es.addEventListener('office', (msg) => {
        try {
          onEvent(JSON.parse((msg as MessageEvent<string>).data) as OfficeEvent);
        } catch {
          /* ignore malformed frame */
        }
      });
      es.onerror = () => {
        if (closed) return;
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          attempt++;
          useLive.getState().setStatus(attempt > 5 ? 'error' : 'reconnecting');
          const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
          retryTimer = setTimeout(() => connect(useLive.getState().scene.lastEventId ?? since), delay);
        } else {
          useLive.getState().setStatus('reconnecting');
        }
      };
    };
    connect(startAfter);

    const ticker = setInterval(() => useLive.getState().tick(), 500);
    return () => {
      closed = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(ticker);
      if (timer.current) clearTimeout(timer.current);
      useLive.getState().setStatus('idle');
    };
  }, [projectId, startAfter, qc]);
}
