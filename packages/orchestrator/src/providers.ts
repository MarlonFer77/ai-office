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
import type { ProviderId } from '@ai-office/shared';
import type { OrchestratorContext } from './context.js';

const { and, eq, gte, sql, sum } = orm;

/**
 * Resolves the adapter for an agent run. Demo projects always use the
 * simulated provider so nothing is ever presented as a real call.
 */
export async function resolveAdapter(
  ctx: OrchestratorContext,
  input: { workspaceId: string; projectMode: 'demo' | 'real'; provider: ProviderId },
): Promise<{ adapter: ProviderAdapter; demo: boolean }> {
  const demo = input.projectMode === 'demo' || input.provider === 'demo';
  const override = ctx.adapterOverride?.(input.provider, demo);
  if (override) return { adapter: override, demo: override.demo };
  if (demo)
    return {
      adapter: createAdapter({
        provider: 'demo',
        demo: { chunkDelayMs: ctx.config.demoChunkDelayMs },
      }),
      demo: true,
    };
  const cfg = await ctx.db.query.providerConfigs.findFirst({
    where: and(
      eq(providerConfigs.workspaceId, input.workspaceId),
      eq(providerConfigs.provider, input.provider),
    ),
  });
  if (!cfg?.encryptedApiKey)
    throw new ProviderError(
      'auth',
      `Provedor ${input.provider} não configurado para este workspace.`,
      false,
    );
  if (!cfg.enabled)
    throw new ProviderError('auth', `Provedor ${input.provider} está desativado.`, false);
  const apiKey = decryptSecret(cfg.encryptedApiKey, ctx.config.encryptionKey);
  return { adapter: createAdapter({ provider: input.provider, apiKey }), demo: false };
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
