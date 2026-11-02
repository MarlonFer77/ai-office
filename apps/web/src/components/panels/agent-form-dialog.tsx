'use client';
import { useEffect, useState } from 'react';
import { AGENT_PERMISSIONS, AGENT_ROLES, type AgentPermission, type AgentRole, DEFAULT_AGENT_PERMISSIONS, ROOM_KINDS, ROLE_ROOM, type RoomKind } from '@ai-office/shared';
import { Button, Dialog, DialogContent, Input, Label, NativeSelect, Spinner, Switch, Textarea } from '@ai-office/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/format';
import { useApiMutation, useProviders } from '@/lib/queries';
import type { Agent } from '@/lib/types';
import { toast } from '../toaster';

const ROOM_LABELS: Record<RoomKind, string> = {
  strategy: 'Sala de Estratégia',
  research: 'Sala de Pesquisa',
  production: 'Sala de Produção',
  creative: 'Sala de Criação',
  review: 'Sala de Revisão',
  meeting: 'Sala de Reuniões',
  director: 'Sala do Diretor',
};
const PERMISSION_LABELS: Record<AgentPermission, { label: string; hint: string; sensitive: boolean }> = {
  read_project_artifacts: { label: 'Ler entregas do projeto', hint: 'Ferramentas list/read de artefatos deste projeto.', sensitive: false },
  create_artifacts: { label: 'Criar entregas', hint: 'Registrar resultados como artefatos.', sensitive: false },
  handoff: { label: 'Participar de handoffs', hint: 'Receber e enviar entregas a outros agentes.', sensitive: false },
  external_network: { label: 'Acesso à internet', hint: 'Reservado — não implementado nesta versão.', sensitive: true },
  execute_code: { label: 'Executar código', hint: 'Exige sandbox isolado — não disponível nesta versão.', sensitive: true },
  publish_external: { label: 'Publicar externamente', hint: 'Exige aprovação — não disponível nesta versão.', sensitive: true },
};

export function AgentFormDialog({ open, onOpenChange, projectId, agent, defaultRoom }: { open: boolean; onOpenChange: (v: boolean) => void; projectId: string; agent?: Agent; defaultRoom?: RoomKind }) {
  const providers = useProviders();
  const [name, setName] = useState('');
  const [role, setRole] = useState<AgentRole>('researcher');
  const [roomKind, setRoomKind] = useState<RoomKind>('research');
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'demo'>('demo');
  const [model, setModel] = useState('demo-sim-1');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [budget, setBudget] = useState('');
  const [maxTokens, setMaxTokens] = useState('4000');
  const [permissions, setPermissions] = useState<AgentPermission[]>(DEFAULT_AGENT_PERMISSIONS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setProvider(agent.provider);
      setModel(agent.model);
      setSystemPrompt(agent.systemPrompt);
      setBudget(agent.budgetLimitUsd == null ? '' : String(agent.budgetLimitUsd));
      setMaxTokens(String(agent.maxOutputTokens));
      setPermissions(agent.permissions as AgentPermission[]);
      setRoomKind(ROLE_ROOM[agent.role]);
    } else {
      setName('');
      setRole('researcher');
      setRoomKind(defaultRoom && defaultRoom !== 'director' ? defaultRoom : 'research');
      setProvider('demo');
      setModel('demo-sim-1');
      setSystemPrompt('');
      setBudget('');
      setMaxTokens('4000');
      setPermissions(DEFAULT_AGENT_PERMISSIONS);
    }
  }, [open, agent, defaultRoom]);

  const cfg = providers.data?.find((p) => p.provider === provider);
  const models = provider === 'demo' ? ['demo-sim-1'] : [...new Set([...(cfg?.availableModels ?? []), ...(cfg?.suggestedModels ?? [])])];
  const onProvider = (p: typeof provider) => {
    setProvider(p);
    const c = providers.data?.find((x) => x.provider === p);
    setModel(p === 'demo' ? 'demo-sim-1' : (c?.defaultModel ?? c?.suggestedModels[0] ?? c?.availableModels[0] ?? ''));
  };

  const save = useApiMutation(
    (body: Record<string, unknown>) => (agent ? api(`/agents/${agent.id}`, { method: 'PATCH', json: body }) : api(`/projects/${projectId}/agents`, { method: 'POST', json: body })),
    () => [['office', projectId], ['agents', projectId], ['agent']],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      name,
      role,
      roomKind,
      provider,
      model,
      systemPrompt,
      permissions,
      budgetLimitUsd: budget === '' ? null : Number(budget),
      maxOutputTokens: Number(maxTokens) || 4000,
    };
    save.mutate(body, {
      onSuccess: () => {
        toast.success(agent ? 'Agente atualizado' : 'Agente contratado', name);
        onOpenChange(false);
      },
      onError: (err) => setError(err instanceof ApiError && err.issues?.length ? err.issues.map((i) => `${i.path}: ${i.message}`).join('; ') : errorMessage(err)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={agent ? `Configurar ${agent.name}` : 'Adicionar agente'} description="Cada agente é uma instância independente, com sessão e histórico próprios." className="max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ag-name">Nome</Label>
              <Input id="ag-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Claude Pesquisador" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-role">Função</Label>
              <NativeSelect id="ag-role" value={role} onChange={(e) => { const r = e.target.value as AgentRole; setRole(r); setRoomKind(ROLE_ROOM[r]); }}>
                {AGENT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-room">Sala</Label>
              <NativeSelect id="ag-room" value={roomKind} onChange={(e) => setRoomKind(e.target.value as RoomKind)}>
                {ROOM_KINDS.filter((k) => k !== 'director').map((k) => <option key={k} value={k}>{ROOM_LABELS[k]}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-provider">Provedor</Label>
              <NativeSelect id="ag-provider" value={provider} onChange={(e) => onProvider(e.target.value as typeof provider)}>
                <option value="demo">Demonstração (simulado)</option>
                <option value="anthropic" disabled={!providers.data?.find((p) => p.provider === 'anthropic')?.configured}>Anthropic {providers.data?.find((p) => p.provider === 'anthropic')?.configured ? '' : '(configure em Configurações)'}</option>
                <option value="openai" disabled={!providers.data?.find((p) => p.provider === 'openai')?.configured}>OpenAI {providers.data?.find((p) => p.provider === 'openai')?.configured ? '' : '(configure em Configurações)'}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-model">Modelo</Label>
              <Input id="ag-model" list="ag-models" required value={model} onChange={(e) => setModel(e.target.value)} disabled={provider === 'demo'} className="font-mono text-xs" />
              <datalist id="ag-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-prompt">Instruções de sistema (opcional)</Label>
            <Textarea id="ag-prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} maxLength={20000} placeholder="Tom, especialidade, formato de resposta…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ag-budget">Limite de gasto (US$, opcional)</Label>
              <Input id="ag-budget" type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Sem limite" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ag-max">Máx. tokens de saída</Label>
              <Input id="ag-max" type="number" min={256} max={64000} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Permissões</legend>
            {AGENT_PERMISSIONS.map((p) => {
              const meta = PERMISSION_LABELS[p];
              return (
                <label key={p} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <span>
                    <span className="block text-sm">{meta.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
                  </span>
                  <Switch
                    checked={permissions.includes(p)}
                    disabled={meta.sensitive}
                    onCheckedChange={(v) => setPermissions((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))}
                    aria-label={meta.label}
                  />
                </label>
              );
            })}
          </fieldset>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Spinner />} {agent ? 'Salvar' : 'Adicionar agente'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
