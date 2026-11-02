import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { accounts, sessions, users, verifications, type Database } from '@ai-office/database';
import type { Env } from './env.js';

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    appName: 'AI Office',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: { enabled: env.NODE_ENV !== 'test', window: 60, max: 30 },
    telemetry: { enabled: false },
  });
}
export type Auth = ReturnType<typeof createAuth>;
