import { AlertTriangle, ArrowRightLeft, Bell, Bot, CheckCircle2, FileText, Flag, Play, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { EVENT_SEVERITY, type EventType } from '@ai-office/shared';
import { cn } from '@ai-office/ui';
import { timeAgo } from '@/lib/format';
import type { OfficeEvent } from '@/lib/types';
import { DemoTag } from './status';

const ICONS: Partial<Record<EventType, LucideIcon>> = {
  'agent.started': Play,
  'agent.message': Bot,
  'agent.tool.started': Wrench,
  'agent.tool.completed': Wrench,
  'agent.error': AlertTriangle,
  'task.completed': CheckCircle2,
  'task.failed': XCircle,
  'handoff.created': ArrowRightLeft,
  'handoff.completed': ArrowRightLeft,
  'artifact.created': FileText,
  'approval.requested': Bell,
  'mission.created': Flag,
  'mission.completed': Flag,
};
const TONE = { info: 'text-primary-soft bg-primary/10', success: 'text-success bg-success/10', warning: 'text-warning bg-warning/10', error: 'text-destructive bg-destructive/10' };

export function EventItem({ event, compact = false }: { event: OfficeEvent; compact?: boolean }) {
  const Icon = ICONS[event.type] ?? Bot;
  const tone = EVENT_SEVERITY[event.type] ?? 'info';
  return (
    <li className={cn('flex gap-3 rounded-lg px-2 py-2 hover:bg-accent/40', compact && 'py-1.5')}>
      <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', TONE[tone])}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug">{event.summary}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <time dateTime={event.createdAt}>{timeAgo(event.createdAt)}</time>
          <span className="font-mono opacity-60">{event.type}</span>
          {event.demo && <DemoTag />}
        </p>
      </div>
    </li>
  );
}
