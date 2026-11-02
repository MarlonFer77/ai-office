'use client';
import { Plus } from 'lucide-react';
import { Button, cn } from '@ai-office/ui';
import { ROLE_LABELS } from '@/lib/format';
import { useLive, useUi } from '@/lib/store';
import type { Agent } from '@/lib/types';
import { RobotAvatar } from '../robot-avatar';
import { AgentStatusBadge, ProviderBadge } from '../status';

export function TeamBar({ agents, onAddAgent }: { agents: Agent[]; onAddAgent: () => void }) {
  const visuals = useLive((s) => s.scene.agents);
  const { selectedAgentId, selectAgent } = useUi();
  return (
    <div className="glass border-t border-border/70" role="region" aria-label="Equipe do projeto">
      <div className="flex items-stretch gap-2 overflow-x-auto p-2.5 scrollbar-thin">
        {agents.map((a) => {
          const status = visuals[a.id]?.status ?? a.status;
          return (
            <button
              key={a.id}
              onClick={() => selectAgent(a.id)}
              aria-pressed={selectedAgentId === a.id}
              aria-label={`Abrir ${a.name}`}
              className={cn(
                'flex min-w-[210px] items-center gap-2.5 rounded-xl border border-border/80 bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedAgentId === a.id && 'border-primary/70 bg-primary/10',
              )}
            >
              <RobotAvatar seed={a.avatarSeed} status={status} size={38} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{a.name}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {ROLE_LABELS[a.role]} · <ProviderBadge provider={a.provider} model={a.provider === 'demo' ? undefined : a.model} />
                </span>
                <AgentStatusBadge status={status} />
              </span>
            </button>
          );
        })}
        <Button variant="outline" className="h-auto min-w-[140px] flex-col gap-1 border-dashed py-3" onClick={onAddAgent}>
          <Plus /> <span className="text-xs">Adicionar agente</span>
        </Button>
      </div>
    </div>
  );
}
