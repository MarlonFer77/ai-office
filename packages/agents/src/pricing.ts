import type { ProviderId } from '@ai-office/shared';
import type { TokenUsage } from './types.js';

export interface ModelPrice {
  provider: ProviderId;
  model: string;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  source: string;
}

/**
 * Default price table. Only prices published by the provider are listed here.
 * Anthropic values come from Anthropic's published API pricing (cached
 * 2026-10-06). OpenAI prices are intentionally not hard-coded: configure them
 * in Settings → Preços so costs are never invented.
 */
export const ANTHROPIC_PRICE_SOURCE = 'Anthropic API pricing (tabela publicada, cache 2026-10-06)';
export const DEFAULT_MODEL_PRICES: ModelPrice[] = [
  ['claude-fable-5-1', 10, 50],
  ['claude-opus-5-5', 4, 20],
  ['claude-opus-5', 5, 25],
  ['claude-sonnet-5-5', 2, 10],
  ['claude-sonnet-5', 2, 10],
  ['claude-haiku-5-5', 0.1, 0.5],
  ['claude-haiku-4-5', 1, 5],
].map(([model, i, o]) => ({
  provider: 'anthropic' as const,
  model: model as string,
  inputPerMTokUsd: i as number,
  outputPerMTokUsd: o as number,
  source: ANTHROPIC_PRICE_SOURCE,
}));

/** Suggested Anthropic models (real IDs). The live list comes from the Models API. */
export const SUGGESTED_MODELS: Record<'anthropic' | 'openai' | 'demo', string[]> = {
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  // OpenAI IDs are discovered from the live Models API after the key is verified.
  openai: [],
  demo: ['demo-sim-1'],
};

export interface CostResult {
  costUsd: number | null;
  priceSource: string | null;
}

/**
 * Computes cost from configured prices. Returns null cost when no price is
 * known — the UI shows "custo desconhecido" rather than a made-up number.
 * Demo runs always cost 0.
 */
export function computeCost(
  provider: ProviderId,
  model: string,
  usage: TokenUsage,
  prices: ModelPrice[],
): CostResult {
  if (provider === 'demo') return { costUsd: 0, priceSource: 'demo' };
  const price =
    prices.find((p) => p.provider === provider && p.model === model) ??
    // Providers may return a dated snapshot id; fall back to the longest matching prefix.
    prices
      .filter((p) => p.provider === provider && model.startsWith(p.model))
      .sort((a, b) => b.model.length - a.model.length)[0];
  if (!price) return { costUsd: null, priceSource: null };
  const cost =
    (usage.inputTokens * price.inputPerMTokUsd + usage.outputTokens * price.outputPerMTokUsd) / 1_000_000;
  return { costUsd: Math.round(cost * 1e6) / 1e6, priceSource: price.source };
}
