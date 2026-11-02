import { STATUS_COLORS, STATUS_LABELS, toCss } from '@ai-office/office-engine';
import type { AgentStatus, ProviderId, TaskStatus } from '@ai-office/shared';
import { Badge } from '@ai-office/ui';
import { PROVIDER_LABELS, TASK_STATUS_LABELS, TASK_STATUS_VARIANT } from '@/lib/format';

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const c = toCss(STATUS_COLORS[status]);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${c}55`, background: `${c}18`, color: c }}
    >
      <span
        className={`size-1.5 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
        style={{ background: c }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ProviderBadge({ provider, model }: { provider: ProviderId; model?: string }) {
  if (provider === 'demo') return <Badge variant="demo">demo</Badge>;
  return (
    <Badge variant="secondary" className="max-w-full">
      <span className="font-semibold">{PROVIDER_LABELS[provider]}</span>
      {model && <span className="truncate font-mono text-[10px] opacity-80">{model}</span>}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_STATUS_VARIANT[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

export function DemoTag() {
  return (
    <Badge variant="demo" title="Gerado pelo simulador local — não é uma resposta de modelo real">
      demo
    </Badge>
  );
}
