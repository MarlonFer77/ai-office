import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  AGENT_ROLES,
  AGENT_STATUSES,
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  ARTIFACT_KINDS,
  MISSION_STATUSES,
  PROJECT_MODES,
  PROVIDERS,
  ROOM_KINDS,
  RUN_STATUSES,
  TASK_STATUSES,
} from '@ai-office/shared';

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => numeric(name, { precision: 14, scale: 6, mode: 'number' });

export const roomKind = pgEnum('room_kind', ROOM_KINDS);
export const agentRole = pgEnum('agent_role', AGENT_ROLES);
export const providerId = pgEnum('provider_id', PROVIDERS);
export const agentStatus = pgEnum('agent_status', AGENT_STATUSES);
export const taskStatus = pgEnum('task_status', TASK_STATUSES);
export const missionStatus = pgEnum('mission_status', MISSION_STATUSES);
export const runStatus = pgEnum('run_status', RUN_STATUSES);
export const artifactKind = pgEnum('artifact_kind', ARTIFACT_KINDS);
export const approvalKind = pgEnum('approval_kind', APPROVAL_KINDS);
export const approvalStatus = pgEnum('approval_status', APPROVAL_STATUSES);
export const projectMode = pgEnum('project_mode', PROJECT_MODES);
export const runKind = pgEnum('run_kind', ['chat', 'task', 'plan']);
export const messageRole = pgEnum('message_role', ['user', 'assistant']);
export const messageSource = pgEnum('message_source', ['user', 'agent', 'orchestrator', 'handoff']);
export const handoffStatus = pgEnum('handoff_status', ['pending', 'delivered', 'consumed']);
export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member']);

/* ------------------------------------------------------------------ */
/* Better Auth tables (plural names, usePlural: true)                  */
/* ------------------------------------------------------------------ */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */
export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index('wm_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Projects, rooms, agents                                             */
/* ------------------------------------------------------------------ */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    objective: text('objective').notNull().default(''),
    description: text('description').notNull().default(''),
    mode: projectMode('mode').notNull().default('demo'),
    budgetLimitUsd: money('budget_limit_usd'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_ws_idx').on(t.workspaceId)],
);

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: roomKind('kind').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    gridX: integer('grid_x').notNull(),
    gridY: integer('grid_y').notNull(),
    width: integer('width').notNull(),
    depth: integer('depth').notNull(),
    theme: jsonb('theme').$type<{ accent: string; floor: string }>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('rooms_project_kind_uq').on(t.projectId, t.kind)],
);

export const agents = pgTable(
  'agents',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    role: agentRole('role').notNull(),
    provider: providerId('provider').notNull(),
    model: text('model').notNull(),
    systemPrompt: text('system_prompt').notNull().default(''),
    avatarSeed: integer('avatar_seed').notNull().default(0),
    status: agentStatus('status').notNull().default('idle'),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    budgetLimitUsd: money('budget_limit_usd'),
    maxOutputTokens: integer('max_output_tokens').notNull().default(4000),
    paused: boolean('paused').notNull().default(false),
    lastError: text('last_error'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('agents_project_idx').on(t.projectId)],
);

