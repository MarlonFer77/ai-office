'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Agent, Approval, Artifact, ArtifactVersion, Handoff, Message, Mission, ModelPrice, OfficeEvent, OfficeSnapshot, Project, ProviderConfig, Run, Task } from './types';

export const qk = {
  me: ['me'] as const,
  config: ['config'] as const,
  projects: (archived = false) => ['projects', archived] as const,
  office: (pid: string) => ['office', pid] as const,
  agents: (pid: string) => ['agents', pid] as const,
  agent: (id: string) => ['agent', id] as const,
  messages: (id: string) => ['messages', id] as const,
  runs: (id: string) => ['runs', id] as const,
  missions: (pid: string) => ['missions', pid] as const,
  mission: (id: string) => ['mission', id] as const,
  tasks: (pid: string) => ['tasks', pid] as const,
  approvals: (pid: string, status?: string) => ['approvals', pid, status ?? 'all'] as const,
  artifacts: (pid: string, q: string, kind: string) => ['artifacts', pid, q, kind] as const,
  artifact: (id: string) => ['artifact', id] as const,
  events: (pid: string) => ['events', pid] as const,
  usage: (pid: string) => ['usage', pid] as const,
  providers: ['providers'] as const,
  prices: ['prices'] as const,
  audit: ['audit'] as const,
  handoffs: (pid: string) => ['handoffs', pid] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api<{ user: { id: string; name: string; email: string }; workspaceId: string }>('/me'), retry: false });
export const useAppConfig = () => useQuery({ queryKey: qk.config, queryFn: () => api<{ demoLoginEnabled: boolean; storageEnabled: boolean }>('/config'), staleTime: Infinity });
export const useProjects = (archived = false) => useQuery({ queryKey: qk.projects(archived), queryFn: () => api<Project[]>(`/projects?archived=${archived}`) });
export const useOffice = (pid: string | null) => useQuery({ queryKey: qk.office(pid ?? ''), queryFn: () => api<OfficeSnapshot>(`/projects/${pid}/office`), enabled: !!pid });
export const useAgentDetail = (id: string | null) =>
  useQuery({ queryKey: qk.agent(id ?? ''), queryFn: () => api<{ agent: Agent; session: { id: string; busy: boolean; activeRunId: string | null } | null; usage: { costUsd: number; inputTokens: number; outputTokens: number; runs: number }; tasks: Task[] }>(`/agents/${id}`), enabled: !!id });
export const useMessages = (id: string | null) =>
  useQuery({ queryKey: qk.messages(id ?? ''), queryFn: () => api<{ messages: Message[]; pending: { runId: string; content: string; createdAt: string }[]; hasMore: boolean }>(`/agents/${id}/messages`), enabled: !!id });
export const useRuns = (id: string | null) => useQuery({ queryKey: qk.runs(id ?? ''), queryFn: () => api<Run[]>(`/agents/${id}/runs`), enabled: !!id });
export const useMissions = (pid: string | null) => useQuery({ queryKey: qk.missions(pid ?? ''), queryFn: () => api<Mission[]>(`/projects/${pid}/missions`), enabled: !!pid });
export const useMission = (id: string | null) =>
  useQuery({ queryKey: qk.mission(id ?? ''), queryFn: () => api<{ mission: Mission; tasks: Task[]; handoffs: Handoff[]; approvals: Approval[]; progress: { percent: number; total: number; completed: number; failed: number } }>(`/missions/${id}`), enabled: !!id });
export const useTasks = (pid: string | null) => useQuery({ queryKey: qk.tasks(pid ?? ''), queryFn: () => api<Task[]>(`/projects/${pid}/tasks`), enabled: !!pid });
export const useApprovals = (pid: string | null, status?: string) =>
  useQuery({ queryKey: qk.approvals(pid ?? '', status), queryFn: () => api<Approval[]>(`/projects/${pid}/approvals${status ? `?status=${status}` : ''}`), enabled: !!pid });
export const useArtifacts = (pid: string | null, q = '', kind = '') =>
  useQuery({ queryKey: qk.artifacts(pid ?? '', q, kind), queryFn: () => api<Artifact[]>(`/projects/${pid}/artifacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}) })}`), enabled: !!pid });
export const useArtifact = (id: string | null) => useQuery({ queryKey: qk.artifact(id ?? ''), queryFn: () => api<{ artifact: Artifact; versions: ArtifactVersion[] }>(`/artifacts/${id}`), enabled: !!id });
export const useEventHistory = (pid: string | null) => useQuery({ queryKey: qk.events(pid ?? ''), queryFn: () => api<OfficeEvent[]>(`/projects/${pid}/events?limit=60`), enabled: !!pid, staleTime: Infinity });
export const useUsage = (pid: string | null) =>
  useQuery({ queryKey: qk.usage(pid ?? ''), queryFn: () => api<{ budgetLimitUsd: number | null; totalCostUsd: number; rows: { agentId: string | null; provider: string; model: string; runs: number; inputTokens: number; outputTokens: number; costUsd: number | null; unknownCostRuns: number; demoRuns: number }[] }>(`/projects/${pid}/usage`), enabled: !!pid });
export const useProviders = () => useQuery({ queryKey: qk.providers, queryFn: () => api<ProviderConfig[]>('/providers') });
export const usePrices = () => useQuery({ queryKey: qk.prices, queryFn: () => api<{ defaults: ModelPrice[]; overrides: ModelPrice[] }>('/prices') });
export const useAudit = () => useQuery({ queryKey: qk.audit, queryFn: () => api<{ id: string; action: string; resourceType: string; resourceId: string | null; createdAt: string; metadata: Record<string, unknown> }[]>('/audit-logs') });
export const useHandoffs = (pid: string | null) => useQuery({ queryKey: qk.handoffs(pid ?? ''), queryFn: () => api<Handoff[]>(`/projects/${pid}/handoffs`), enabled: !!pid });

/** Generic mutation that invalidates a set of keys on success. */
export function useApiMutation<TVars, TResult = unknown>(fn: (v: TVars) => Promise<TResult>, invalidate: (v: TVars, r: TResult) => readonly (readonly unknown[])[] = () => []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const key of invalidate(v, r)) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
