import type { FastifyRequest } from 'fastify';
import { agentRuns, agents, approvals, artifacts, missions, orm, tasks } from '@ai-office/database';
import { type AppDeps, HttpError, loadProject } from '../app.js';

const { eq } = orm;

/** Generic "load child row then authorise through its project" helpers. */
export async function loadAgent(deps: AppDeps, req: FastifyRequest, id: string) {
  const agent = await deps.db.query.agents.findFirst({ where: eq(agents.id, id) });
  if (!agent) throw new HttpError(404, 'Agente não encontrado.');
  const project = await loadProject(deps, req, agent.projectId);
  return { agent, project };
}
export async function loadMission(deps: AppDeps, req: FastifyRequest, id: string) {
  const mission = await deps.db.query.missions.findFirst({ where: eq(missions.id, id) });
  if (!mission) throw new HttpError(404, 'Missão não encontrada.');
  return { mission, project: await loadProject(deps, req, mission.projectId) };
}
export async function loadTask(deps: AppDeps, req: FastifyRequest, id: string) {
  const task = await deps.db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) throw new HttpError(404, 'Tarefa não encontrada.');
  return { task, project: await loadProject(deps, req, task.projectId) };
}
export async function loadApproval(deps: AppDeps, req: FastifyRequest, id: string) {
  const approval = await deps.db.query.approvals.findFirst({ where: eq(approvals.id, id) });
  if (!approval) throw new HttpError(404, 'Aprovação não encontrada.');
  return { approval, project: await loadProject(deps, req, approval.projectId) };
}
export async function loadArtifact(deps: AppDeps, req: FastifyRequest, id: string) {
  const artifact = await deps.db.query.artifacts.findFirst({ where: eq(artifacts.id, id) });
  if (!artifact) throw new HttpError(404, 'Artefato não encontrado.');
  return { artifact, project: await loadProject(deps, req, artifact.projectId) };
}
export async function loadRun(deps: AppDeps, req: FastifyRequest, id: string) {
  const run = await deps.db.query.agentRuns.findFirst({ where: eq(agentRuns.id, id) });
  if (!run) throw new HttpError(404, 'Execução não encontrada.');
  return { run, project: await loadProject(deps, req, run.projectId) };
}

export const idParams = (params: unknown) => {
  const id = (params as { id?: string }).id;
  if (!id || id.length > 64) throw new HttpError(400, 'Identificador inválido.');
  return id;
};
