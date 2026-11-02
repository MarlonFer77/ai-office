import { Redis } from 'ioredis';
import { pino } from 'pino';
import { z } from 'zod';
import { createDb } from '@ai-office/database';
import { BullJobQueue, type OrchestratorContext } from '@ai-office/orchestrator';
import { recoverStaleWork, startWorker } from './worker.js';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    ENCRYPTION_KEY: z.string().min(16),
    DEMO_CHUNK_DELAY_MS: z.coerce.number().int().min(0).default(35),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
    LOG_LEVEL: z.string().default('info'),
  })
  .parse(process.env);

const logger = pino({ level: env.LOG_LEVEL, redact: ['*.apiKey', '*.encryptedApiKey'] });
const { db, close } = createDb(env.DATABASE_URL, { max: env.WORKER_CONCURRENCY + 4 });
const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const control = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new BullJobQueue(env.REDIS_URL);

const ctx: OrchestratorContext = {
  db,
  redis: publisher,
  queue,
  config: { encryptionKey: env.ENCRYPTION_KEY, demoChunkDelayMs: env.DEMO_CHUNK_DELAY_MS },
  logger,
};

const recovery = await recoverStaleWork(ctx);
logger.info(recovery, 'startup recovery complete');
const worker = startWorker(ctx, env.REDIS_URL, control, env.WORKER_CONCURRENCY);
logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'AI Office worker started');

const shutdown = async () => {
  logger.info('shutting down worker');
  await worker.close();
  await queue.close();
  publisher.disconnect();
  control.disconnect();
  await close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
