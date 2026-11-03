import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Public origin of the web app (CORS + trusted origins). */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Public base URL under which the auth routes are reachable (usually the web origin, proxied). */
  BETTER_AUTH_URL: z.string().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be >= 32 chars'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be >= 16 chars'),
  DEMO_LOGIN_ENABLED: bool,
  /**
   * Allow custom base URLs for local OpenAI-compatible servers (Ollama).
   * The API server will call that URL, so keep it off on multi-tenant deployments.
   * Defaults to on outside production.
   */
  ALLOW_CUSTOM_PROVIDER_URLS: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1')),
  DEMO_CHUNK_DELAY_MS: z.coerce.number().int().min(0).default(35),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});
export type Env = Omit<z.infer<typeof envSchema>, 'ALLOW_CUSTOM_PROVIDER_URLS'> & {
  ALLOW_CUSTOM_PROVIDER_URLS: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return {
    ...parsed.data,
    ALLOW_CUSTOM_PROVIDER_URLS:
      parsed.data.ALLOW_CUSTOM_PROVIDER_URLS ?? parsed.data.NODE_ENV !== 'production',
  };
}
