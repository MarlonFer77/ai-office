import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { artifacts, artifactVersions, orm } from '@ai-office/database';
import { ARTIFACT_KINDS, createArtifactSchema, newArtifactVersionSchema } from '@ai-office/shared';
import { audit, emitEvent } from '@ai-office/orchestrator';
import { type AppDeps, HttpError, loadProject } from '../app.js';
import { idParams, loadArtifact } from './access.js';

const { and, eq, desc, ilike, or, sql } = orm;

const MIME: Record<string, string> = {
  markdown: 'text/markdown; charset=utf-8',
  report: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  code: 'text/plain; charset=utf-8',
  text: 'text/plain; charset=utf-8',
};
const EXT: Record<string, string> = {
  markdown: '.md',
  report: '.md',
  json: '.json',
  code: '.txt',
  text: '.txt',
};

const safeFileName = (name: string) =>
  name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'artefato';

export async function artifactRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Searchable library (name + latest content). */
  app.get('/projects/:id/artifacts', async (req) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const q = z
      .object({ q: z.string().trim().max(200).optional(), kind: z.enum(ARTIFACT_KINDS).optional() })
      .parse(req.query);
    const pattern = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const rows = await deps.db
      .select({ artifact: artifacts })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.projectId, project.id),
          q.kind ? eq(artifacts.kind, q.kind) : undefined,
          pattern
            ? or(
                ilike(artifacts.name, pattern),
                sql`exists (select 1 from ${artifactVersions} v where v.artifact_id = ${artifacts.id} and v.version = ${artifacts.currentVersion} and v.content ilike ${pattern})`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(artifacts.updatedAt))
      .limit(200);
    return rows.map((r) => r.artifact);
  });

  app.post('/projects/:id/artifacts', async (req, reply) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const input = createArtifactSchema.parse(req.body);
    if (input.kind === 'external_ref' && !input.externalUrl)
      throw new HttpError(400, 'Informe a URL da referência externa.');
    if (input.kind !== 'external_ref' && input.kind !== 'document' && input.content === undefined)
      throw new HttpError(400, 'Informe o conteúdo.');
    if (input.kind === 'json' && input.content) {
      try {
        JSON.parse(input.content);
      } catch {
        throw new HttpError(400, 'JSON inválido.');
      }
    }
    const [art] = await deps.db
      .insert(artifacts)
      .values({
        projectId: project.id,
        kind: input.kind,
        name: input.name,
        externalUrl: input.externalUrl ?? null,
        taskId: input.taskId ?? null,
        createdBy: req.user!.id,
      })
      .returning();
    await deps.db.insert(artifactVersions).values({
      artifactId: art!.id,
      version: 1,
      content: input.content ?? null,
      mimeType: MIME[input.kind] ?? null,
      sizeBytes: Buffer.byteLength(input.content ?? ''),
      authorUserId: req.user!.id,
    });
    await emitEvent(deps.orch, {
      type: 'artifact.created',
      projectId: project.id,
      demo: false,
      summary: `Diretor adicionou "${art!.name}" à biblioteca`,
      payload: { artifactId: art!.id },
    });
    return reply.status(201).send(art);
  });

  /** Upload of an attached document (base64) to S3-compatible storage. */
  app.post('/projects/:id/artifacts/upload', async (req, reply) => {
    const project = await loadProject(deps, req, idParams(req.params));
    if (!deps.storage)
      throw new HttpError(503, 'Armazenamento de arquivos (S3/MinIO) não configurado.');
    const input = z
      .object({
        name: z.string().trim().min(1).max(200),
        mimeType: z
          .string()
          .max(120)
          .regex(/^[\w.+-]+\/[\w.+-]+$/),
        dataBase64: z.string().max(7_000_000),
      })
      .parse(req.body);
    const body = Buffer.from(input.dataBase64, 'base64');
    if (body.length > 5 * 1024 * 1024) throw new HttpError(413, 'Arquivo acima de 5 MB.');
    const key = `projects/${project.id}/${randomUUID()}/${safeFileName(input.name)}`;
    await deps.storage.put(key, body, input.mimeType);
    const [art] = await deps.db
      .insert(artifacts)
      .values({
        projectId: project.id,
        kind: 'document',
        name: input.name,
        createdBy: req.user!.id,
      })
      .returning();
    await deps.db.insert(artifactVersions).values({
      artifactId: art!.id,
      version: 1,
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: body.length,
      authorUserId: req.user!.id,
    });
    await audit(deps.db, {
      workspaceId: project.workspaceId,
      userId: req.user!.id,
      action: 'artifact.upload',
      resourceType: 'artifact',
      resourceId: art!.id,
      metadata: { size: body.length },
      ip: req.ip,
    });
    await emitEvent(deps.orch, {
      type: 'artifact.created',
      projectId: project.id,
      demo: false,
      summary: `Documento anexado: ${art!.name}`,
      payload: { artifactId: art!.id },
    });
    return reply.status(201).send(art);
  });

  app.get('/artifacts/:id', async (req) => {
    const { artifact } = await loadArtifact(deps, req, idParams(req.params));
    const versions = await deps.db.query.artifactVersions.findMany({
      where: eq(artifactVersions.artifactId, artifact.id),
      orderBy: desc(artifactVersions.version),
    });
    return { artifact, versions };
  });

  app.post('/artifacts/:id/versions', async (req, reply) => {
    const { artifact, project } = await loadArtifact(deps, req, idParams(req.params));
    if (artifact.kind === 'document' || artifact.kind === 'external_ref')
      throw new HttpError(409, 'Este tipo de artefato não aceita novas versões em texto.');
    const input = newArtifactVersionSchema.parse(req.body);
    // Atomic version bump: concurrent editors never overwrite each other.
    const version = await deps.db.transaction(async (tx) => {
      const [a] = await tx
        .update(artifacts)
        .set({ currentVersion: sql`${artifacts.currentVersion} + 1` })
        .where(eq(artifacts.id, artifact.id))
        .returning();
      await tx.insert(artifactVersions).values({
        artifactId: artifact.id,
        version: a!.currentVersion,
        content: input.content,
        mimeType: MIME[artifact.kind] ?? null,
        sizeBytes: Buffer.byteLength(input.content),
        authorUserId: req.user!.id,
        note: input.note ?? null,
      });
      return a!.currentVersion;
    });
    await emitEvent(deps.orch, {
      type: 'artifact.created',
      projectId: project.id,
      demo: false,
      summary: `Nova versão v${version} de "${artifact.name}"`,
      payload: { artifactId: artifact.id, version },
    });
    return reply.status(201).send({ version });
  });

  app.get('/artifacts/:id/versions/:version/download', async (req, reply) => {
    const { artifact } = await loadArtifact(deps, req, idParams(req.params));
    const v = Number((req.params as { version: string }).version);
    const row = await deps.db.query.artifactVersions.findFirst({
      where: and(eq(artifactVersions.artifactId, artifact.id), eq(artifactVersions.version, v)),
    });
    if (!row) throw new HttpError(404, 'Versão não encontrada.');
    const base = safeFileName(artifact.name.replace(/\.[a-z]+$/i, ''));
    if (row.storageKey) {
      if (!deps.storage) throw new HttpError(503, 'Armazenamento não configurado.');
      const obj = await deps.storage.get(row.storageKey);
      return reply
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', `attachment; filename="${safeFileName(artifact.name)}"`)
        .header('x-content-type-options', 'nosniff')
        .send(obj.body);
    }
    // Always served as an attachment with a text type — never rendered as HTML.
    return reply
      .header('content-type', MIME[artifact.kind] ?? 'text/plain; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${base}-v${v}${EXT[artifact.kind] ?? '.txt'}"`,
      )
      .header('x-content-type-options', 'nosniff')
      .send(row.content ?? '');
  });
}
