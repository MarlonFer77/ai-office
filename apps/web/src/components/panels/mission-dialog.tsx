'use client';
import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button, Dialog, DialogContent, Input, Label, Spinner, Textarea } from '@ai-office/ui';
import { api, errorMessage } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { toast } from '../toaster';

const EXAMPLES = [
  'Crie uma estratégia de lançamento para um novo software de gestão financeira.',
  'Planeje uma campanha de conteúdo de 4 semanas para um app de produtividade.',
  'Elabore a arquitetura e um MVP técnico para um portal de agendamentos.',
];

export function MissionDialog({ projectId, demo }: { projectId: string; demo: boolean }) {
  const { missionDialogOpen, setMissionDialogOpen } = useUi();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const create = useApiMutation(
    (body: { title: string; goal: string }) =>
      api(`/projects/${projectId}/missions`, { method: 'POST', json: body }),
    () => [
      ['office', projectId],
      ['missions', projectId],
    ],
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { title: title || goal.slice(0, 60), goal },
      {
        onSuccess: () => {
          toast.success(
            'Missão criada',
            'O estrategista está montando o plano. Você poderá revisá-lo antes da execução.',
          );
          setMissionDialogOpen(false);
          setTitle('');
          setGoal('');
        },
        onError: (err) => toast.error('Não foi possível criar a missão', errorMessage(err)),
      },
    );
  };
  return (
    <Dialog open={missionDialogOpen} onOpenChange={setMissionDialogOpen}>
      <DialogContent
        title="Definir missão"
        description={
          demo
            ? 'Modo demonstração: o plano e as entregas serão simulados localmente.'
            : 'O planejador transformará a missão em tarefas. Nada é executado antes da sua aprovação.'
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-goal">Objetivo</Label>
            <Textarea
              id="m-goal"
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={5000}
              className="min-h-28"
              placeholder="Descreva o resultado esperado…"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => setGoal(ex)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  {ex.slice(0, 48)}…
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Título curto (opcional)</Label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Lançamento FinFlow"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMissionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !goal.trim()}>
              {create.isPending ? <Spinner /> : <Rocket />} Iniciar planejamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
