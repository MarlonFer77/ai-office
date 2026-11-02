import type { AgentRole, AgentStatus, ApprovalKind, ArtifactKind, MissionStatus, OfficeEvent, ProjectMode, ProviderId, RoomKind, RunStatus, TaskStatus } from '@ai-office/shared';

export type { OfficeEvent };

export interface Progress { total: number; completed: number; failed: number; percent: number }

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  objective: string;
  description: string;
  mode: ProjectMode;
  budgetLimitUsd: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress?: Progress;
  agentCount?: number;
}

export interface Room {
  id: string;
  projectId: string;
  kind: RoomKind;
  name: string;
  category: string;
  gridX: number;
  gridY: number;
  width: number;
  depth: number;
  theme: { accent: string; floor: string };
}

export interface Agent {
  id: string;
  projectId: string;
  roomId: string | null;
  name: string;
  role: AgentRole;
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  avatarSeed: number;
  status: AgentStatus;
  permissions: string[];
  budgetLimitUsd: number | null;
  maxOutputTokens: number;
  paused: boolean;
  lastError: string | null;
  createdAt: string;
  busy?: boolean;
  openTasks?: number;
}

export interface Task {
  id: string;
  projectId: string;
  missionId: string | null;
  key: string;
  title: string;
  instruction: string;
  role: AgentRole;
  assignedAgentId: string | null;
  status: TaskStatus;
  priority: number;
  requiresApproval: boolean;
  attempts: number;
  maxAttempts: number;
  resultArtifactId: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  dependsOn?: string[];
}

export interface Mission {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  status: MissionStatus;
  plannerAgentId: string | null;
  planSummary: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  progress?: Progress;
}

export interface Approval {
  id: string;
  projectId: string;
  missionId: string | null;
  taskId: string | null;
  kind: ApprovalKind;
  status: 'pending' | 'approved' | 'rejected';
  title: string;
  details: string;
  requestedByAgentId: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Handoff {
  id: string;
  missionId: string | null;
  sourceTaskId: string | null;
  targetTaskId: string | null;
  fromAgentId: string | null;
  toAgentId: string | null;
  instruction: string;
  contextSummary: string;
  artifactIds: string[];
  status: 'pending' | 'delivered' | 'consumed';
  createdAt: string;
  completedAt: string | null;
}

export interface Artifact {
  id: string;
  projectId: string;
  agentId: string | null;
  taskId: string | null;
  kind: ArtifactKind;
  name: string;
  currentVersion: number;
  externalUrl: string | null;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number;
  authorAgentId: string | null;
  authorUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  seq: number;
  agentId: string;
  role: 'user' | 'assistant';
  source: 'user' | 'agent' | 'orchestrator' | 'handoff';
  content: string;
  taskId: string | null;
  runId: string | null;
  demo: boolean;
  createdAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  kind: 'chat' | 'task' | 'plan';
  status: RunStatus;
  provider: ProviderId;
  model: string;
  demo: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OfficeSnapshot {
  project: Project;
  rooms: Room[];
  agents: Agent[];
  tasks: Task[];
  missions: Mission[];
  approvals: Approval[];
  progress: Progress;
  usage: { costUsd: number; inputTokens: number; outputTokens: number };
  lastEventId: string;
}

export interface ProviderConfig {
  provider: 'anthropic' | 'openai';
  configured: boolean;
  keyHint: string | null;
  enabled: boolean;
  defaultModel: string | null;
  monthlyBudgetUsd: number | null;
  availableModels: string[];
  suggestedModels: string[];
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
}

export interface ModelPrice { id?: string; provider: ProviderId; model: string; inputPerMTokUsd: number; outputPerMTokUsd: number; source: string }
