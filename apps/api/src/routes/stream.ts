import type { FastifyInstance } from 'fastify';
import { events, orm } from '@ai-office/database';
import type { OfficeEvent } from '@ai-office/shared';
import { type AppDeps, loadProject } from '../app.js';
import { idParams } from './access.js';

const { and, eq, gt, asc } = orm;

/**
 * Server-Sent Events stream for a project.
 * - Resumes from `Last-Event-ID` (or ?since=) by replaying persisted events.
 * - Subscribes before replaying and buffers, so no event is lost in between.
 * - Drops any persisted event with id <= last sent id (no duplicates).
 * - Transient deltas carry no SSE id so they never move the resume cursor.
 */
export async function streamRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/projects/:id/events/stream', async (req, reply) => {
    const project = await loadProject(deps, req, idParams(req.params));
    const header = req.headers['last-event-id'];
    const since = Number((Array.isArray(header) ? header[0] : header) ?? (req.query as { since?: string }).since ?? 0) || 0;

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    let lastId = since;
    let replaying = true;
    const buffer: OfficeEvent[] = [];
    const write = (e: OfficeEvent) => {
      const numeric = /^\d+$/.test(e.id);
      if (numeric) {
        const n = Number(e.id);
        if (n <= lastId) return;
        lastId = n;
        res.write(`id: ${e.id}\nevent: office\ndata: ${JSON.stringify(e)}\n\n`);
      } else {
        res.write(`event: office\ndata: ${JSON.stringify(e)}\n\n`);
      }
    };
    const unsubscribe = deps.hub.subscribe(project.id, (e) => (replaying ? buffer.push(e) : write(e)));

    const rows = await deps.db.query.events.findMany({
      where: and(eq(events.projectId, project.id), gt(events.id, since)),
      orderBy: asc(events.id),
      limit: 500,
    });
    for (const r of rows) {
      write({ ...r, id: String(r.id), type: r.type as OfficeEvent['type'], createdAt: r.createdAt.toISOString() });
    }
    replaying = false;
    for (const e of buffer.splice(0)) write(e);
    res.write(`event: ready\ndata: ${JSON.stringify({ lastEventId: String(lastId) })}\n\n`);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
