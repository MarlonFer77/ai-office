'use client';
import { useMemo, useState } from 'react';
import { Plus, Rocket } from 'lucide-react';
import { ROOM_BLUEPRINTS } from '@ai-office/shared';
import { Badge, Button, Dialog, EmptyState, SheetContent } from '@ai-office/ui';
import { MISSION_STATUS_LABELS, ROLE_LABELS, timeAgo, usd } from '@/lib/format';
import { useArtifacts, useHandoffs } from '@/lib/queries';
import { useLive, useUi } from '@/lib/store';
import type { OfficeSnapshot } from '@/lib/types';
import { EventItem } from '../event-item';
import { RobotAvatar } from '../robot-avatar';
import { AgentStatusBadge, ProviderBadge, TaskStatusBadge } from '../status';
import { AgentFormDialog } from './agent-form-dialog';
import { ApprovalCard } from './approval-card';

export function RoomPanel({ office }: { office: OfficeSnapshot }) {
  const { selectedRoomId, selectRoom } = useUi();
  const room = office.rooms.find((r) => r.id === selectedRoomId);
  return (
    <Dialog open={!!room} onOpenChange={(v) => !v && selectRoom(null)}>
      {room && (
        <SheetContent title={room.name}>
          <RoomBody office={office} roomId={room.id} />
        </SheetContent>
      )}
    </Dialog>
  );
}

function RoomBody({ office, roomId }: { office: OfficeSnapshot; roomId: string }) {
  const room = office.rooms.find((r) => r.id === roomId)!;
  const blueprint = ROOM_BLUEPRINTS.find((b) => b.kind === room.kind);
  const { selectAgent, setMissionDialogOpen } = useUi();
  const visuals = useLive((s) => s.scene.agents);
  const feed = useLive((s) => s.feed);
  const [adding, setAdding] = useState(false);
  const isDirector = room.kind === 'director';
  const isMeeting = room.kind === 'meeting';
  const agents = isDirector ? office.agents : office.agents.filter((a) => a.roomId === room.id);
  const ids = new Set(agents.map((a) => a.id));
  const tasks = office.tasks.filter((t) => t.assignedAgentId && ids.has(t.assignedAgentId));
  const events = useMemo(() => feed.filter((e) => e.agentId && ids.has(e.agentId) && e.type !== 'agent.message.delta').slice(0, 25), [feed, agents]); // eslint-disable-line react-hooks/exhaustive-deps
  const arts = useArtifacts(office.project.id);
  const deliveries = (arts.data ?? []).filter((a) => a.agentId && ids.has(a.agentId)).slice(0, 10);
  const handoffs = useHandoffs(isMeeting ? office.project.id : null);
  const accent = room.theme.accent;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 p-5 pr-12" style={{ background: `linear-gradient(135deg, ${accent}22, transparent 60%)` }}>
        <Badge variant="outline" style={{ borderColor: `${accent}66`, color: accent }}>{room.category}</Badge>
        <h2 className="mt-2 text-xl font-semibold">{room.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{blueprint?.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!isDirector && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus /> Adicionar agente aqui</Button>}
          {(isDirector || room.kind === 'strategy') && <Button size="sm" onClick={() => setMissionDialogOpen(true)}><Rocket /> Definir missão</Button>}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 scrollbar-thin">
        {isDirector && (
          <section className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Progresso', `${office.progress.percent}%`],
                ['Tarefas', `${office.progress.completed}/${office.progress.total}`],
                ['Custo', office.project.mode === 'demo' ? 'US$ 0' : usd(office.usage.costUsd)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border/70 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {office.missions[0] && (
              <p className="text-sm text-muted-foreground">Missão atual: <span className="text-foreground">{office.missions[0].title}</span> — {MISSION_STATUS_LABELS[office.missions[0].status]}</p>
            )}
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Aprovações pendentes</h3>
            {office.approvals.length ? office.approvals.map((a) => <ApprovalCard key={a.id} approval={a} />) : <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente.</p>}
          </section>
        )}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{isDirector ? 'Equipe completa' : 'Agentes nesta sala'}</h3>
          {agents.length === 0 ? (
            <EmptyState title="Sala vazia" description="Adicione um agente para ocupar esta sala." />
          ) : (
            <ul className="space-y-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <button onClick={() => selectAgent(a.id)} className="flex w-full items-center gap-3 rounded-xl border border-border/70 p-2.5 text-left hover:border-primary/50 hover:bg-accent/40">
                    <RobotAvatar seed={a.avatarSeed} status={visuals[a.id]?.status ?? a.status} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">{ROLE_LABELS[a.role]} <ProviderBadge provider={a.provider} model={a.provider === 'demo' ? undefined : a.model} /></span>
                    </span>
                    <AgentStatusBadge status={visuals[a.id]?.status ?? a.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {isMeeting && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Handoffs entre agentes</h3>
            {!handoffs.data?.length ? <p className="text-sm text-muted-foreground">Nenhum handoff ainda.</p> : (
              <ul className="space-y-2">
                {handoffs.data.slice(0, 15).map((h) => {
                  const from = office.agents.find((a) => a.id === h.fromAgentId);
                  const to = office.agents.find((a) => a.id === h.toAgentId);
                  return (
                    <li key={h.id} className="rounded-xl border border-border/70 p-3 text-sm">
                      <p><span className="font-medium">{from?.name ?? '—'}</span> → <span className="font-medium">{to?.name ?? '—'}</span></p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.instruction}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{h.status === 'consumed' ? 'processado' : 'entregue'} · {timeAgo(h.createdAt)} · {h.artifactIds.length} artefato(s)</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {!isMeeting && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tarefas</h3>
            {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p> : (
              <ul className="space-y-1.5">
                {tasks.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                    <span className="truncate">{t.title}</span>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Entregas</h3>
          {deliveries.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrega.</p> : (
            <ul className="space-y-1.5">
              {deliveries.map((a) => (
                <li key={a.id}>
                  <a href={`/library?artifact=${a.id}`} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-accent/40">
                    <span className="truncate">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground">v{a.currentVersion}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Conversas e eventos recentes</h3>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos nesta sessão.</p> : <ul>{events.map((e) => <EventItem key={e.id} event={e} compact />)}</ul>}
        </section>
      </div>
      <AgentFormDialog open={adding} onOpenChange={setAdding} projectId={office.project.id} defaultRoom={room.kind} />
    </div>
  );
}
