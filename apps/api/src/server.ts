import { Redis } from 'ioredis';
import { createDb, runMigrations } from '@ai-office/database';
import { BullJobQueue } from '@ai-office/orchestrator';
import { buildApp } from './app.js';
import { createAuth } from './auth.js';
import { loadEnv } from './env.js';
import { EventHub } from './hub.js';
import { createStorage } from './storage.js';

const env = loadEnv();
if (process.env.RUN_MIGRATIONS === 'true') await runMigrations(env.DATABASE_URL);
const { db, close } = createDb(env.DATABASE_URL);
const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const hub = new EventHub(subscriber);
await hub.start();
const queue = new BullJobQueue(env.REDIS_URL);

const app = await buildApp({
  env,
  db,
  auth: createAuth(db, env),
  hub,
  storage: createStorage(env),
  orch: {
    db,
    redis: publisher,
    queue,
    config: { encryptionKey: env.ENCRYPTION_KEY, demoChunkDelayMs: env.DEMO_CHUNK_DELAY_MS },
    logger: console,
  },
});

const shutdown = async () => {
  await app.close();
  await queue.close();
  publisher.disconnect();
  subscriber.disconnect();
  await close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.API_PORT, host: env.API_HOST });
