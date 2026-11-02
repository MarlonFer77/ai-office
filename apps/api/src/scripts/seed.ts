/**
 * Seeds a complete demo office: a demo user, a project with the starter team,
 * and one mission executed end-to-end through the real orchestrator using the
 * deterministic demo provider (no external APIs).
 */
import {
  approvals,
  createDb,
  missions,
  orm,
  projects,
  runMigrations,
  users,
} from '@ai-office/database';
import {
  createProject,
  ensureWorkspaceForUser,
  executeTask,
  MemoryJobQueue,
  planMission,
  resolveApproval,
  runChat,
  createMission,
  type OrchestratorContext,
} from '@ai-office/orchestrator';
import { createAuth } from '../auth.js';
import { loadEnv } from '../env.js';

const { eq, and } = orm;
export const DEMO_EMAIL = 'demo@aioffice.dev';
export const DEMO_PASSWORD = 'aioffice-demo';

const env = loadEnv();
await runMigrations(env.DATABASE_URL);
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth(db, env);

let user = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
if (!user) {
  await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Diretor Demo' },
  });
  user = (await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) }))!;
  console.log(`Usuário demo criado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
const workspaceId = await ensureWorkspaceForUser(db, user);
const existing = await db.query.projects.findFirst({
  where: and(eq(projects.workspaceId, workspaceId), eq(projects.name, 'Lançamento FinFlow')),
});
if (existing) {
  console.log('Escritório demo já existe — nada a fazer.');
  await close();
  process.exit(0);
}

const queue = new MemoryJobQueue();
const ctx: OrchestratorContext = {
  db,
  redis: { publish: async () => 0 },
  queue,
  config: { encryptionKey: env.ENCRYPTION_KEY, demoChunkDelayMs: 0 },
  logger: console,
};
const drain = async () => {
  for (let job = queue.take(); job; job = queue.take()) {
    if (job.kind === 'plan') await planMission(ctx, job.missionId);
    else if (job.kind === 'task') await executeTask(ctx, job.taskId);
    else await runChat(ctx, job.runId);
  }
};

const project = await createProject(ctx, {
  name: 'Lançamento FinFlow',
  objective: 'Lançar um novo software de gestão financeira para PMEs.',
  description: 'Escritório de demonstração com equipe completa. Todas as respostas são simuladas.',
  mode: 'demo',
  budgetLimitUsd: null,
  starterTeam: true,
  workspaceId,
  userId: user.id,
});
const mission = await createMission(
  ctx,
  project.id,
  {
    title: 'Estratégia de lançamento',
    goal: 'Crie uma estratégia de lançamento para um novo software de gestão financeira.',
  },
  user.id,
);
await drain();
for (let i = 0; i < 5; i++) {
  const pending = await db.query.approvals.findFirst({
    where: and(eq(approvals.missionId, mission.id), eq(approvals.status, 'pending')),
  });
  if (!pending) break;
  await resolveApproval(ctx, pending.id, 'approved', user.id);
  await drain();
}
const m = await db.query.missions.findFirst({ where: eq(missions.id, mission.id) });
console.log(`Escritório demo criado: projeto "${project.name}", missão ${m?.status}.`);
await close();
