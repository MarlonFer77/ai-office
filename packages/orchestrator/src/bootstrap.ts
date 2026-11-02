import {
  agents,
  agentSessions,
  auditLogs,
  orm,
  projects,
  providerConfigs,
  rooms,
  workspaceMembers,
  workspaces,
  type Database,
} from '@ai-office/database';
import {
  type AgentRole,
  type CreateAgentInput,
  type CreateProjectInput,
  DEFAULT_AGENT_PERMISSIONS,
  type ProviderId,
  ROLE_ROOM,
  ROOM_BLUEPRINTS,
} from '@ai-office/shared';
import { SUGGESTED_MODELS } from '@ai-office/agents';
import type { OrchestratorContext } from './context.js';
import { emitEvent } from './events.js';

const { eq, and } = orm;

export async function ensureWorkspaceForUser(db: Database, user: { id: string; name: string }) {
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, user.id),
  });
  if (existing) return existing.workspaceId;
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({ name: `Escritório de ${user.name || 'Usuário'}` })
      .returning();
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: ws!.id, userId: user.id, role: 'owner' });
    return ws!.id;
  });
}

export async function audit(
  db: Database,
  entry: {
    workspaceId: string | null;
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
) {
  await db.insert(auditLogs).values({
    workspaceId: entry.workspaceId,
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}

const STARTER_TEAM: { name: string; role: AgentRole; real: 'anthropic' | 'openai' }[] = [
  { name: 'Claude Estrategista', role: 'strategist', real: 'anthropic' },
  { name: 'Claude Pesquisador', role: 'researcher', real: 'anthropic' },
  { name: 'GPT Programador', role: 'developer', real: 'openai' },
  { name: 'Claude Criativo', role: 'creative', real: 'anthropic' },
  { name: 'Revisor', role: 'reviewer', real: 'anthropic' },
];

/** Picks the provider/model for a starter agent: real provider if configured, else demo. */
async function starterModel(
  db: Database,
  workspaceId: string,
  preferred: 'anthropic' | 'openai',
  mode: 'demo' | 'real',
) {
  if (mode === 'demo') return { provider: 'demo' as ProviderId, model: 'demo-sim-1' };
  const configs = await db.query.providerConfigs.findMany({
    where: and(eq(providerConfigs.workspaceId, workspaceId), eq(providerConfigs.enabled, true)),
  });
  const pick =
    configs.find((c) => c.provider === preferred && c.encryptedApiKey) ??
    configs.find((c) => c.encryptedApiKey);
  if (!pick) return { provider: 'demo' as ProviderId, model: 'demo-sim-1' };
  const model =
    pick.defaultModel ??
    SUGGESTED_MODELS[pick.provider as 'anthropic' | 'openai'][0] ??
    pick.availableModels[0];
  if (!model) return { provider: 'demo' as ProviderId, model: 'demo-sim-1' };
  return { provider: pick.provider, model };
}

export async function createProject(
  ctx: Pick<OrchestratorContext, 'db' | 'redis' | 'logger'>,
  input: CreateProjectInput & { workspaceId: string; userId: string | null },
) {
  const { db } = ctx;
  const project = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        objective: input.objective,
        description: input.description,
        mode: input.mode,
        budgetLimitUsd: input.budgetLimitUsd,
        createdBy: input.userId,
      })
      .returning();
    await tx.insert(rooms).values(
      ROOM_BLUEPRINTS.map((r) => ({
        projectId: p!.id,
        kind: r.kind,
        name: r.name,
        category: r.category,
        gridX: r.gridX,
        gridY: r.gridY,
        width: r.width,
        depth: r.depth,
        theme: { accent: r.accent, floor: r.floor },
      })),
    );
    return p!;
  });
  if (input.starterTeam) {
    let seed = 1;
    for (const member of STARTER_TEAM) {
      const { provider, model } = await starterModel(
        db,
        input.workspaceId,
        member.real,
        input.mode,
      );
      const name =
        provider === 'demo'
          ? member.name.replace(/^(Claude|GPT) /, '')
          : member.name.replace(/^(Claude|GPT) /, provider === 'openai' ? 'GPT ' : 'Claude ');
      await createAgent(ctx, project.id, {
        name,
        role: member.role,
        provider,
        model,
        systemPrompt: '',
        budgetLimitUsd: null,
        maxOutputTokens: 4000,
        avatarSeed: seed++,
      });
    }
  }
  await audit(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: 'project.create',
    resourceType: 'project',
    resourceId: project.id,
  });
  return project;
}

export async function createAgent(
  ctx: Pick<OrchestratorContext, 'db' | 'redis' | 'logger'>,
  projectId: string,
  input: CreateAgentInput,
) {
  const roomKind = input.roomKind ?? ROLE_ROOM[input.role];
  const room = await ctx.db.query.rooms.findFirst({
    where: and(eq(rooms.projectId, projectId), eq(rooms.kind, roomKind)),
  });
  const agent = await ctx.db.transaction(async (tx) => {
    const [a] = await tx
      .insert(agents)
      .values({
        projectId,
        roomId: room?.id ?? null,
        name: input.name,
        role: input.role,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        avatarSeed: input.avatarSeed ?? Math.floor(Math.random() * 1000),
        permissions: input.permissions ?? DEFAULT_AGENT_PERMISSIONS,
        budgetLimitUsd: input.budgetLimitUsd,
        maxOutputTokens: input.maxOutputTokens,
      })
      .returning();
    // Each agent owns exactly one independent session (its own history).
    await tx.insert(agentSessions).values({ agentId: a!.id, projectId });
    return a!;
  });
  await emitEvent(ctx, {
    type: 'agent.created',
    projectId,
    agentId: agent.id,
    demo: agent.provider === 'demo',
    summary: `${agent.name} entrou na ${room?.name ?? 'equipe'}`,
    payload: { role: agent.role, provider: agent.provider, model: agent.model, roomKind },
  });
  return agent;
}
