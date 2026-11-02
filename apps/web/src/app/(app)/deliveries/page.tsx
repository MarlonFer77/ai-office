'use client';
import Link from 'next/link';
import { PackageCheck } from 'lucide-react';
import { Badge, Card, EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { ApprovalCard } from '@/components/panels/approval-card';
import { DemoTag } from '@/components/status';
import { dateTime, timeAgo } from '@/lib/format';
import { useApprovals, useArtifacts, useOffice } from '@/lib/queries';
import { useCurrentProject } from '@/lib/use-project';

export default function DeliveriesPage() {
  const { project } = useCurrentProject();
  const pid = project?.id ?? null;
  const pending = useApprovals(pid, 'pending');
  const resolved = useApprovals(pid);
  const artifacts = useArtifacts(pid);
  const office = useOffice(pid);
  const agentName = (id: string | null) => office.data?.agents.find((a) => a.id === id)?.name ?? 'Diretor';
  return (
    <Page>
      <PageHeader title="Entregas" description="Aprovações pendentes e entregas produzidas pelos agentes." />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Aguardando aprovação {pending.data?.length ? <Badge variant="warning">{pending.data.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="artifacts">Entregas recentes</TabsTrigger>
          <TabsTrigger value="history">Decisões</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4 space-y-3">
          {pending.isLoading ? <Skeleton className="h-40" /> : !pending.data?.length ? <EmptyState icon={<PackageCheck />} title="Nada aguardando sua aprovação" /> : pending.data.map((a) => <ApprovalCard key={a.id} approval={a} expanded />)}
        </TabsContent>
        <TabsContent value="artifacts" className="mt-4">
          {!artifacts.data?.length ? <EmptyState title="Nenhuma entrega ainda" /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {artifacts.data.slice(0, 30).map((a) => (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/library?artifact=${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                    <span className="flex gap-1"><Badge variant="secondary">{a.kind}</Badge>{a.demo && <DemoTag />}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">por {agentName(a.agentId)} · v{a.currentVersion} · {timeAgo(a.updatedAt)}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ul className="space-y-2">
            {(resolved.data ?? []).filter((a) => a.status !== 'pending').map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm">
                <span className="min-w-0"><span className="block truncate">{a.title}</span>{a.note && <span className="block text-xs text-muted-foreground">“{a.note}”</span>}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{a.resolvedAt && dateTime(a.resolvedAt)}<Badge variant={a.status === 'approved' ? 'success' : 'destructive'}>{a.status === 'approved' ? 'aprovado' : 'rejeitado'}</Badge></span>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
