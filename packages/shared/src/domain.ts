/**
 * Core domain enums shared across web, api, worker and packages.
 * Keep these in sync with the database enums in @ai-office/database.
 */
export const ROOM_KINDS = [
  'strategy',
  'research',
  'production',
  'creative',
  'review',
  'meeting',
  'director',
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export const AGENT_ROLES = [
  'strategist',
  'researcher',
  'developer',
  'creative',
  'reviewer',
  'coordinator',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Default room for each role. */
export const ROLE_ROOM: Record<AgentRole, RoomKind> = {
  strategist: 'strategy',
  researcher: 'research',
  developer: 'production',
  creative: 'creative',
  reviewer: 'review',
  coordinator: 'meeting',
};

export const PROVIDERS = ['anthropic', 'openai', 'demo'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const AGENT_STATUSES = [
  'idle',
  'queued',
  'running',
  'awaiting_approval',
  'paused',
  'error',
  'disconnected',
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const TASK_STATUSES = [
  'pending',
  'ready',
  'running',
  'waiting_dependency',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export const MISSION_STATUSES = [
  'planning',
  'awaiting_plan_approval',
  'running',
  'awaiting_final_approval',
  'completed',
  'failed',
  'cancelled',
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ARTIFACT_KINDS = [
  'text',
  'markdown',
  'json',
  'code',
  'document',
  'report',
  'external_ref',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const APPROVAL_KINDS = ['mission_plan', 'task_result'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const PROJECT_MODES = ['demo', 'real'] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

/** Permissions an agent can be granted. Sensitive ones default to off. */
export const AGENT_PERMISSIONS = [
  'read_project_artifacts',
  'create_artifacts',
  'handoff',
  'external_network',
  'execute_code',
  'publish_external',
] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

export const DEFAULT_AGENT_PERMISSIONS: AgentPermission[] = [
  'read_project_artifacts',
  'create_artifacts',
  'handoff',
];

/** Hard limits that protect against runaway orchestration. */
export const ORCHESTRATION_LIMITS = {
  maxTasksPerMission: 12,
  maxDelegationDepth: 2,
  maxAttemptsPerTask: 3,
  maxRunDurationMs: 5 * 60_000,
  maxHistoryMessages: 40,
  maxHandoffSummaryChars: 4000,
  maxOutputTokens: 8000,
} as const;
