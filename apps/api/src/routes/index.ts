import type { FastifyInstance } from 'fastify';
import { type AppDeps, requireAuth } from '../app.js';
import { projectRoutes } from './projects.js';
import { agentRoutes } from './agents.js';
import { missionRoutes } from './missions.js';
import { artifactRoutes } from './artifacts.js';
import { settingsRoutes } from './settings.js';
import { streamRoutes } from './stream.js';

export async function registerRoutes(app: FastifyInstance, deps: AppDeps) {
  await app.register(
    async (scope) => {
      scope.addHook('preHandler', requireAuth(deps));
      scope.get('/me', async (req) => ({ user: req.user, workspaceId: req.workspaceId }));
      await projectRoutes(scope, deps);
      await agentRoutes(scope, deps);
      await missionRoutes(scope, deps);
      await artifactRoutes(scope, deps);
      await settingsRoutes(scope, deps);
      await streamRoutes(scope, deps);
    },
    { prefix: '/api' },
  );
}
