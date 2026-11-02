'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, ExternalLink, FilePlus2, Library, Search, Upload } from 'lucide-react';
import { ARTIFACT_KINDS } from '@ai-office/shared';
import { Badge, Button, Card, cn, Dialog, DialogContent, EmptyState, Input, Label, NativeSelect, Skeleton, Spinner, Textarea } from '@ai-office/ui';
import { Markdown } from '@/components/markdown';
import { Page, PageHeader } from '@/components/page-header';
import { DemoTag } from '@/components/status';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { dateTime, timeAgo } from '@/lib/format';
import { useApiMutation, useAppConfig, useArtifact, useArtifacts, useOffice } from '@/lib/queries';
import { useCurrentProject } from '@/lib/use-project';

const KIND_LABELS: Record<string, string> = { text: 'Texto', markdown: 'Markdown', json: 'JSON', code: 'Código', document: 'Documento', report: 'Relatório', external_ref: 'Referência externa' };

function LibraryInner() {
  const { project } = useCurrentProject();
  const pid = project?.id ?? null;
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useState<string | null>(params.get('artifact'));
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useArtifacts(pid, debounced, kind);
  const office = useOffice(pid);
  const agentName = (id: string | null) => office.data?.agents.find((a) => a.id === id)?.name ?? 'Diretor';

  return (
    <Page>
      <PageHeader title="Biblioteca" description="Todos os artefatos do projeto, com histórico de versões." actions={<Button onClick={() => setCreating(true)}><FilePlus2 /> Novo artefato</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou conteúdo…" className="pl-9" aria-label="Buscar artefatos" />
        </div>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-48" aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {ARTIFACT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          {list.isLoading ? <Skeleton className="h-64" /> : !list.data?.length ? (
            <EmptyState icon={<Library />} title={debounced ? 'Nada encontrado' : 'Biblioteca vazia'} description={debounced ? 'Tente outros termos.' : 'Entregas dos agentes aparecem aqui automaticamente.'} />
          ) : (
            <ul className="space-y-1.5">
              {list.data.map((a) => (
                <li key={a.id}>
                  <button onClick={() => setSelected(a.id)} aria-current={selected === a.id} className={cn('w-full rounded-xl border p-3 text-left hover:border-primary/40', selected === a.id ? 'border-primary/60 bg-primary/10' : 'border-border/70')}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="flex shrink-0 gap-1"><Badge variant="secondary">{KIND_LABELS[a.kind]}</Badge>{a.demo && <DemoTag />}</span>
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{agentName(a.agentId)} · v{a.currentVersion} · {timeAgo(a.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected ? <ArtifactViewer id={selected} /> : <Card className="hidden place-items-center p-10 text-sm text-muted-foreground lg:grid">Selecione um artefato para visualizar.</Card>}
      </div>
      {pid && <NewArtifactDialog open={creating} onOpenChange={setCreating} projectId={pid} />}
    </Page>
  );
}

function ArtifactViewer({ id }: { id: string }) {
  const art = useArtifact(id);
  const [version, setVersion] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const save = useApiMutation((content: string) => api(`/artifacts/${id}/versions`, { method: 'POST', json: { content, note: 'Edição manual do diretor' } }), () => [['artifact', id], ['artifacts']]);
  useEffect(() => setVersion(null), [id]);
  if (!art.data) return <Skeleton className="h-96" />;
  const { artifact, versions } = art.data;
  const current = versions.find((v) => v.version === (version ?? artifact.currentVersion)) ?? versions[0];
  const editable = !['document', 'external_ref'].includes(artifact.kind);
  return (
    <Card className="min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{artifact.name}</h2>
          <p className="text-xs text-muted-foreground">Criado {dateTime(artifact.createdAt)}{artifact.demo && ' · conteúdo de demonstração'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeSelect value={current?.version} onChange={(e) => setVersion(Number(e.target.value))} className="h-8 w-auto text-xs" aria-label="Versão">
            {versions.map((v) => <option key={v.version} value={v.version}>v{v.version} — {timeAgo(v.createdAt)}</option>)}
          </NativeSelect>
          {artifact.externalUrl ? (
            <Button size="sm" variant="secondary" asChild><a href={artifact.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir</a></Button>
          ) : (
            <Button size="sm" variant="secondary" asChild><a href={`/api/artifacts/${id}/versions/${current?.version}/download`}><Download /> Baixar</a></Button>
          )}
          {editable && !editing && <Button size="sm" variant="ghost" onClick={() => { setDraft(current?.content ?? ''); setEditing(true); }}>Nova versão</Button>}
        </div>
      </div>
      {current?.note && <p className="mt-2 text-xs text-muted-foreground">Nota: {current.note}</p>}
      <div className="mt-4 max-h-[65vh] overflow-y-auto rounded-xl border border-border bg-background/50 p-4 scrollbar-thin">
        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-80 font-mono text-xs" aria-label="Conteúdo da nova versão" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft, { onSuccess: () => { setEditing(false); setVersion(null); toast.success('Nova versão salva'); }, onError: (e) => toast.error('Falha', errorMessage(e)) })}>{save.isPending && <Spinner />} Salvar versão</Button>
            </div>
          </div>
        ) : current?.content != null ? (
          artifact.kind === 'json' || artifact.kind === 'code' ? <pre className="whitespace-pre-wrap break-words font-mono text-xs">{current.content}</pre> : <Markdown>{current.content}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">{artifact.externalUrl ? `Referência externa: ${artifact.externalUrl}` : `Arquivo binário (${current?.mimeType ?? 'desconhecido'}, ${current?.sizeBytes ?? 0} bytes). Use “Baixar”.`}</p>
        )}
      </div>
    </Card>
  );
}

function NewArtifactDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (v: boolean) => void; projectId: string }) {
  const config = useAppConfig();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('markdown');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const create = useApiMutation(async () => {
    if (kind === 'document') {
      if (!file) throw new Error('Selecione um arquivo.');
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return api(`/projects/${projectId}/artifacts/upload`, { method: 'POST', json: { name: name || file.name, mimeType: file.type || 'application/octet-stream', dataBase64: btoa(bin) } });
    }
    return api(`/projects/${projectId}/artifacts`, { method: 'POST', json: { name, kind, ...(kind === 'external_ref' ? { externalUrl: url } : { content }) } });
  }, () => [['artifacts', projectId]]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Novo artefato" description="Adicione conteúdo à biblioteca do projeto.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onSuccess: () => { toast.success('Artefato criado'); onOpenChange(false); setName(''); setContent(''); setUrl(''); setFile(null); }, onError: (err) => toast.error('Falha', errorMessage(err)) }); }}>
          <div className="space-y-1.5"><Label htmlFor="a-name">Nome</Label><Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} required={kind !== 'document'} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="a-kind">Tipo</Label>
            <NativeSelect id="a-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {['markdown', 'text', 'json', 'code', 'report', 'external_ref', 'document'].map((k) => <option key={k} value={k} disabled={k === 'document' && !config.data?.storageEnabled}>{KIND_LABELS[k]}{k === 'document' && !config.data?.storageEnabled ? ' (requer S3/MinIO)' : ''}</option>)}
            </NativeSelect>
          </div>
          {kind === 'external_ref' ? (
            <div className="space-y-1.5"><Label htmlFor="a-url">URL</Label><Input id="a-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://" /></div>
          ) : kind === 'document' ? (
            <div className="space-y-1.5"><Label htmlFor="a-file">Arquivo (até 5 MB)</Label><Input id="a-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          ) : (
            <div className="space-y-1.5"><Label htmlFor="a-content">Conteúdo</Label><Textarea id="a-content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-40 font-mono text-xs" required /></div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? <Spinner /> : kind === 'document' ? <Upload /> : <FilePlus2 />} Criar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryInner />
    </Suspense>
  );
}
