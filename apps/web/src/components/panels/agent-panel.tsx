'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Pause, Play, Send, Settings2, Square } from 'lucide-react';
import { Badge, Button, cn, Dialog, EmptyState, SheetContent, Skeleton, Spinner, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@ai-office/ui';
import { api, errorMessage } from '@/lib/api';
import { dateTime, ROLE_LABELS, timeAgo, tokens, usd } from '@/lib/format';
import { useAgentDetail, useApiMutation, useArtifacts, useMessages, useRuns } from '@/lib/queries';
import { useLive, useUi } from '@/lib/store';
import type { Agent, Message } from '@/lib/types';
import { EventItem } from '../event-item';
import { Markdown } from '../markdown';
import { RobotAvatar } from '../robot-avatar';
import { AgentStatusBadge, DemoTag, ProviderBadge, TaskStatusBadge } from '../status';
import { toast } from '../toaster';
import { AgentFormDialog } from './agent-form-dialog';

export function AgentPanel({ projectId }: { projectId: string }) {
  const { selectedAgentId, selectAgent } = useUi();
  return (
    <Dialog open={!!selectedAgentId} onOpenChange={(v) => !v && selectAgent(null)}>
      {selectedAgentId && (
        <SheetContent title="Agente" aria-describedby={undefined}>
          <AgentPanelBody agentId={selectedAgentId} projectId={projectId} />
        </SheetContent>
      )}
    </Dialog>
  );
}

function AgentPanelBody({ agentId, projectId }: { agentId: string; projectId: string }) {
  const detail = useAgentDetail(agentId);
  const visual = useLive((s) => s.scene.agents[agentId]);
  const [editing, setEditing] = useState(false);
  const agent = detail.data?.agent;
  const status = visual?.status ?? agent?.status ?? 'idle';
  const runs = useRuns(agentId);
  const activeRun = runs.data?.find((r) => r.status === 'running' || r.status === 'queued');

  const pause = useApiMutation((paused: boolean) => api(`/agents/${agentId}`, { method: 'PATCH', json: { paused } }), () => [['agent', agentId], ['office', projectId]]);
  const cancel = useApiMutation((runId: string) => api(`/runs/${runId}/cancel`, { method: 'POST', json: {} }), () => [['runs', agentId], ['agent', agentId], ['messages', agentId]]);

  if (!agent) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 p-5 pr-12">
        <div className="flex items-start gap-3">
          <RobotAvatar seed={agent.avatarSeed} status={status} size={52} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="truncate text-lg font-semibold leading-tight">{agent.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{ROLE_LABELS[agent.role]}</Badge>
              <ProviderBadge provider={agent.provider} model={agent.model} />
              <AgentStatusBadge status={status} />
            </div>
            {visual?.caption && <p className="text-xs text-primary-soft">{visual.caption}</p>}
            {agent.lastError && status === 'error' && <p className="text-xs text-destructive">Último erro: {agent.lastError}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeRun && (
            <Button size="sm" variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(activeRun.id, { onSuccess: () => toast.info('Interrupção solicitada'), onError: (e) => toast.error('Falha ao interromper', errorMessage(e)) })}>
              <Square /> Interromper
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={pause.isPending} onClick={() => pause.mutate(!agent.paused)}>
            {agent.paused ? <><Play /> Retomar</> : <><Pause /> Pausar</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Settings2 /> Configurar
          </Button>
        </div>
      </header>
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="chat" className="flex-1">Conversa</TabsTrigger>
            <TabsTrigger value="tasks" className="flex-1">Tarefas</TabsTrigger>
            <TabsTrigger value="actions" className="flex-1">Ações</TabsTrigger>
            <TabsTrigger value="files" className="flex-1">Arquivos</TabsTrigger>
            <TabsTrigger value="usage" className="flex-1">Consumo</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <Chat agent={agent} />
        </TabsContent>
        <TabsContent value="tasks" className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin data-[state=inactive]:hidden">
          {detail.data!.tasks.length === 0 ? (
            <EmptyState title="Nenhuma tarefa atribuída" description="Tarefas chegam quando uma missão aprovada atribui trabalho a este agente." />
          ) : (
            <ul className="space-y-2">
              {detail.data!.tasks.map((t) => (
                <li key={t.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.title}</p>
                    <TaskStatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.instruction}</p>
                  {t.error && <p className="mt-1 text-xs text-destructive">{t.error}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">Tentativas: {t.attempts}/{t.maxAttempts}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="actions" className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin data-[state=inactive]:hidden">
          <Actions agentId={agentId} />
        </TabsContent>
        <TabsContent value="files" className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin data-[state=inactive]:hidden">
          <AgentFiles projectId={projectId} agentId={agentId} />
        </TabsContent>
        <TabsContent value="usage" className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin data-[state=inactive]:hidden">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Execuções', String(detail.data!.usage.runs)],
              ['Custo', agent.provider === 'demo' ? 'US$ 0 (demo)' : usd(detail.data!.usage.costUsd)],
              ['Tokens de entrada', tokens(detail.data!.usage.inputTokens)],
              ['Tokens de saída', tokens(detail.data!.usage.outputTokens)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border/70 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Limite do agente: {agent.budgetLimitUsd == null ? 'sem limite' : usd(agent.budgetLimitUsd)}. Custos usam a tabela de preços configurada; modelos sem preço aparecem como “custo desconhecido”.</p>
        </TabsContent>
      </Tabs>
      <AgentFormDialog open={editing} onOpenChange={setEditing} projectId={projectId} agent={agent} />
    </div>
  );
}

function Chat({ agent }: { agent: Agent }) {
  const msgs = useMessages(agent.id);
  const streamingAll = useLive((s) => s.streaming);
  const streaming = useMemo(() => Object.entries(streamingAll).filter(([, v]) => v.agentId === agent.id), [streamingAll, agent.id]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const send = useApiMutation((content: string) => api<{ busy: boolean; paused: boolean }>(`/agents/${agent.id}/messages`, { method: 'POST', json: { content } }), () => [['messages', agent.id], ['runs', agent.id]]);
  const pending = msgs.data?.pending ?? [];
  const streamKey = streaming.map(([, v]) => v.text.length).join();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.data?.messages.length, pending.length, streamKey]);

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    send.mutate(content, {
      onSuccess: (r) => {
        setText('');
        if (r.paused) toast.info('Agente pausado', 'A mensagem ficará na fila até você retomar o agente.');
        else if (r.busy) toast.info('Agente ocupado', 'A mensagem será processada assim que a execução atual terminar.');
      },
      onError: (e) => toast.error('Não foi possível enviar', errorMessage(e)),
    });
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 scrollbar-thin" aria-live="polite">
        {msgs.isLoading && <Skeleton className="h-24 w-full" />}
        {msgs.data && msgs.data.messages.length === 0 && pending.length === 0 && streaming.length === 0 && (
          <EmptyState title={`Comece uma conversa com ${agent.name}`} description="O histórico deste agente é independente dos demais e continua de onde parou." />
        )}
        {msgs.data?.messages.map((m) => <ChatMessage key={m.id} message={m} agent={agent} />)}
        {pending.map((p) => (
          <div key={p.runId} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm opacity-70">
            {p.content}
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Spinner className="size-2.5" /> na fila</p>
          </div>
        ))}
        {streaming.map(([runId, s]) => (
          <div key={runId} className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5">
            <Markdown>{s.text}</Markdown>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-primary-soft"><Spinner className="size-2.5" /> transmitindo{s.demo && <> · <DemoTag /></>}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="border-t border-border/70 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={20000}
            placeholder={`Mensagem para ${agent.name}… (Enter envia, Shift+Enter quebra linha)`}
            className="max-h-40 min-h-11 resize-none"
            aria-label={`Mensagem para ${agent.name}`}
          />
          <Button type="submit" size="icon" disabled={send.isPending || !text.trim()} aria-label="Enviar mensagem">
            {send.isPending ? <Spinner /> : <Send />}
          </Button>
        </div>
      </form>
    </>
  );
}

function ChatMessage({ message: m, agent }: { message: Message; agent: Agent }) {
  const [open, setOpen] = useState(false);
  if (m.role === 'user' && m.source === 'orchestrator') {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-2">
        <button className="flex w-full items-center justify-between text-left text-xs text-muted-foreground" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span>📋 Briefing do orquestrador {m.taskId ? '(tarefa)' : '(planejamento)'} · {timeAgo(m.createdAt)}</span>
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {open && <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">{m.content}</pre>}
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary/90 px-3.5 py-2 text-sm text-white">
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        <p className="mt-1 text-right text-[10px] text-white/70">{timeAgo(m.createdAt)}</p>
      </div>
    );
  }
  return (
    <div className="flex max-w-[92%] gap-2">
      <RobotAvatar seed={agent.avatarSeed} size={26} className="mt-1" />
      <div className="min-w-0 rounded-2xl rounded-tl-md border border-border bg-card px-3.5 py-2.5">
        <Markdown>{m.content}</Markdown>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {timeAgo(m.createdAt)}
          {m.demo && <DemoTag />}
        </p>
      </div>
    </div>
  );
}

function Actions({ agentId }: { agentId: string }) {
  const runs = useRuns(agentId);
  const feed = useLive((s) => s.feed);
  const events = useMemo(() => feed.filter((e) => e.agentId === agentId && e.type !== 'agent.message.delta').slice(0, 40), [feed, agentId]);
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Execuções</h3>
        {!runs.data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {runs.data.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="font-medium">{r.kind === 'chat' ? 'Conversa' : r.kind === 'task' ? 'Tarefa' : 'Planejamento'}</span>
                  <span className="ml-2 text-muted-foreground">{dateTime(r.createdAt)}</span>
                  {r.error && <span className="block truncate text-destructive">{r.error}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.inputTokens != null && <span className="tabular-nums text-muted-foreground">{tokens(r.inputTokens)}→{tokens(r.outputTokens ?? 0)}</span>}
                  <Badge variant={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'destructive' : r.status === 'running' ? 'default' : 'outline'}>{r.status}</Badge>
                  {r.demo && <DemoTag />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Eventos observáveis (sessão atual da página)</h3>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos recentes.</p> : <ul>{events.map((e) => <EventItem key={e.id} event={e} compact />)}</ul>}
      </section>
    </div>
  );
}

function AgentFiles({ projectId, agentId }: { projectId: string; agentId: string }) {
  const arts = useArtifacts(projectId);
  const mine = (arts.data ?? []).filter((a) => a.agentId === agentId);
  if (!mine.length) return <EmptyState icon={<FileText />} title="Nenhuma entrega deste agente" />;
  return (
    <ul className="space-y-2">
      {mine.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm">{a.name}</span>
            <span className="text-[11px] text-muted-foreground">v{a.currentVersion} · {timeAgo(a.updatedAt)}</span>
          </span>
          <a className="text-xs text-primary-soft hover:underline" href={`/library?artifact=${a.id}`}>Abrir</a>
        </li>
      ))}
    </ul>
  );
}
