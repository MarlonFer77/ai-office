'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Rocket, Sparkles } from 'lucide-react';
import { Badge, Button, cn, EmptyState, Skeleton, Tooltip } from '@ai-office/ui';
import { MISSION_STATUS_LABELS, ROLE_LABELS } from '@/lib/format';
import { useEventHistory, useOffice } from '@/lib/queries';
import { useProjectStream } from '@/lib/sse';
import { useLive, useUi } from '@/lib/store';
import { useCurrentProject } from '@/lib/use-project';
import type { OfficeSnapshot } from '@/lib/types';
import { ActivityFeed } from '../panels/activity-feed';
import { AgentFormDialog } from '../panels/agent-form-dialog';
import { AgentPanel } from '../panels/agent-panel';
import { MissionDialog } from '../panels/mission-dialog';
import { RoomPanel } from '../panels/room-panel';
import { TeamBar } from '../panels/team-bar';
import { RobotAvatar } from '../robot-avatar';
import { AgentStatusBadge } from '../status';
import type { CameraControls } from './office-canvas';

const OfficeCanvas = dynamic(() => import('./office-canvas'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Montando o escritório…</div>,
});

export function OfficeView() {
  const { project, isEmpty, isLoading } = useCurrentProject();
  const pid = project?.id ?? null;
  const office = useOffice(pid);
  const history = useEventHistory(pid);
  const reset = useLive((s) => s.reset);
  const syncAgents = useLive((s) => s.syncAgents);
  const liveProject = useLive((s) => s.projectId);
  const [startAfter, setStartAfter] = useState<string | null>(null);

  // (Re)initialise live state when the project changes.
  useEffect(() => {
    if (!pid || !office.data || !history.data || office.data.project.id !== pid) return;
    if (liveProject !== pid) {
      reset(pid, office.data.agents, history.data);
      setStartAfter(history.data[0]?.id ?? '0');
    }
  }, [pid, office.data, history.data, liveProject, reset]);
  useEffect(() => {
    if (office.data && liveProject === office.data.project.id) syncAgents(office.data.agents);
  }, [office.data, liveProject, syncAgents]);
  useEffect(() => setStartAfter(null), [pid]);

  useProjectStream(liveProject === pid ? pid : null, startAfter);

  if (isLoading || (pid && !office.data)) return <OfficeSkeleton />;
  if (isEmpty || !pid) {
    return (
      <div className="p-6">
        <EmptyState
          className="mx-auto mt-10 max-w-xl"
          icon={<Sparkles />}
          title="Seu escritório ainda está vazio"
          description="Crie um projeto para montar sua equipe de agentes. Você pode começar no modo demonstração, sem nenhuma chave de API."
          action={<Button asChild><Link href="/projects/new">Criar primeiro projeto</Link></Button>}
        />
      </div>
    );
  }
  return <OfficeLayout office={office.data!} />;
}

