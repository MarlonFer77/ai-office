import type { ProviderId } from '@ai-office/shared';
import { AnthropicAdapter } from './providers/anthropic.js';
import { DemoAdapter, type DemoAdapterOptions } from './providers/demo.js';
import { OpenAIAdapter } from './providers/openai.js';
import type { ProviderAdapter } from './types.js';
import { ProviderError } from './errors.js';

export interface AdapterFactoryInput {
  provider: ProviderId;
  apiKey?: string | null;
  demo?: DemoAdapterOptions;
}

/** Creates an adapter. New providers are added here without touching orchestration code. */
export function createAdapter(input: AdapterFactoryInput): ProviderAdapter {
  switch (input.provider) {
    case 'demo':
      return new DemoAdapter(input.demo);
    case 'anthropic':
      if (!input.apiKey) throw new ProviderError('auth', 'Provedor Anthropic não configurado.', false);
      return new AnthropicAdapter({ apiKey: input.apiKey });
    case 'openai':
      if (!input.apiKey) throw new ProviderError('auth', 'Provedor OpenAI não configurado.', false);
      return new OpenAIAdapter({ apiKey: input.apiKey });
  }
}
