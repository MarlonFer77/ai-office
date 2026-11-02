import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityFeed } from '@/components/panels/activity-feed';
import { TeamBar } from '@/components/panels/team-bar';
import { EventItem } from '@/components/event-item';
import { AgentStatusBadge } from '@/components/status';
import { useLive, useUi } from '@/lib/store';
import type { Agent, OfficeEvent } from '@/lib/types';
import AppError from '@/app/(app)/error';

const agents: Agent[] = [
  {
    id: 'a1',
    projectId: 'p',
    roomId: null,
    name: 'Claude Estrategista',
    role: 'strategist',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    systemPrompt: '',
    avatarSeed: 1,
    status: 'idle',
    permissions: [],
    budgetLimitUsd: null,
    maxOutputTokens: 4000,
    paused: false,
    lastError: null,
    createdAt: '',
  },
  {
    id: 'a2',
    projectId: 'p',
    roomId: null,
    name: 'Pesquisador Demo',
    role: 'researcher',
    provider: 'demo',
    model: 'demo-sim-1',
    systemPrompt: '',
    avatarSeed: 2,
    status: 'idle',
    permissions: [],
    budgetLimitUsd: null,
    maxOutputTokens: 4000,
    paused: false,
    lastError: null,
    createdAt: '',
  },
];
const ev = (
  id: string,
  type: OfficeEvent['type'],
  summary: string,
  extra: Partial<OfficeEvent> = {},
): OfficeEvent => ({
  id,
  type,
  projectId: 'p',
  agentId: 'a1',
  demo: false,
  summary,
  payload: {},
  createdAt: new Date().toISOString(),
  ...extra,
});
const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('ActivityFeed', () => {
  beforeEach(() => useLive.getState().reset('p', agents, []));

  it('shows an empty state before any event', () => {
    wrap(<ActivityFeed agents={agents} approvals={[]} />);
    expect(screen.getByText('Sem atividades ainda')).toBeTruthy();
  });

  it('renders live events, busy agents and filters alerts', () => {
    useLive.getState().ingest(
      ev('1', 'agent.started', 'Claude Estrategista começou a trabalhar', {
        payload: { kind: 'task' },
      }),
    );
    useLive.getState().ingest(ev('2', 'task.failed', 'Tarefa X falhou'));
    useLive
      .getState()
      .ingest(ev('3', 'task.completed', 'Tarefa Y concluída', { agentId: 'a2', demo: true }));
    useLive.getState().ingest(
      ev('4', 'agent.started', 'Pesquisador Demo começou', {
        agentId: 'a2',
        payload: { kind: 'chat' },
      }),
    );
    wrap(<ActivityFeed agents={agents} approvals={[]} />);
    expect(screen.getByText('Tarefa X falhou')).toBeTruthy();
    expect(screen.getByText('Agentes ocupados')).toBeTruthy();
    // a1 failed → error (not busy); a2 is the only busy agent.
    expect(screen.getAllByText('Pesquisador Demo').length).toBeGreaterThan(0);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Erros e avisos' }));
    expect(screen.getByText('Tarefa X falhou')).toBeTruthy();
    expect(screen.queryByText('Tarefa Y concluída')).toBeNull();
  });

  it('lists pending approvals with actions', () => {
    wrap(
      <ActivityFeed
        agents={agents}
        approvals={[
          {
            id: 'ap',
            projectId: 'p',
            missionId: 'm',
            taskId: null,
            kind: 'mission_plan',
            status: 'pending',
            title: 'Aprovar plano: X',
            details: 'Resumo',
            requestedByAgentId: 'a1',
            note: null,
            createdAt: new Date().toISOString(),
            resolvedAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Aprovar plano: X')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aprovar/ })).toBeTruthy();
  });
});

describe('TeamBar', () => {
  it('selects an agent from the keyboard-accessible team list', () => {
    useLive.getState().reset('p', agents, []);
    wrap(<TeamBar agents={agents} onAddAgent={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude Estrategista' }));
    expect(useUi.getState().selectedAgentId).toBe('a1');
    expect(screen.getByText('demo')).toBeTruthy();
  });
});

describe('small components', () => {
  it('labels demo events and statuses', () => {
    render(
      <ul>
        <EventItem event={ev('9', 'artifact.created', 'Entrega criada', { demo: true })} />
      </ul>,
    );
    expect(screen.getByText('demo')).toBeTruthy();
    render(<AgentStatusBadge status="awaiting_approval" />);
    expect(screen.getByText('Aguardando aprovação')).toBeTruthy();
  });

  it('error boundary offers a retry', () => {
    let retried = false;
    render(<AppError error={new Error('Falha X')} reset={() => (retried = true)} />);
    expect(screen.getByRole('alert').textContent).toContain('Falha X');
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(retried).toBe(true);
  });
});
