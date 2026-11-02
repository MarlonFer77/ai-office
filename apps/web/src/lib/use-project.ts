'use client';
import { useEffect } from 'react';
import { useProjects } from './queries';
import { useUi } from './store';

/** Current project id: persisted selection if still valid, else the most recent project. */
export function useCurrentProject() {
  const projects = useProjects();
  const { projectId, setProjectId } = useUi();
  const list = projects.data ?? [];
  const valid = list.find((p) => p.id === projectId);
  const current = valid ?? list[0] ?? null;
  useEffect(() => {
    if (projects.isSuccess && current && current.id !== projectId) setProjectId(current.id);
  }, [projects.isSuccess, current, projectId, setProjectId]);
  return { project: current, projects: list, isLoading: projects.isLoading, isEmpty: projects.isSuccess && list.length === 0 };
}
