'use client';
import { useEffect, useState } from 'react';
import { ArrowRightLeft, ListChecks, RotateCcw, Rocket, XCircle } from 'lucide-react';
import { Badge, Button, Card, cn, EmptyState, Progress, Skeleton } from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { MissionDialog } from '@/components/panels/mission-dialog';
import { ApprovalCard } from '@/components/panels/approval-card';
import { TaskStatusBadge } from '@/components/status';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { MISSION_STATUS_LABELS, ROLE_LABELS, timeAgo } from '@/lib/format';
import { useApiMutation, useMission, useMissions, useOffice } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { useCurrentProject } from '@/lib/use-project';

export default function TasksPage() {
  const { project } = useCurrentProject();
  const pid = project?.id ?? null;
  const missions = useMissions(pid);
  const office = useOffice(pid);
  const [selected, setSelected] = useState<string | null>(null);
  const setMissionDialogOpen = useUi((s) => s.setMissionDialogOpen);
  useEffect(() => {
    if (!selected && missions.data?.[0]) setSelected(missions.data[0].id);
  }, [missions.data, selected]);

  return (
    <Page>
      <PageHeader
        title="Tarefas e missões"
        description="Planos, dependências, estados e handoffs — tudo derivado da execução real."
        actions={
          <Button onClick={() => setMissionDialogOpen(true)}>
            <Rocket /> Nova missão
          </Button>
        }
      />
      {missions.isLoading ? (
        <Skeleton className="h-64" />
      ) : !missions.data?.length ? (
        <EmptyState
          icon={<ListChecks />}
          title="Nenhuma missão ainda"
          description="Defina uma missão: o planejador cria tarefas estruturadas que você revisa antes da execução."
          action={<Button onClick={() => setMissionDialogOpen(true)}>Definir missão</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <ul className="space-y-2" aria-label="Missões">
            {missions.data.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setSelected(m.id)}
                  aria-current={selected === m.id}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-colors hover:border-primary/40',
                    selected === m.id ? 'border-primary/60 bg-primary/10' : 'border-border/70',
                  )}
                >
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {MISSION_STATUS_LABELS[m.status]} · {timeAgo(m.createdAt)}
                  </p>
                  <Progress value={m.progress?.percent ?? 0} className="mt-2" />
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <MissionDetail
              id={selected}
              agentsById={new Map((office.data?.agents ?? []).map((a) => [a.id, a.name]))}
            />
          )}
        </div>
      )}
      {pid && <MissionDialog projectId={pid} demo={project?.mode === 'demo'} />}
    </Page>
  );
}

function MissionDetail({ id, agentsById }: { id: string; agentsById: Map<string, string> }) {
  const m = useMission(id);
  const retry = useApiMutation(
    (taskId: string) => api(`/tasks/${taskId}/retry`, { method: 'POST', json: {} }),
    () => [['mission', id]],
  );
  const cancel = useApiMutation(
    () => api(`/missions/${id}/cancel`, { method: 'POST', json: {} }),
    () => [['mission', id], ['missions']],
  );
  if (!m.data) return <Skeleton className="h-96" />;
  const { mission, tasks, handoffs, approvals, progress } = m.data;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const active = !['completed', 'cancelled', 'failed'].includes(mission.status);
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{mission.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{mission.goal}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                mission.status === 'completed'
                  ? 'success'
                  : mission.status === 'failed'
                    ? 'destructive'
                    : 'default'
              }
            >
              {MISSION_STATUS_LABELS[mission.status]}
            </Badge>
            {active && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.confirm(
                    'Cancelar esta missão? Execuções em andamento serão interrompidas.',
                  ) && cancel.mutate(undefined, { onSuccess: () => toast.info('Missão cancelada') })
                }
              >
                <XCircle /> Cancelar
              </Button>
            )}
          </div>
        </div>
        {mission.planSummary && (
          <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{mission.planSummary}</p>
        )}
        {mission.error && <p className="mt-3 text-sm text-destructive">{mission.error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Progress value={progress.percent} label="Progresso da missão" />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progress.completed}/{progress.total} concluídas
          </span>
        </div>
      </Card>
      {approvals
        .filter((a) => a.status === 'pending')
        .map((a) => (
          <ApprovalCard key={a.id} approval={a} expanded />
        ))}
      <section aria-label="Tarefas">
        <h3 className="mb-2 text-sm font-semibold">Tarefas</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O planejador ainda está criando as tarefas…
          </p>
        ) : (
          <ol className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-border/70 bg-card/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title}{' '}
                      <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                        #{t.key}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ROLE_LABELS[t.role]} ·{' '}
                      {t.assignedAgentId
                        ? (agentsById.get(t.assignedAgentId) ?? 'agente removido')
                        : 'sem agente'}{' '}
                      · prioridade {t.priority}
                      {t.requiresApproval && ' · exige aprovação'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TaskStatusBadge status={t.status} />
                    {t.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          retry.mutate(t.id, {
                            onSuccess: () => toast.success('Tarefa reenfileirada'),
                            onError: (e) => toast.error('Falha', errorMessage(e)),
                          })
                        }
                      >
                        <RotateCcw /> Reexecutar
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t.instruction}</p>
                {!!t.dependsOn?.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Depende de: {t.dependsOn.map((d) => byId.get(d)?.title ?? d).join(', ')}
                  </p>
                )}
                {t.error && <p className="mt-2 text-xs text-destructive">{t.error}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Tentativas {t.attempts}/{t.maxAttempts}
                  {t.completedAt && ` · concluída ${timeAgo(t.completedAt)}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      {handoffs.length > 0 && (
        <section aria-label="Handoffs">
          <h3 className="mb-2 text-sm font-semibold">Handoffs</h3>
          <ul className="space-y-2">
            {handoffs.map((h) => (
              <li
                key={h.id}
                className="flex items-start gap-3 rounded-xl border border-border/70 p-3 text-sm"
              >
                <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-primary-soft" />
                <div className="min-w-0">
                  <p>
                    <b>{agentsById.get(h.fromAgentId ?? '') ?? '—'}</b> →{' '}
                    <b>{agentsById.get(h.toAgentId ?? '') ?? '—'}</b>{' '}
                    <span className="text-xs text-muted-foreground">
                      ({h.status === 'consumed' ? 'processado' : 'entregue'})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Origem: {byId.get(h.sourceTaskId ?? '')?.title} · Destino:{' '}
                    {byId.get(h.targetTaskId ?? '')?.title} · {h.artifactIds.length} artefato(s)
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
