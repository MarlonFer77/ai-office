import type { Database } from '@ai-office/database';
import type { Redis } from 'ioredis';
import type { ProviderAdapter } from '@ai-office/agents';
import type { ProviderId } from '@ai-office/shared';
import type { JobQueue } from './queue.js';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface OrchestratorConfig {
  encryptionKey: string;
  /** Delay between streamed chunks for the demo provider. */
  demoChunkDelayMs: number;
}

export interface OrchestratorContext {
  db: Database;
  /** Publisher connection (pub/sub fan-out of live events). */
  redis: Pick<Redis, 'publish'>;
  queue: JobQueue;
  config: OrchestratorConfig;
  logger: Logger;
  /** Test hook: override adapter creation. */
  adapterOverride?: (provider: ProviderId, demo: boolean) => ProviderAdapter | undefined;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
