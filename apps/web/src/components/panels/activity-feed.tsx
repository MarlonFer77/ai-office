'use client';
import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { EmptyState, Tabs, TabsList, TabsTrigger } from '@ai-office/ui';
import { useLive, useUi } from '@/lib/store';
import type { Agent, Approval } from '@/lib/types';
import { EventItem } from '../event-item';
import { RobotAvatar } from '../robot-avatar';
import { ApprovalCard } from './approval-card';

type Filter = 'all' | 'done' | 'alerts';

export function ActivityFeed({ agents, approvals }: { agents: Agent[]; approvals: Approval[] }) {
  const feed = useLive((s) => s.feed);
  const visuals = useLive((s) => s.scene.agents);
  const selectAgent = useUi((s) => s.selectAgent);
  const [filter, setFilter] = useState<Filter>('all');
  const busy = agents.filter((a) => ['running', 'queued'].includes(visuals[a.id]?.status ?? a.status));
  const items = useMemo(() => {
    const visible = feed.filter((e) => e.type !== 'agent.message.delta');
    if (filter === 'done') return visible.filter((e) => ['task.completed', 'artifact.created', 'handoff.completed', 'mission.completed'].includes(e.type));
    if (filter === 'alerts') return visible.filter((e) => ['agent.error', 'task.failed', 'mission.failed', 'budget.warning', 'budget.exceeded', 'task.retrying'].includes(e.type));
    return visible;
  }, [feed, filter]);

  return (
    <aside className="glass flex h-full min-h-0 flex-col border-l border-border/70" aria-label="Atividades em tempo real">
      <div className="space-y-3 border-b border-border/70 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary-soft" /> Atividades</h2>
          <span className="text-[11px] text-muted-foreground">tempo real</span>
        </div>
        {busy.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Agentes ocupados</p>
            <div className="flex flex-wrap gap-1.5">
              {busy.map((a) => (
                <button key={a.id} onClick={() => selectAgent(a.id)} className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-2.5 text-xs hover:bg-primary/20">
                  <RobotAvatar seed={a.avatarSeed} size={20} />
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {approvals.length > 0 && (
          <section className="mb-4 space-y-2" aria-label="Solicitações de aprovação">
            <p className="px-1 text-[11px] uppercase tracking-wider text-warning">Aguardando você ({approvals.length})</p>
            {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
          </section>
        )}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-2">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">Tudo</TabsTrigger>
            <TabsTrigger value="done" className="flex-1">Concluídas</TabsTrigger>
            <TabsTrigger value="alerts" className="flex-1">Erros e avisos</TabsTrigger>
          </TabsList>
        </Tabs>
        {items.length === 0 ? (
          <EmptyState className="py-8" title="Sem atividades ainda" description="Defina uma missão ou converse com um agente — cada evento real aparece aqui." />
        ) : (
          <ul className="space-y-0.5" aria-live="polite" aria-relevant="additions">
            {items.slice(0, 120).map((e) => <EventItem key={e.id} event={e} />)}
          </ul>
        )}
      </div>
    </aside>
  );
}
