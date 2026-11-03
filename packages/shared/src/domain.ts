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

export const PROVIDERS = ['anthropic', 'openai', 'groq', 'openrouter', 'ollama', 'demo'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Providers that can be configured with credentials (everything except the demo simulator). */
export const CONFIGURABLE_PROVIDERS = [
  'anthropic',
  'openai',
  'groq',
  'openrouter',
  'ollama',
] as const;
export type ConfigurableProviderId = (typeof CONFIGURABLE_PROVIDERS)[number];

/** Providers reached through the OpenAI-compatible Chat Completions API. */
export const OPENAI_COMPATIBLE_PROVIDERS = ['groq', 'openrouter', 'ollama'] as const;
export type OpenAICompatibleProviderId = (typeof OPENAI_COMPATIBLE_PROVIDERS)[number];

export interface ProviderPreset {
  label: string;
  /** Default API base URL (OpenAI-compatible providers only). */
  baseUrl: string | null;
  /** Whether the base URL may be changed by the user (only local servers). */
  baseUrlEditable: boolean;
  requiresApiKey: boolean;
  keyUrl: string | null;
  /** Default number of simultaneous runs against this provider (per worker). */
  defaultConcurrency: number;
  /** Cap on output tokens per call (protects small free-tier token-per-minute quotas). */
  maxOutputTokens: number | null;
  /** Approximate token budget for the history sent per call. */
  contextBudgetTokens: number | null;
  /** Default "free tier / no cost" flag. */
  defaultFree: boolean;
  description: string;
}

export const PROVIDER_PRESETS: Record<ConfigurableProviderId, ProviderPreset> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: null,
    baseUrlEditable: false,
    requiresApiKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultConcurrency: 4,
    maxOutputTokens: null,
    contextBudgetTokens: null,
    defaultFree: false,
    description: 'Modelos Claude via SDK oficial da Anthropic. Cobrança por token.',
  },
  openai: {
    label: 'OpenAI (GPT)',
    baseUrl: null,
    baseUrlEditable: false,
    requiresApiKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultConcurrency: 4,
    maxOutputTokens: null,
    contextBudgetTokens: null,
    defaultFree: false,
    description: 'Modelos GPT via SDK oficial da OpenAI. Cobrança por token.',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    baseUrlEditable: false,
    requiresApiKey: true,
    keyUrl: 'https://console.groq.com/keys',
    defaultConcurrency: 1,
    maxOutputTokens: 1500,
    contextBudgetTokens: 3500,
    defaultFree: true,
    description:
      'Modelos abertos muito rápidos. Plano gratuito com limites por minuto/dia (ex.: ~30 req/min e alguns milhares de tokens/min). Erros 429 são re-tentados automaticamente.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    baseUrlEditable: false,
    requiresApiKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    defaultConcurrency: 1,
    maxOutputTokens: 2000,
    contextBudgetTokens: 6000,
    defaultFree: false,
    description: 'Agregador de modelos. Modelos com sufixo ":free" não têm custo (com limites).',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    baseUrlEditable: true,
    requiresApiKey: false,
    keyUrl: null,
    defaultConcurrency: 1,
    maxOutputTokens: 1500,
    contextBudgetTokens: 3000,
    defaultFree: true,
    description: 'Modelos rodando na sua máquina. Sem custo; velocidade depende do hardware.',
  },
};

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

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
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
