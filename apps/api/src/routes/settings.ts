import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditLogs, modelPrices, orm, providerConfigs } from '@ai-office/database';
import {
  createAdapter,
  DEFAULT_MODEL_PRICES,
  encryptSecret,
  decryptSecret,
  keyHint,
  NON_CHAT_MODEL,
  SUGGESTED_MODELS,
} from '@ai-office/agents';
import {
  CONFIGURABLE_PROVIDERS,
  type ConfigurableProviderId,
  modelPriceSchema,
  PROVIDER_PRESETS,
  providerConfigSchema,
} from '@ai-office/shared';
import { audit } from '@ai-office/orchestrator';
import { type AppDeps, HttpError } from '../app.js';

const { and, eq, desc } = orm;

/** Public shape — the encrypted key never leaves the server. */
function toPublic(
  cfg: typeof providerConfigs.$inferSelect | undefined,
  provider: ConfigurableProviderId,
) {
  const preset = PROVIDER_PRESETS[provider];
  return {
    provider,
    label: preset.label,
    description: preset.description,
    keyUrl: preset.keyUrl,
    requiresApiKey: preset.requiresApiKey,
    baseUrlEditable: preset.baseUrlEditable,
    baseUrl: (preset.baseUrlEditable ? cfg?.baseUrl : null) ?? preset.baseUrl,
    configured: preset.requiresApiKey ? Boolean(cfg?.encryptedApiKey) : Boolean(cfg),
    keyHint: cfg?.keyHint ?? null,
    enabled: cfg?.enabled ?? false,
    defaultModel: cfg?.defaultModel ?? null,
    monthlyBudgetUsd: cfg?.monthlyBudgetUsd ?? null,
    freeTier: provider === 'ollama' ? true : (cfg?.freeTier ?? preset.defaultFree),
    maxConcurrency: cfg?.maxConcurrency ?? null,
    defaultConcurrency: preset.defaultConcurrency,
    availableModels: (cfg?.availableModels ?? []).filter((m) => !NON_CHAT_MODEL.test(m)),
    suggestedModels: SUGGESTED_MODELS[provider],
    lastCheckedAt: cfg?.lastCheckedAt ?? null,
    lastCheckOk: cfg?.lastCheckOk ?? null,
    lastCheckError: cfg?.lastCheckError ?? null,
  };
}

