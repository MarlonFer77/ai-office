import {
  createAdapter,
  decryptSecret,
  DEFAULT_MODEL_PRICES,
  type ModelPrice,
  ProviderError,
  type ProviderAdapter,
} from '@ai-office/agents';
import {
  agentRuns,
  modelPrices,
  orm,
  projects,
  providerConfigs,
  usageRecords,
} from '@ai-office/database';
import { PROVIDER_PRESETS, type ProviderId } from '@ai-office/shared';
import type { OrchestratorContext } from './context.js';

const { and, eq, gte, sql, sum } = orm;

/** Loads the runtime settings (and stored config) for a provider without creating an adapter. */
export async function providerSettings(
  ctx: Pick<OrchestratorContext, 'db'>,
  input: { workspaceId: string; projectMode: 'demo' | 'real'; provider: ProviderId },
) {
  const demo = input.projectMode === 'demo' || input.provider === 'demo';
  const cfg =
    demo || input.provider === 'demo'
      ? undefined
      : await ctx.db.query.providerConfigs.findFirst({
          where: and(
            eq(providerConfigs.workspaceId, input.workspaceId),
            eq(providerConfigs.provider, input.provider),
          ),
        });
  const preset = input.provider === 'demo' ? null : PROVIDER_PRESETS[input.provider];
  const settings: ProviderRuntimeSettings =
    demo || !preset
      ? DEMO_SETTINGS
      : {
          freeTier: input.provider === 'ollama' || (cfg?.freeTier ?? false),
          maxConcurrency: cfg?.maxConcurrency ?? preset.defaultConcurrency,
          maxOutputTokens: preset.maxOutputTokens,
          contextBudgetTokens: preset.contextBudgetTokens,
        };

  return { demo, cfg, preset, settings };
}

/**
 * Resolves the adapter for an agent run. Demo projects always use the
 * simulated provider so nothing is ever presented as a real call.
 */
export interface ProviderRuntimeSettings {
  /** Runs are recorded with cost 0 (local server or declared free tier). */
  freeTier: boolean;
  /** Max simultaneous runs against this provider in this worker. */
  maxConcurrency: number;
  /** Cap on output tokens per call (null = agent setting only). */
  maxOutputTokens: number | null;
  /** Approximate token budget for the history sent per call (null = message-count limit only). */
  contextBudgetTokens: number | null;
}

const DEMO_SETTINGS: ProviderRuntimeSettings = {
  freeTier: true,
  maxConcurrency: 8,
  maxOutputTokens: null,
  contextBudgetTokens: null,
};

/**
 * Resolves the adapter for an agent run. Demo projects always use the
 * simulated provider so nothing is ever presented as a real call.
 */
export async function resolveAdapter(
  ctx: OrchestratorContext,
  input: { workspaceId: string; projectMode: 'demo' | 'real'; provider: ProviderId },
): Promise<{ adapter: ProviderAdapter; demo: boolean; settings: ProviderRuntimeSettings }> {
  const { demo, cfg, preset, settings } = await providerSettings(ctx, input);

  const override = ctx.adapterOverride?.(input.provider, demo);
  if (override) return { adapter: override, demo: override.demo, settings };
  if (demo || !preset)
    return {
      adapter: createAdapter({
        provider: 'demo',
        demo: { chunkDelayMs: ctx.config.demoChunkDelayMs },
      }),
      demo: true,
      settings,
    };
  if (!cfg || (preset.requiresApiKey && !cfg.encryptedApiKey))
    throw new ProviderError(
      'auth',
      `Provedor ${preset.label} não configurado para este workspace.`,
      false,
    );
  if (!cfg.enabled)
    throw new ProviderError('auth', `Provedor ${preset.label} está desativado.`, false);
  const apiKey = cfg.encryptedApiKey
    ? decryptSecret(cfg.encryptedApiKey, ctx.config.encryptionKey)
    : null;
  return {
    adapter: createAdapter({ provider: input.provider, apiKey, baseUrl: cfg.baseUrl }),
    demo: false,
    settings,
  };
}

export class ProviderBusyError extends Error {
  constructor(provider: string) {
    super(`Limite de execuções simultâneas do provedor ${provider} atingido.`);
    this.name = 'ProviderBusyError';
  }
}

/**
 * Per-provider concurrency gate (per worker process). Free tiers and local
 * servers are protected from bursts; callers re-enqueue on ProviderBusyError.
 */
