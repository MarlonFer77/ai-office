import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { ZodError } from 'zod';
import { orm, projects, workspaceMembers, type Database } from '@ai-office/database';
import { ensureWorkspaceForUser, type OrchestratorContext } from '@ai-office/orchestrator';
import type { Auth } from './auth.js';
import type { Env } from './env.js';
import type { EventHub } from './hub.js';
import type { ObjectStorage } from './storage.js';
import { registerRoutes } from './routes/index.js';

const { and, eq, sql } = orm;

export interface AppDeps {
  env: Env;
  db: Database;
  auth: Auth;
  hub: EventHub;
  orch: OrchestratorContext;
  storage: ObjectStorage | null;
}

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
    workspaceId?: string;
  }
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.env.NODE_ENV === 'test'
        ? false
        : {
            level: deps.env.LOG_LEVEL,
            // Never log credentials or cookies.
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.apiKey',
            ],
          },
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [deps.env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    global: true,
    max: deps.env.NODE_ENV === 'test' ? 10_000 : 600,
    timeWindow: '1 minute',
    allowList: (req) => req.url.includes('/events/stream'),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Dados inválidos.',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError)
      return reply.status(err.statusCode).send({ error: 'http_error', message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply.status(status).send({ error: 'request_error', message: (err as Error).message });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: 'internal_error', message: 'Erro interno.' });
  });

  // Better Auth handler (sign-up, sign-in, sign-out, session).
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: {
      rateLimit: { max: deps.env.NODE_ENV === 'test' ? 10_000 : 30, timeWindow: '1 minute' },
    },
    async handler(request, reply) {
      const url = new URL(request.url, deps.env.BETTER_AUTH_URL);
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const res = await deps.auth.handler(req);
      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(res.body ? await res.text() : null);
    },
  });

  // Health includes the database so the UI can explain setup problems clearly.
  app.get('/api/health', async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1 from users limit 1`);
      return { ok: true, db: 'ok', sse: deps.hub.connectionCount() };
    } catch (err) {
      const msg =
        err instanceof Error
          ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}`
          : '';
      const db = /does not exist/i.test(msg) ? 'not_migrated' : 'unreachable';
      return reply.status(503).send({ ok: false, db, sse: deps.hub.connectionCount() });
    }
  });
  app.get('/api/config', async () => ({
    demoLoginEnabled: deps.env.DEMO_LOGIN_ENABLED,
    storageEnabled: Boolean(deps.storage),
  }));

  await registerRoutes(app, deps);
  return app;
}

/** preHandler: requires an authenticated session; attaches user + workspace. */
export function requireAuth(deps: AppDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await deps.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session)
      return reply
        .status(401)
        .send({ error: 'unauthorized', message: 'Faça login para continuar.' });
    request.user = { id: session.user.id, name: session.user.name, email: session.user.email };
    request.workspaceId = await ensureWorkspaceForUser(deps.db, session.user);
  };
}

/** Loads a project only if the user is a member of its workspace (404 otherwise, to avoid leaking ids). */
export async function loadProject(deps: AppDeps, request: FastifyRequest, projectId: string) {
  const project = await deps.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new HttpError(404, 'Projeto não encontrado.');
  const member = await deps.db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, project.workspaceId),
      eq(workspaceMembers.userId, request.user!.id),
    ),
  });
  if (!member) throw new HttpError(404, 'Projeto não encontrado.');
  return project;
}
