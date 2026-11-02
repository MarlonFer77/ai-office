'use client';
import { useState } from 'react';
import { Bot, MessageSquare, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { AgentFormDialog } from '@/components/panels/agent-form-dialog';
import { AgentPanel } from '@/components/panels/agent-panel';
import { RobotAvatar } from '@/components/robot-avatar';
import { AgentStatusBadge, ProviderBadge } from '@/components/status';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABELS, usd } from '@/lib/format';
import { useApiMutation, useOffice, useUsage } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { useCurrentProject } from '@/lib/use-project';
import type { Agent } from '@/lib/types';

export default function AgentsPage() {
  const { project } = useCurrentProject();
  const office = useOffice(project?.id ?? null);
  const usage = useUsage(project?.id ?? null);
  const selectAgent = useUi((s) => s.selectAgent);
  const [editing, setEditing] = useState<Agent | undefined>();
  const [open, setOpen] = useState(false);
  const archive = useApiMutation((id: string) => api(`/agents/${id}`, { method: 'DELETE' }), () => [['office', project?.id ?? '']]);

  return (
    <Page>
      <PageHeader title="Agentes" description="Instâncias independentes: cada uma com provedor, modelo, função, sessão e histórico próprios." actions={project && <Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus /> Adicionar agente</Button>} />
      {!office.data ? (
        <Skeleton className="h-64" />
      ) : office.data.agents.length === 0 ? (
        <EmptyState icon={<Bot />} title="Nenhum agente neste projeto" action={<Button onClick={() => setOpen(true)}>Adicionar agente</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {office.data.agents.map((a) => {
            const room = office.data!.rooms.find((r) => r.id === a.roomId);
            const cost = usage.data?.rows.filter((r) => r.agentId === a.id).reduce((n, r) => n + (r.costUsd ?? 0), 0) ?? 0;
            return (
              <Card key={a.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <RobotAvatar seed={a.avatarSeed} status={a.status} size={46} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{a.name}</h2>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[a.role]} · {room?.name ?? 'sem sala'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5"><ProviderBadge provider={a.provider} model={a.model} /><AgentStatusBadge status={a.status} /></div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted/40 p-2"><dt className="text-muted-foreground">Tarefas abertas</dt><dd className="mt-0.5 font-semibold">{a.openTasks ?? 0}</dd></div>
                  <div className="rounded-lg bg-muted/40 p-2"><dt className="text-muted-foreground">Custo</dt><dd className="mt-0.5 font-semibold">{a.provider === 'demo' ? 'US$ 0' : usd(cost)}</dd></div>
                  <div className="rounded-lg bg-muted/40 p-2"><dt className="text-muted-foreground">Permissões</dt><dd className="mt-0.5 font-semibold">{a.permissions.length}</dd></div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => selectAgent(a.id)}><MessageSquare /> Conversar</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(a); setOpen(true); }} aria-label={`Configurar ${a.name}`}><Settings2 /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remover ${a.name}`}
                    onClick={() => {
                      if (window.confirm(`Remover ${a.name} da equipe? O histórico é preservado.`))
                        archive.mutate(a.id, { onSuccess: () => toast.success('Agente removido'), onError: (e) => toast.error('Falha', errorMessage(e)) });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {project && <AgentFormDialog open={open} onOpenChange={setOpen} projectId={project.id} agent={editing} />}
      {project && <AgentPanel projectId={project.id} />}
    </Page>
  );
}