/** One independent conversation per agent. `activeRunId` is the concurrency lock. */
export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: id(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    activeRunId: text('active_run_id'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    /** Provider continuity state (e.g. summaries); never contains secrets. */
    providerState: jsonb('provider_state').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('agent_sessions_agent_uq').on(t.agentId)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    source: messageSource('source').notNull(),
    content: text('content').notNull(),
    taskId: text('task_id'),
    runId: text('run_id'),
    demo: boolean('demo').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('messages_session_seq_idx').on(t.sessionId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Missions, tasks, runs, handoffs                                     */
/* ------------------------------------------------------------------ */
export const missions = pgTable(
  'missions',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    status: missionStatus('status').notNull().default('planning'),
    plannerAgentId: text('planner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    planSummary: text('plan_summary'),
    error: text('error'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('missions_project_idx').on(t.projectId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').references(() => missions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    title: text('title').notNull(),
    instruction: text('instruction').notNull(),
    role: agentRole('role').notNull(),
    assignedAgentId: text('assigned_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    status: taskStatus('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(5),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    depth: integer('depth').notNull().default(1),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    resultArtifactId: text('result_artifact_id'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tasks_project_idx').on(t.projectId),
    index('tasks_mission_idx').on(t.missionId),
    uniqueIndex('tasks_mission_key_uq').on(t.missionId, t.key),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: text('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }), index('td_dep_idx').on(t.dependsOnTaskId)],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    missionId: text('mission_id').references(() => missions.id, { onDelete: 'set null' }),
    kind: runKind('kind').notNull(),
    status: runStatus('status').notNull().default('queued'),
    provider: providerId('provider').notNull(),
    model: text('model').notNull(),
    demo: boolean('demo').notNull().default(false),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('runs_agent_idx').on(t.agentId), index('runs_project_idx').on(t.projectId)],
);

export const handoffs = pgTable(
  'handoffs',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').references(() => missions.id, { onDelete: 'cascade' }),
    sourceTaskId: text('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    targetTaskId: text('target_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    fromAgentId: text('from_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    toAgentId: text('to_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    instruction: text('instruction').notNull(),
    contextSummary: text('context_summary').notNull(),
    artifactIds: text('artifact_ids').array().notNull().default(sql`'{}'::text[]`),
    status: handoffStatus('status').notNull().default('pending'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('handoffs_project_idx').on(t.projectId), index('handoffs_target_idx').on(t.targetTaskId)],
);

/* ------------------------------------------------------------------ */
/* Artifacts                                                           */
/* ------------------------------------------------------------------ */
export const artifacts = pgTable(
  'artifacts',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    kind: artifactKind('kind').notNull(),
    name: text('name').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    externalUrl: text('external_url'),
    demo: boolean('demo').notNull().default(false),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('artifacts_project_idx').on(t.projectId)],
);

export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: id(),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Inline content for text artifacts; large/binary content lives in object storage. */
    content: text('content'),
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    authorAgentId: text('author_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('artifact_versions_uq').on(t.artifactId, t.version)],
);

/* ------------------------------------------------------------------ */
/* Governance                                                          */
/* ------------------------------------------------------------------ */
export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').references(() => missions.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    kind: approvalKind('kind').notNull(),
    status: approvalStatus('status').notNull().default('pending'),
    title: text('title').notNull(),
    details: text('details').notNull().default(''),
    requestedByAgentId: text('requested_by_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('approvals_project_idx').on(t.projectId, t.status)],
);

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: providerId('provider').notNull(),
    /** AES-256-GCM ciphertext (iv:tag:data, base64). Never returned by the API. */
    encryptedApiKey: text('encrypted_api_key'),
    keyHint: text('key_hint'),
    enabled: boolean('enabled').notNull().default(true),
    defaultModel: text('default_model'),
    monthlyBudgetUsd: money('monthly_budget_usd'),
    availableModels: jsonb('available_models').$type<string[]>().notNull().default([]),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastCheckOk: boolean('last_check_ok'),
    lastCheckError: text('last_check_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('provider_configs_ws_provider_uq').on(t.workspaceId, t.provider)],
);

export const modelPrices = pgTable(
  'model_prices',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: providerId('provider').notNull(),
    model: text('model').notNull(),
    inputPerMTokUsd: money('input_per_mtok_usd').notNull(),
    outputPerMTokUsd: money('output_per_mtok_usd').notNull(),
    source: text('source').notNull().default('user'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('model_prices_uq').on(t.workspaceId, t.provider, t.model)],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    runId: text('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    provider: providerId('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    /** Null when no price is configured for the model (cost unknown). */
    costUsd: money('cost_usd'),
    priceSource: text('price_source'),
    status: runStatus('status').notNull(),
    demo: boolean('demo').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('usage_project_idx').on(t.projectId), index('usage_agent_idx').on(t.agentId)],
);

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    agentId: text('agent_id'),
    taskId: text('task_id'),
    missionId: text('mission_id'),
    demo: boolean('demo').notNull().default(false),
    summary: text('summary').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('events_project_id_idx').on(t.projectId, t.id)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_ws_idx').on(t.workspaceId, t.createdAt)],
);
