import type { AgentRole, MissionStatus, ProviderId, RoomKind, TaskStatus } from '@ai-office/shared';

export const ROLE_LABELS: Record<AgentRole, string> = {
  strategist: 'Estratégia',
  researcher: 'Pesquisa',
  developer: 'Desenvolvimento',
  creative: 'Criação',
  reviewer: 'Revisão',
  coordinator: 'Coordenação',
};

export const ROOM_ICONS: Record<RoomKind, string> = {
  strategy: '♟',
  research: '🔎',
  production: '⚙',
  creative: '✦',
  review: '✓',
  meeting: '◎',
  director: '★',
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  ollama: 'Local',
  demo: 'Demo',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendente',
  ready: 'Pronta',
  running: 'Em execução',
  waiting_dependency: 'Aguardando dependência',
  awaiting_approval: 'Aguardando aprovação',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

export const TASK_STATUS_VARIANT: Record<
  TaskStatus,
  'secondary' | 'info' | 'default' | 'outline' | 'warning' | 'success' | 'destructive'
> = {
  pending: 'outline',
  ready: 'info',
  running: 'default',
  waiting_dependency: 'secondary',
  awaiting_approval: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'outline',
};

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  planning: 'Planejando',
  awaiting_plan_approval: 'Plano aguardando aprovação',
  running: 'Em execução',
  awaiting_final_approval: 'Entrega aguardando aprovação',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  if (Math.abs(s) < 45) return 'agora';
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function usd(n: number | null | undefined): string {
  if (n == null) return 'custo desconhecido';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n < 1 ? 4 : 2,
    maximumFractionDigits: n < 1 ? 4 : 2,
  });
}
export const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
