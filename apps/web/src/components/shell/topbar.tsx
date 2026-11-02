'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, Dialog as D } from 'radix-ui';
import { Bell, ChevronDown, LayoutGrid, LogOut, Menu, Plus, Rows3, Wifi, WifiOff } from 'lucide-react';
import { Badge, Button, cn, Progress, Tooltip } from '@ai-office/ui';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe, useOffice } from '@/lib/queries';
import { useCurrentProject } from '@/lib/use-project';
import { useLive, useUi } from '@/lib/store';
import { MISSION_STATUS_LABELS, timeAgo } from '@/lib/format';
import { NAV } from './nav';
import { Logo } from './logo';

export function Topbar() {
  const { project, projects } = useCurrentProject();
  const office = useOffice(project?.id ?? null);
  const { setProjectId, viewMode, setViewMode } = useUi();
  const status = useLive((s) => s.status);
  const mission = office.data?.missions.find((m) => !['completed', 'cancelled', 'failed'].includes(m.status)) ?? office.data?.missions[0];
  const running = office.data?.agents.filter((a) => a.status === 'running').length ?? 0;

  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 px-3 sm:px-4">
      <MobileNav />
      <span className="md:hidden"><Logo compact /></span>

      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Selecionar projeto">
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Projeto</span>
              <span className="block max-w-[140px] truncate text-sm font-medium sm:max-w-[220px]">{project?.name ?? 'Nenhum projeto'}</span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="z-50 w-72 rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
            {projects.map((p) => (
              <Popover.Close asChild key={p.id}>
                <button onClick={() => setProjectId(p.id)} className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent', p.id === project?.id && 'bg-accent')}>
                  <span className="truncate">{p.name}</span>
                  {p.mode === 'demo' ? <Badge variant="demo">demo</Badge> : <Badge variant="info">real</Badge>}
                </button>
              </Popover.Close>
            ))}
            <div className="my-1 h-px bg-border" />
            <Popover.Close asChild>
              <Link href="/projects/new" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-primary-soft hover:bg-accent">
                <Plus className="size-4" /> Novo projeto
              </Link>
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {project && (
        <div className="hidden items-center gap-3 lg:flex">
          {project.mode === 'demo' ? (
            <Tooltip content="Respostas geradas pelo simulador local, sem chamadas a modelos reais.">
              <Badge variant="demo">Modo demonstração</Badge>
            </Tooltip>
          ) : (
            <Badge variant="info">Modo real</Badge>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', running ? 'animate-pulse bg-primary shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted-foreground/50')} />
            {running ? `${running} agente(s) executando` : mission ? MISSION_STATUS_LABELS[mission.status] : 'Sem missão ativa'}
          </div>
          {office.data && office.data.progress.total > 0 && (
            <Tooltip content={`${office.data.progress.completed} de ${office.data.progress.total} tarefas concluídas (canceladas não contam)`}>
              <div className="flex w-40 items-center gap-2">
                <Progress value={office.data.progress.percent} label="Progresso do projeto" />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{office.data.progress.percent}%</span>
              </div>
            </Tooltip>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={status === 'open' ? 'Tempo real conectado' : status === 'idle' ? 'Tempo real inativo' : 'Reconectando ao tempo real…'}>
          <span className={cn('hidden size-8 place-items-center rounded-lg sm:grid', status === 'open' ? 'text-success' : 'text-warning')} aria-label={`Conexão em tempo real: ${status}`}>
            {status === 'open' ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          </span>
        </Tooltip>
        <div className="hidden rounded-lg border border-border p-0.5 sm:flex" role="group" aria-label="Alternar visualização">
          <Tooltip content="Escritório isométrico">
            <button aria-pressed={viewMode === 'office'} onClick={() => setViewMode('office')} className={cn('grid size-7 place-items-center rounded-md', viewMode === 'office' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="size-4" />
              <span className="sr-only">Visualização de escritório</span>
            </button>
          </Tooltip>
          <Tooltip content="Lista simplificada">
            <button aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} className={cn('grid size-7 place-items-center rounded-md', viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <Rows3 className="size-4" />
              <span className="sr-only">Visualização em lista</span>
            </button>
          </Tooltip>
        </div>
        <Notifications />
        <ProfileMenu />
      </div>
    </header>
  );
}

function Notifications() {
  const { project } = useCurrentProject();
  const office = useOffice(project?.id ?? null);
  const feed = useLive((s) => s.feed);
  const approvals = office.data?.approvals ?? [];
  const alerts = feed.filter((e) => ['agent.error', 'task.failed', 'budget.exceeded', 'budget.warning', 'mission.failed'].includes(e.type)).slice(0, 5);
  const count = approvals.length + alerts.length;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="relative grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Notificações (${count})`}>
          <Bell className="size-4" />
          {count > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-black">{count}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-80 rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notificações</p>
          {count === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nada pendente.</p>}
          {approvals.map((a) => (
            <Popover.Close asChild key={a.id}>
              <Link href="/deliveries" className="block rounded-lg px-2 py-2 hover:bg-accent">
                <p className="text-sm font-medium text-warning">Aprovação pendente</p>
                <p className="truncate text-xs text-muted-foreground">{a.title}</p>
              </Link>
            </Popover.Close>
          ))}
          {alerts.map((e) => (
            <div key={e.id} className="rounded-lg px-2 py-2">
              <p className="text-sm text-destructive">{e.summary}</p>
              <p className="text-[11px] text-muted-foreground">{timeAgo(e.createdAt)}</p>
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ProfileMenu() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const initial = (me.data?.user.name ?? '?').slice(0, 1).toUpperCase();
  const logout = async () => {
    await api('/auth/sign-out', { method: 'POST', json: {} }).catch(() => undefined);
    qc.clear();
    router.replace('/login');
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="ml-1 grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Perfil do usuário">
          {initial}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-2xl">
          <div className="px-2 py-2">
            <p className="text-sm font-medium">{me.data?.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{me.data?.user.email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>
            <LogOut /> Sair
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MobileNav() {
  return (
    <D.Root>
      <D.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <Menu />
        </Button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content className="glass fixed inset-y-0 left-0 z-50 w-64 border-r border-border p-4 slide-in-from-right">
          <D.Title className="mb-4"><Logo /></D.Title>
          <D.Description className="sr-only">Menu de navegação</D.Description>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <D.Close asChild key={href}>
                <Link href={href} className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent">
                  <Icon className="size-4" /> {label}
                </Link>
              </D.Close>
            ))}
          </nav>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
