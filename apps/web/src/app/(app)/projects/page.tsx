'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArrowRight, FolderKanban, Plus, Settings2, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Progress, Skeleton, Tabs, TabsList, TabsTrigger } from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { timeAgo } from '@/lib/format';
import { useProjects } from '@/lib/queries';
import { useUi } from '@/lib/store';

export default function ProjectsPage() {
  const [archived, setArchived] = useState(false);
  const projects = useProjects(archived);
  const setProjectId = useUi((s) => s.setProjectId);
  const router = useRouter();
  return (
    <Page>
      <PageHeader title="Projetos" description="Cada projeto tem seu escritório, equipe, missões, entregas e consumo." actions={<Button asChild><Link href="/projects/new"><Plus /> Novo projeto</Link></Button>} />
      <Tabs value={archived ? 'archived' : 'active'} onValueChange={(v) => setArchived(v === 'archived')} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">Ativos</TabsTrigger>
          <TabsTrigger value="archived"><Archive className="size-3.5" /> Arquivados</TabsTrigger>
        </TabsList>
      </Tabs>
      {projects.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : !projects.data?.length ? (
        <EmptyState icon={<FolderKanban />} title={archived ? 'Nenhum projeto arquivado' : 'Nenhum projeto ainda'} description="Comece pelo modo demonstração para explorar o escritório sem chaves de API." action={!archived && <Button asChild><Link href="/projects/new">Criar projeto</Link></Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.data.map((p) => (
            <Card key={p.id} className="group p-5 transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{p.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.objective || p.description || 'Sem objetivo definido.'}</p>
                </div>
                {p.mode === 'demo' ? <Badge variant="demo">demo</Badge> : <Badge variant="info">real</Badge>}
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{p.progress?.completed ?? 0} de {p.progress?.total ?? 0} tarefas</span>
                  <span className="tabular-nums">{p.progress?.percent ?? 0}%</span>
                </div>
                <Progress value={p.progress?.percent ?? 0} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="size-3.5" /> {p.agentCount ?? 0} agentes</span>
                  <span>atualizado {timeAgo(p.updatedAt)}</span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" asChild><Link href={`/projects/${p.id}`} aria-label={`Configurar ${p.name}`}><Settings2 /></Link></Button>
                  {!archived && (
                    <Button size="sm" variant="secondary" onClick={() => { setProjectId(p.id); router.push('/office'); }}>
                      Entrar <ArrowRight />
                    </Button>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
