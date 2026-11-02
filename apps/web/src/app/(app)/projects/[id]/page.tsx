'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Save } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Skeleton,
  Spinner,
  Textarea,
} from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { usd } from '@/lib/format';
import { useApiMutation, useUsage } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '@/lib/types';

export default function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
  });
  const usage = useUsage(id);
  const [form, setForm] = useState({
    name: '',
    objective: '',
    description: '',
    mode: 'demo',
    budget: '',
  });
  useEffect(() => {
    if (project.data)
      setForm({
        name: project.data.name,
        objective: project.data.objective,
        description: project.data.description,
        mode: project.data.mode,
        budget: project.data.budgetLimitUsd == null ? '' : String(project.data.budgetLimitUsd),
      });
  }, [project.data]);
  const save = useApiMutation(
    (body: object) => api(`/projects/${id}`, { method: 'PATCH', json: body }),
    () => [
      ['project', id],
      ['projects', false],
      ['office', id],
    ],
  );
  const archive = useApiMutation(
    (archived: boolean) => api(`/projects/${id}/archive`, { method: 'POST', json: { archived } }),
    () => [
      ['project', id],
      ['projects', false],
      ['projects', true],
    ],
  );

  if (!project.data)
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    );
  const archived = !!project.data.archivedAt;
  return (
    <Page>
      <PageHeader
        title={project.data.name}
        description="Configurações do projeto"
        actions={
          <Button
            variant="outline"
            onClick={() =>
              archive.mutate(!archived, {
                onSuccess: () => {
                  toast.success(archived ? 'Projeto restaurado' : 'Projeto arquivado');
                  if (!archived) router.push('/projects');
                },
              })
            }
          >
            {archived ? (
              <>
                <ArchiveRestore /> Restaurar
              </>
            ) : (
              <>
                <Archive /> Arquivar
              </>
            )}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj">Objetivo</Label>
            <Textarea
              id="obj"
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição</Label>
            <Textarea
              id="desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mode">Modo</Label>
              <NativeSelect
                id="mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="demo">Demonstração (simulado)</option>
                <option value="real">Real (provedores configurados)</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Limite de gasto (US$)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                step="0.01"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="Sem limite"
              />
            </div>
          </div>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  name: form.name,
                  objective: form.objective,
                  description: form.description,
                  mode: form.mode,
                  budgetLimitUsd: form.budget === '' ? null : Number(form.budget),
                },
                {
                  onSuccess: () => toast.success('Projeto salvo'),
                  onError: (e) => toast.error('Falha ao salvar', errorMessage(e)),
                },
              )
            }
          >
            {save.isPending ? <Spinner /> : <Save />} Salvar alterações
          </Button>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Consumo de IA</h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {usd(usage.data?.totalCostUsd ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            de{' '}
            {usage.data?.budgetLimitUsd == null
              ? 'orçamento ilimitado'
              : usd(usage.data.budgetLimitUsd)}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {usage.data?.rows.map((r, i) => (
              <li key={i} className="flex justify-between gap-2 border-t border-border/60 pt-2">
                <span className="min-w-0 truncate font-mono text-xs">
                  {r.provider}/{r.model}
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  {r.runs} exec · {usd(r.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