const activeByProvider = new Map<string, number>();
export function acquireProviderSlot(provider: string, max: number): () => void {
  const active = activeByProvider.get(provider) ?? 0;
  if (active >= max) throw new ProviderBusyError(provider);
  activeByProvider.set(provider, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeByProvider.set(provider, Math.max(0, (activeByProvider.get(provider) ?? 1) - 1));
  };
}

/**
 * Keeps the most recent messages within an approximate token budget
 * (~4 characters per token). Always keeps at least the last message.
 */
export function trimHistoryToBudget<T extends { content: string }>(
  history: T[],
  budgetTokens: number | null,
  systemChars = 0,
): T[] {
  if (budgetTokens == null) return history;
  let remaining = budgetTokens * 4 - systemChars;
  const out: T[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (out.length > 0 && m.content.length > remaining) break;
    out.unshift(
      out.length === 0 && m.content.length > remaining
        ? { ...m, content: m.content.slice(-Math.max(2000, remaining)) }
        : m,
    );
    remaining -= m.content.length;
  }
  return out;
}

/** Workspace overrides take precedence over the published defaults. */
export async function getPrices(
  ctx: Pick<OrchestratorContext, 'db'>,
  workspaceId: string,
): Promise<ModelPrice[]> {
  const rows = await ctx.db.query.modelPrices.findMany({
    where: eq(modelPrices.workspaceId, workspaceId),
  });
  const overrides: ModelPrice[] = rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    inputPerMTokUsd: r.inputPerMTokUsd,
    outputPerMTokUsd: r.outputPerMTokUsd,
    source: r.source,
  }));
  return [
    ...overrides,
    ...DEFAULT_MODEL_PRICES.filter(
      (d) => !overrides.some((o) => o.provider === d.provider && o.model === d.model),
    ),
  ];
}

export interface BudgetStatus {
  exceeded: boolean;
  warning: boolean;
  reason?: string;
}

/** Checks project, agent and provider-month spend limits before a real run. */
export async function checkBudget(
  ctx: Pick<OrchestratorContext, 'db'>,
  input: {
    projectId: string;
    agentId: string;
    agentLimit: number | null;
    workspaceId: string;
    provider: ProviderId;
  },
): Promise<BudgetStatus> {
  const project = await ctx.db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
  });
  const spent = async (where: ReturnType<typeof and>) => {
    const [row] = await ctx.db
      .select({ total: sum(usageRecords.costUsd) })
      .from(usageRecords)
      .where(where);
    return Number(row?.total ?? 0);
  };
  const checks: { limit: number | null | undefined; used: () => Promise<number>; label: string }[] =
    [
      {
        limit: project?.budgetLimitUsd,
        used: () => spent(and(eq(usageRecords.projectId, input.projectId))),
        label: 'projeto',
      },
      {
        limit: input.agentLimit,
        used: () => spent(and(eq(usageRecords.agentId, input.agentId))),
        label: 'agente',
      },
    ];
  const cfg = await ctx.db.query.providerConfigs.findFirst({
    where: and(
      eq(providerConfigs.workspaceId, input.workspaceId),
      eq(providerConfigs.provider, input.provider),
    ),
  });
  if (cfg?.monthlyBudgetUsd != null) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    checks.push({
      limit: cfg.monthlyBudgetUsd,
      label: `provedor ${input.provider} (mês)`,
      used: async () => {
        const [row] = await ctx.db
          .select({ total: sum(usageRecords.costUsd) })
          .from(usageRecords)
          .innerJoin(projects, eq(projects.id, usageRecords.projectId))
          .where(
            and(
              eq(projects.workspaceId, input.workspaceId),
              eq(usageRecords.provider, input.provider),
              gte(usageRecords.createdAt, monthStart),
            ),
          );
        return Number(row?.total ?? 0);
      },
    });
  }
  let warning = false;
  for (const c of checks) {
    if (c.limit == null) continue;
    const used = await c.used();
    if (used >= c.limit)
      return {
        exceeded: true,
        warning: true,
        reason: `Limite de gasto do ${c.label} atingido (US$ ${used.toFixed(4)} de US$ ${c.limit.toFixed(2)}).`,
      };
    if (used >= c.limit * 0.8) warning = true;
  }
  return { exceeded: false, warning };
}

export async function runCountForAgent(ctx: Pick<OrchestratorContext, 'db'>, agentId: string) {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId));
  return row?.n ?? 0;
}
