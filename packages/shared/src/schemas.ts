import { z } from 'zod';
import {
  CONFIGURABLE_PROVIDERS,
  AGENT_PERMISSIONS,
  AGENT_ROLES,
  ARTIFACT_KINDS,
  PROJECT_MODES,
  PROVIDERS,
  ROOM_KINDS,
} from './domain.js';

const name = z.string().trim().min(1).max(120);

export const createProjectSchema = z.object({
  name,
  objective: z.string().trim().max(2000).default(''),
  description: z.string().trim().max(5000).default(''),
  mode: z.enum(PROJECT_MODES).default('demo'),
  budgetLimitUsd: z.number().nonnegative().max(100000).nullable().default(null),
  /** Create a starter team (strategist, researcher, developer, creative, reviewer). */
  starterTeam: z.boolean().default(true),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: name.optional(),
  objective: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(5000).optional(),
  mode: z.enum(PROJECT_MODES).optional(),
  budgetLimitUsd: z.number().nonnegative().max(100000).nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createAgentSchema = z.object({
  name,
  role: z.enum(AGENT_ROLES),
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(200),
  systemPrompt: z.string().max(20000).default(''),
  roomKind: z.enum(ROOM_KINDS).optional(),
  avatarSeed: z.number().int().min(0).max(9999).optional(),
  permissions: z.array(z.enum(AGENT_PERMISSIONS)).optional(),
  budgetLimitUsd: z.number().nonnegative().max(100000).nullable().default(null),
  maxOutputTokens: z.number().int().min(256).max(64000).default(4000),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = createAgentSchema.partial().extend({
  paused: z.boolean().optional(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export const createMissionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(5000),
});
export type CreateMissionInput = z.infer<typeof createMissionSchema>;

export const resolveApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).optional(),
});

export const providerConfigSchema = z.object({
  provider: z.enum(CONFIGURABLE_PROVIDERS),
  apiKey: z.string().trim().min(8).max(500).optional(),
  enabled: z.boolean().default(true),
  defaultModel: z.string().trim().max(200).nullable().optional(),
  monthlyBudgetUsd: z.number().nonnegative().max(1_000_000).nullable().optional(),
  /** Only honoured for providers whose preset allows it (local servers). */
  baseUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'URL deve usar http ou https')
    .nullable()
    .optional(),
  /** Declares the account as free tier: runs are recorded with cost US$ 0. */
  freeTier: z.boolean().optional(),
  maxConcurrency: z.number().int().min(1).max(16).nullable().optional(),
});
export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;

export const modelPriceSchema = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(200),
  inputPerMTokUsd: z.number().nonnegative().max(10000),
  outputPerMTokUsd: z.number().nonnegative().max(10000),
  source: z.string().trim().max(500).default('user'),
});
export type ModelPriceInput = z.infer<typeof modelPriceSchema>;

export const createArtifactSchema = z.object({
  name,
  kind: z.enum(ARTIFACT_KINDS),
  content: z.string().max(2_000_000).optional(),
  externalUrl: z.string().url().max(2000).optional(),
  taskId: z.string().optional(),
});

export const newArtifactVersionSchema = z.object({
  content: z.string().max(2_000_000),
  note: z.string().trim().max(500).optional(),
});

/** Structured plan returned by the strategist (validated before use). */
export const missionPlanSchema = z.object({
  summary: z.string().min(1).max(4000),
  tasks: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        title: z.string().min(1).max(200),
        instruction: z.string().min(1).max(4000),
        role: z.enum(AGENT_ROLES),
        dependsOn: z.array(z.string().max(40)).max(10).default([]),
        priority: z.number().int().min(0).max(10).default(5),
        requiresApproval: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(12),
});
export type MissionPlan = z.infer<typeof missionPlanSchema>;