function OfficeLayout({ office }: { office: OfficeSnapshot }) {
  const { viewMode, selectedAgentId, selectedRoomId, selectAgent, selectRoom, setMissionDialogOpen } = useUi();
  const controls = useRef<CameraControls | null>(null);
  const [addingAgent, setAddingAgent] = useState(false);
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setIsSmall(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mode = isSmall ? 'list' : viewMode;
  const activeMission = office.missions.find((m) => !['completed', 'cancelled', 'failed'].includes(m.status));
  const sortedRooms = useMemo(() => [...office.rooms].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX), [office.rooms]);

  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-rows-[1fr_auto] lg:grid-cols-[1fr_360px]">
      <section className="relative min-h-0 overflow-hidden" aria-label="Escritório">
        {mode === 'office' ? (
          <>
            <OfficeCanvas
              rooms={office.rooms}
              agents={office.agents}
              selectedAgentId={selectedAgentId}
              selectedRoomId={selectedRoomId}
              onSelectAgent={selectAgent}
              onSelectRoom={selectRoom}
              controls={controls}
            />
            {/* Accessible alternatives to canvas interactions */}
            <nav className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5" aria-label="Salas do escritório">
              {sortedRooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectRoom(r.id)}
                  className={cn('glass rounded-full border border-border/80 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedRoomId === r.id && 'text-foreground')}
                  style={{ borderColor: selectedRoomId === r.id ? r.theme.accent : undefined }}
                >
                  <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: r.theme.accent }} />
                  {r.name.replace('Sala de ', '').replace('Sala do ', '')}
                </button>
              ))}
            </nav>
            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1" role="group" aria-label="Controles da câmera">
              <Tooltip content="Aproximar" side="left"><Button size="icon-sm" variant="secondary" onClick={() => controls.current?.zoomIn()} aria-label="Aproximar"><Plus /></Button></Tooltip>
              <Tooltip content="Afastar" side="left"><Button size="icon-sm" variant="secondary" onClick={() => controls.current?.zoomOut()} aria-label="Afastar"><Minus /></Button></Tooltip>
              <Tooltip content="Enquadrar escritório" side="left"><Button size="icon-sm" variant="secondary" onClick={() => controls.current?.fit()} aria-label="Enquadrar"><Maximize2 /></Button></Tooltip>
            </div>
          </>
        ) : (
          <OfficeList office={office} />
        )}
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-2">
          {office.project.mode === 'demo' && <Badge variant="demo" className="glass py-1">Demonstração · respostas simuladas</Badge>}
          {activeMission ? (
            <span className="glass rounded-full border border-border px-3 py-1 text-xs">
              <span className="text-muted-foreground">Missão:</span> {activeMission.title} · <span className="text-primary-soft">{MISSION_STATUS_LABELS[activeMission.status]}</span>
            </span>
          ) : (
            <Button size="sm" onClick={() => setMissionDialogOpen(true)} className="shadow-lg">
              <Rocket /> Definir missão
            </Button>
          )}
        </div>
      </section>
      <div className="row-span-2 hidden min-h-0 lg:block">
        <ActivityFeed agents={office.agents} approvals={office.approvals} />
      </div>
      <div className="min-w-0">
        <TeamBar agents={office.agents} onAddAgent={() => setAddingAgent(true)} />
      </div>
      <AgentPanel projectId={office.project.id} />
      <RoomPanel office={office} />
      <MissionDialog projectId={office.project.id} demo={office.project.mode === 'demo'} />
      <AgentFormDialog open={addingAgent} onOpenChange={setAddingAgent} projectId={office.project.id} />
    </div>
  );
}

/** Simplified view for small screens / list mode. Same actions as the canvas. */
function OfficeList({ office }: { office: OfficeSnapshot }) {
  const { selectAgent, selectRoom } = useUi();
  const visuals = useLive((s) => s.scene.agents);
  const feed = useLive((s) => s.feed);
  return (
    <div className="h-full overflow-y-auto p-3 pb-28 scrollbar-thin sm:p-5">
      {office.approvals.length > 0 && (
        <a href="/deliveries" className="mb-4 block rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {office.approvals.length} aprovação(ões) aguardando você →
        </a>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {office.rooms.map((r) => {
          const agents = r.kind === 'director' ? [] : office.agents.filter((a) => a.roomId === r.id);
          return (
            <div key={r.id} className="rounded-2xl border border-border/80 bg-card/60 p-4" style={{ boxShadow: `inset 0 1px 0 ${r.theme.accent}33` }}>
              <button onClick={() => selectRoom(r.id)} className="flex w-full items-center justify-between text-left">
                <span>
                  <span className="block text-sm font-semibold">{r.name}</span>
                  <span className="text-[11px] text-muted-foreground">{r.category}</span>
                </span>
                <span className="size-2.5 rounded-full" style={{ background: r.theme.accent }} />
              </button>
              <ul className="mt-3 space-y-1.5">
                {agents.length === 0 && <li className="text-xs text-muted-foreground">{r.kind === 'director' ? 'Aprovações, prioridades e desempenho.' : 'Sem agentes.'}</li>}
                {agents.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => selectAgent(a.id)} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-accent/50">
                      <RobotAvatar seed={a.avatarSeed} size={28} status={visuals[a.id]?.status ?? a.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{a.name}</span>
                        <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[a.role]}</span>
                      </span>
                      <AgentStatusBadge status={visuals[a.id]?.status ?? a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mt-5 lg:hidden">
        <h2 className="mb-2 text-sm font-semibold">Atividades recentes</h2>
        <ul className="space-y-1 text-sm">
          {feed.slice(0, 15).map((e) => (
            <li key={e.id} className="rounded-lg border border-border/60 px-3 py-2 text-[13px]">{e.summary}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OfficeSkeleton() {
  return (
    <div className="grid h-[calc(100dvh-3.5rem)] place-items-center p-6">
      <div className="w-full max-w-3xl space-y-3">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <div className="flex gap-2">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
    </div>
  );
}
