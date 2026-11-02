'use client';
import { useEffect, useState } from 'react';
import { useEventHistory, useOffice } from '@/lib/queries';
import { useProjectStream } from '@/lib/sse';
import { useLive } from '@/lib/store';
import { useCurrentProject } from '@/lib/use-project';

/**
 * App-wide real-time connection for the current project: seeds the live store
 * from the persisted history, then streams new events over SSE on every page.
 */
export function LiveConnector() {
  const { project } = useCurrentProject();
  const pid = project?.id ?? null;
  const office = useOffice(pid);
  const history = useEventHistory(pid);
  const reset = useLive((s) => s.reset);
  const syncAgents = useLive((s) => s.syncAgents);
  const liveProject = useLive((s) => s.projectId);
  const [startAfter, setStartAfter] = useState<string | null>(null);

  useEffect(() => setStartAfter(null), [pid]);
  useEffect(() => {
    if (!pid || !office.data || !history.data || office.data.project.id !== pid) return;
    if (liveProject !== pid) {
      reset(pid, office.data.agents, history.data);
      setStartAfter(history.data[0]?.id ?? '0');
    } else if (startAfter === null) {
      setStartAfter(useLive.getState().scene.lastEventId ?? history.data[0]?.id ?? '0');
    }
  }, [pid, office.data, history.data, liveProject, reset, startAfter]);
  useEffect(() => {
    if (office.data && liveProject === office.data.project.id) syncAgents(office.data.agents);
  }, [office.data, liveProject, syncAgents]);

  useProjectStream(liveProject === pid ? pid : null, startAfter);
  return null;
}
