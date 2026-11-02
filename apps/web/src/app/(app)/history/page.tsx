'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import { EVENT_TYPES } from '@ai-office/shared';
import {
  Button,
  EmptyState,
  NativeSelect,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ai-office/ui';
import { EventItem } from '@/components/event-item';
import { Page, PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useAudit } from '@/lib/queries';
import { useCurrentProject } from '@/lib/use-project';
import type { OfficeEvent } from '@/lib/types';

export default function HistoryPage() {
  const { project } = useCurrentProject();
  const pid = project?.id;
  const [type, setType] = useState('');
  const events = useInfiniteQuery({
    queryKey: ['history', pid, type],
    enabled: !!pid,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<OfficeEvent[]>(
        `/projects/${pid}/events?limit=50${pageParam ? `&before=${pageParam}` : ''}${type ? `&type=${type}` : ''}`,
      ),
    getNextPageParam: (last) => (last.length === 50 ? last.at(-1)!.id : undefined),
  });
  const audit = useAudit();
  const items = events.data?.pages.flat() ?? [];
  return (
    <Page>
      <PageHeader
        title="Histórico"
        description="Registro persistente de eventos do projeto e auditoria de ações sensíveis."
      />
      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Eventos do projeto</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="events" className="mt-4">
          <NativeSelect
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mb-3 sm:w-64"
            aria-label="Filtrar por tipo de evento"
          >
            <option value="">Todos os tipos</option>
            {EVENT_TYPES.filter((t) => t !== 'agent.message.delta').map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
          {events.isLoading ? (
            <Skeleton className="h-64" />
          ) : items.length === 0 ? (
            <EmptyState icon={<History />} title="Sem eventos" />
          ) : (
            <>
              <ul className="rounded-xl border border-border/70 p-2">
                {items.map((e) => (
                  <EventItem key={e.id} event={e} />
                ))}
              </ul>
              {events.hasNextPage && (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => events.fetchNextPage()}
                  disabled={events.isFetchingNextPage}
                >
                  Carregar mais
                </Button>
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Quando</th>
                  <th className="p-3">Ação</th>
                  <th className="p-3">Recurso</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="p-3 text-xs text-muted-foreground">{dateTime(l.createdAt)}</td>
                    <td className="p-3 font-mono text-xs">{l.action}</td>
                    <td className="p-3 text-xs">{l.resourceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
