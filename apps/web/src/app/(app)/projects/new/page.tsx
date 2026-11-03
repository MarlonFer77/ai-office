'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, Sparkles, Users } from 'lucide-react';
import { Badge, Button, Card, cn, Input, Label, Spinner, Textarea } from '@ai-office/ui';
import { Page } from '@/components/page-header';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { useApiMutation, useProviders } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { Project } from '@/lib/types';

const STEPS = ['Projeto', 'Modo', 'Equipe'];

function Wizard() {
  const router = useRouter();
  const welcome = useSearchParams().get('welcome');
  const providers = useProviders();
  const setProjectId = useUi((s) => s.setProjectId);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'demo' | 'real'>('demo');
  const [starterTeam, setStarterTeam] = useState(true);
  const [budget, setBudget] = useState('');
  const anyProvider = providers.data?.some((p) => p.configured && p.enabled);
  const create = useApiMutation(
    (body: object) => api<Project>('/projects', { method: 'POST', json: body }),
    () => [['projects', false]],
  );

  const finish = () =>
    create.mutate(
      {
        name,
        objective,
        description,
        mode,
        starterTeam,
        budgetLimitUsd: budget === '' ? null : Number(budget),
      },
      {
        onSuccess: (p) => {
          setProjectId(p.id);
          toast.success(
            'Projeto criado',
            mode === 'demo'
              ? 'Equipe demo pronta. Defina uma missão!'
              : 'Equipe criada com seus provedores configurados.',
          );
          router.push('/office');
        },
        onError: (e) => toast.error('Falha ao criar projeto', errorMessage(e)),
      },
    );

  return (
    <Page>
      <div className="mx-auto max-w-2xl">
        {welcome && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-primary-soft" /> Bem-vindo ao AI Office!
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vamos montar seu primeiro escritório: crie um projeto, escolha o modo e a equipe.
              Depois é só definir uma missão.
            </p>
          </div>
        )}
        <ol className="mb-6 flex items-center gap-2" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                  i < step
                    ? 'border-primary bg-primary text-white'
                    : i === step
                      ? 'border-primary text-primary-soft'
                      : 'border-border text-muted-foreground',
                )}
                aria-current={i === step ? 'step' : undefined}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn('text-sm', i === step ? 'text-foreground' : 'text-muted-foreground')}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>
        <Card className="p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Sobre o projeto</h1>
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Nome</Label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Lançamento FinFlow"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-obj">Objetivo</Label>
                <Textarea
                  id="p-obj"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  maxLength={2000}
                  placeholder="O que este projeto deve alcançar?"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc">Descrição (opcional)</Label>
                <Textarea
                  id="p-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                />
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Como os agentes vão trabalhar?</h1>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    [
                      'demo',
                      'Demonstração',
                      'Respostas simuladas e determinísticas. Não precisa de chaves de API. Tudo é identificado como demo.',
                      Sparkles,
                    ],
                    [
                      'real',
                      'Real',
                      'IA de verdade com os provedores configurados: Groq (gratuito), Ollama local, Anthropic ou OpenAI. Consumo registrado.',
                      KeyRound,
                    ],
                  ] as const
                ).map(([value, title, text, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors',
                      mode === value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40',
                    )}
                  >
                    <Icon className="mb-2 size-5 text-primary-soft" />
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{text}</p>
                  </button>
                ))}
              </div>
              {mode === 'real' && !anyProvider && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  Nenhum provedor configurado. Agentes da equipe inicial usarão o simulador até você{' '}
                  <Link href="/settings" className="underline">
                    configurar um provedor
                  </Link>
                  .
                </p>
              )}
              {mode === 'real' && (
                <div className="space-y-1.5">
                  <Label htmlFor="p-budget">Limite de gasto do projeto (US$, opcional)</Label>
                  <Input
                    id="p-budget"
                    type="number"
                    min={0}
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="Sem limite"
                  />
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Equipe inicial</h1>
              <button
                type="button"
                onClick={() => setStarterTeam(true)}
                aria-pressed={starterTeam}
                className={cn(
                  'w-full rounded-xl border p-4 text-left',
                  starterTeam ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <p className="flex items-center gap-2 font-medium">
                  <Users className="size-4" /> Equipe completa recomendada
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estrategista, Pesquisador, Programador, Criativo e Revisor — cada um com sessão
                  independente.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Estratégia', 'Pesquisa', 'Desenvolvimento', 'Criação', 'Revisão'].map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStarterTeam(false)}
                aria-pressed={!starterTeam}
                className={cn(
                  'w-full rounded-xl border p-4 text-left',
                  !starterTeam ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <p className="font-medium">Começar vazio</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adicione e configure cada agente manualmente no escritório.
                </p>
              </button>
            </div>
          )}
          <div className="mt-6 flex justify-between">
            {step === 0 ? (
              <Button variant="ghost" asChild>
                <Link href="/projects">
                  <ArrowLeft /> Cancelar
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Voltar
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !name.trim()}>
                Continuar <ArrowRight />
              </Button>
            ) : (
              <Button onClick={finish} disabled={create.isPending}>
                {create.isPending && <Spinner />} Criar e entrar no escritório
              </Button>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
