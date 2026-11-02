'use client';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge, Button, Textarea } from '@ai-office/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';
import type { Approval } from '@/lib/types';
import { Markdown } from '../markdown';
import { toast } from '../toaster';

export function ApprovalCard({
  approval,
  expanded = false,
}: {
  approval: Approval;
  expanded?: boolean;
}) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(expanded);
  const resolve = useApiMutation(
    (decision: 'approved' | 'rejected') =>
      api(`/approvals/${approval.id}/resolve`, {
        method: 'POST',
        json: { decision, ...(note ? { note } : {}) },
      }),
    () => [
      ['office', approval.projectId],
      ['approvals', approval.projectId],
      ['missions', approval.projectId],
      ['mission'],
    ],
  );
  const act = (d: 'approved' | 'rejected') =>
    resolve.mutate(d, {
      onSuccess: () =>
        toast.success(d === 'approved' ? 'Aprovado' : 'Devolvido para ajustes', approval.title),
      onError: (e) => toast.error('Não foi possível registrar a decisão', errorMessage(e)),
    });
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge variant="warning">
            {approval.kind === 'mission_plan' ? 'Plano da missão' : 'Entrega final'}
          </Badge>
          <p className="mt-1.5 text-sm font-medium leading-snug">{approval.title}</p>
          <p className="text-[11px] text-muted-foreground">{timeAgo(approval.createdAt)}</p>
        </div>
      </div>
      {approval.details && (
        <div className="mt-2">
          <button
            className="text-xs text-primary-soft hover:underline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          {open && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-background/50 p-3 scrollbar-thin">
              <Markdown>{approval.details}</Markdown>
            </div>
          )}
        </div>
      )}
      {approval.status === 'pending' ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Comentário (opcional; usado como feedback se rejeitar)"
            className="min-h-14 text-xs"
            aria-label="Comentário da decisão"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              disabled={resolve.isPending}
              onClick={() => act('approved')}
            >
              <Check /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => act('rejected')}
            >
              <X /> {approval.kind === 'mission_plan' ? 'Rejeitar' : 'Pedir ajustes'}
            </Button>
          </div>
        </div>
      ) : (
        <Badge
          variant={approval.status === 'approved' ? 'success' : 'destructive'}
          className="mt-2"
        >
          {approval.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
        </Badge>
      )}
    </div>
  );
}
