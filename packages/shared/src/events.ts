import { z } from 'zod';

/** Every real-time event type the backend can emit. */
export const EVENT_TYPES = [
  'agent.created',
  'agent.updated',
  'agent.started',
  'agent.message',
  'agent.message.delta',
  'agent.tool.started',
  'agent.tool.completed',
  'agent.idle',
  'agent.error',
  'agent.paused',
  'task.created',
  'task.ready',
  'task.started',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'task.retrying',
  'mission.created',
  'mission.planned',
  'mission.started',
  'mission.completed',
  'mission.failed',
  'mission.cancelled',
  'handoff.created',
  'handoff.completed',
  'artifact.created',
  'approval.requested',
  'approval.resolved',
  'budget.warning',
  'budget.exceeded',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Event types that are transient (streamed but not persisted). */
export const TRANSIENT_EVENT_TYPES: readonly EventType[] = ['agent.message.delta'];

export const officeEventSchema = z.object({
  /** Monotonic id (bigserial) for persisted events; transient events reuse the latest id with a suffix. */
  id: z.string(),
  type: z.enum(EVENT_TYPES),
  projectId: z.string(),
  agentId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  missionId: z.string().nullable().optional(),
  /** True when produced by the deterministic demo provider. */
  demo: z.boolean().default(false),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type OfficeEvent = z.infer<typeof officeEventSchema>;

export type NewOfficeEvent = Omit<OfficeEvent, 'id' | 'createdAt'>;

export const EVENT_SEVERITY: Partial<Record<EventType, 'info' | 'success' | 'warning' | 'error'>> =
  {
    'task.completed': 'success',
    'mission.completed': 'success',
    'handoff.completed': 'success',
    'artifact.created': 'success',
    'task.failed': 'error',
    'agent.error': 'error',
    'mission.failed': 'error',
    'budget.exceeded': 'error',
    'budget.warning': 'warning',
    'approval.requested': 'warning',
    'task.retrying': 'warning',
  };

/** Redis pub/sub channel for a project's live events. */
export const projectChannel = (projectId: string) => `ai-office:events:${projectId}`;
/** Redis channel to request cancellation of a run. */
export const RUN_CONTROL_CHANNEL = 'ai-office:run-control';