export async function settingsRoutes(app: FastifyInstance, deps: AppDeps) {
  const getCfg = (workspaceId: string, provider: ConfigurableProviderId) =>
    deps.db.query.providerConfigs.findFirst({
      where: and(
        eq(providerConfigs.workspaceId, workspaceId),
        eq(providerConfigs.provider, provider),
      ),
    });
  const providerParam = (p: unknown) =>
    z.object({ provider: z.enum(CONFIGURABLE_PROVIDERS) }).parse(p).provider;

  app.get('/providers', async (req) => {
    const out = [];
    for (const p of CONFIGURABLE_PROVIDERS)
      out.push(toPublic(await getCfg(req.workspaceId!, p), p));
    return out;
  });

  app.put('/providers/:provider', async (req) => {
    const provider = providerParam(req.params);
    const preset = PROVIDER_PRESETS[provider];
    const input = providerConfigSchema.parse({ ...(req.body as object), provider });
    if (input.baseUrl && !preset.baseUrlEditable) {
      throw new HttpError(400, `O endereço de ${preset.label} é fixo e não pode ser alterado.`);
    }
    // A user-supplied URL makes the server issue requests to it (SSRF risk):
    // only allowed for local providers and only when the deployment permits it.
    if (input.baseUrl && !deps.env.ALLOW_CUSTOM_PROVIDER_URLS) {
      throw new HttpError(
        403,
        'Endereços personalizados de provedores estão desativados neste servidor (ALLOW_CUSTOM_PROVIDER_URLS).',
      );
    }
    const existing = await getCfg(req.workspaceId!, provider);
    if (preset.requiresApiKey && !input.apiKey && !existing?.encryptedApiKey && input.enabled) {
      throw new HttpError(400, `Informe a chave de API de ${preset.label}.`);
    }
    const values = {
      workspaceId: req.workspaceId!,
      provider,
      enabled: input.enabled,
      ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
      ...(input.monthlyBudgetUsd !== undefined ? { monthlyBudgetUsd: input.monthlyBudgetUsd } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
      ...(input.freeTier !== undefined
        ? { freeTier: input.freeTier }
        : !existing
          ? { freeTier: preset.defaultFree }
          : {}),
      ...(input.maxConcurrency !== undefined ? { maxConcurrency: input.maxConcurrency } : {}),
      ...(input.apiKey
        ? {
            encryptedApiKey: encryptSecret(input.apiKey, deps.env.ENCRYPTION_KEY),
            keyHint: keyHint(input.apiKey),
            lastCheckOk: null,
            lastCheckError: null,
          }
        : {}),
    };
    const [row] = existing
      ? await deps.db
          .update(providerConfigs)
          .set(values)
          .where(eq(providerConfigs.id, existing.id))
          .returning()
      : await deps.db.insert(providerConfigs).values(values).returning();
    await audit(deps.db, {
      workspaceId: req.workspaceId!,
      userId: req.user!.id,
      action: input.apiKey ? 'provider.credentials.update' : 'provider.update',
      resourceType: 'provider_config',
      resourceId: row!.id,
      metadata: {
        provider,
        enabled: input.enabled,
        freeTier: row!.freeTier,
        customUrl: Boolean(row!.baseUrl),
      },
      ip: req.ip,
    });
    return toPublic(row, provider);
  });

  app.delete('/providers/:provider', async (req) => {
    const provider = providerParam(req.params);
    const existing = await getCfg(req.workspaceId!, provider);
    if (existing)
      await deps.db
        .update(providerConfigs)
        .set({ encryptedApiKey: null, keyHint: null, enabled: false, availableModels: [] })
        .where(eq(providerConfigs.id, existing.id));
    await audit(deps.db, {
      workspaceId: req.workspaceId!,
      userId: req.user!.id,
      action: 'provider.credentials.delete',
      resourceType: 'provider_config',
      resourceId: existing?.id ?? null,
      metadata: { provider },
      ip: req.ip,
    });
    return { ok: true };
  });

  /** Real connectivity check: lists models with the stored key. */
  app.post(
    '/providers/:provider/verify',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const provider = providerParam(req.params);
      const preset = PROVIDER_PRESETS[provider];
      const cfg = await getCfg(req.workspaceId!, provider);
      if (!cfg || (preset.requiresApiKey && !cfg.encryptedApiKey))
        throw new HttpError(
          400,
          preset.requiresApiKey
            ? 'Informe a chave de API antes de verificar.'
            : 'Salve a configuração antes de verificar.',
        );
      const adapter = createAdapter({
        provider,
        apiKey: cfg.encryptedApiKey
          ? decryptSecret(cfg.encryptedApiKey, deps.env.ENCRYPTION_KEY)
          : null,
        baseUrl: cfg.baseUrl,
      });
      const result = await adapter.verify();
      const [row] = await deps.db
        .update(providerConfigs)
        .set({
          lastCheckedAt: new Date(),
          lastCheckOk: result.ok,
          lastCheckError: result.ok ? null : result.error.slice(0, 500),
          ...(result.ok ? { availableModels: result.models.map((m) => m.id).slice(0, 500) } : {}),
        })
        .where(eq(providerConfigs.id, cfg.id))
        .returning();
      return toPublic(row, provider);
    },
  );

  app.get('/prices', async (req) => {
    const overrides = await deps.db.query.modelPrices.findMany({
      where: eq(modelPrices.workspaceId, req.workspaceId!),
    });
    return { defaults: DEFAULT_MODEL_PRICES, overrides };
  });

  app.put('/prices', async (req) => {
    const input = modelPriceSchema.parse(req.body);
    const [row] = await deps.db
      .insert(modelPrices)
      .values({ ...input, workspaceId: req.workspaceId! })
      .onConflictDoUpdate({
        target: [modelPrices.workspaceId, modelPrices.provider, modelPrices.model],
        set: {
          inputPerMTokUsd: input.inputPerMTokUsd,
          outputPerMTokUsd: input.outputPerMTokUsd,
          source: input.source,
        },
      })
      .returning();
    await audit(deps.db, {
      workspaceId: req.workspaceId!,
      userId: req.user!.id,
      action: 'price.upsert',
      resourceType: 'model_price',
      resourceId: row!.id,
      metadata: { provider: input.provider, model: input.model },
      ip: req.ip,
    });
    return row;
  });

  app.delete('/prices/:id', async (req) => {
    const id = z.object({ id: z.string().max(64) }).parse(req.params).id;
    await deps.db
      .delete(modelPrices)
      .where(and(eq(modelPrices.id, id), eq(modelPrices.workspaceId, req.workspaceId!)));
    return { ok: true };
  });

  app.get('/audit-logs', async (req) => {
    return deps.db.query.auditLogs.findMany({
      where: eq(auditLogs.workspaceId, req.workspaceId!),
      orderBy: desc(auditLogs.createdAt),
      limit: 200,
    });
  });
}
