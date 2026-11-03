'use client';
import { useState } from 'react';
import { CheckCircle2, KeyRound, Plug, ShieldCheck, Sparkles, Trash2, XCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ai-office/ui';
import { Page, PageHeader } from '@/components/page-header';
import { toast } from '@/components/toaster';
import { api, errorMessage } from '@/lib/api';
import { dateTime, usd } from '@/lib/format';
import { useApiMutation, usePrices, useProviders, useUsage } from '@/lib/queries';
import { useCurrentProject } from '@/lib/use-project';
import type { ProviderConfig } from '@/lib/types';

export default function SettingsPage() {
  return (
    <Page>
      <PageHeader
        title="Configurações"
        description="Provedores de IA, preços e consumo. Chaves ficam apenas no servidor, criptografadas."
      />
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Provedores</TabsTrigger>
          <TabsTrigger value="prices">Preços</TabsTrigger>
          <TabsTrigger value="usage">Consumo</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          <Providers />
        </TabsContent>
        <TabsContent value="prices" className="mt-4">
          <Prices />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <Usage />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function Providers() {
  const providers = useProviders();
  const free = providers.data?.filter((p) => p.freeTier) ?? [];
  const paid = providers.data?.filter((p) => !p.freeTier) ?? [];
  return (
    <div className="space-y-6">
      <Card className="border-success/30 bg-success/[0.05] p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-success" /> Comece sem custo com o Groq
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Crie uma chave gratuita em{' '}
            <a
              className="text-primary-soft underline"
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              console.groq.com/keys
            </a>
            .
          </li>
          <li>Cole a chave no cartão do Groq abaixo, salve e clique em “Verificar conexão”.</li>
          <li>Escolha o modelo padrão na lista (apenas modelos de texto são exibidos).</li>
          <li>
            Num projeto em modo <b>Real</b>, configure os agentes com o provedor Groq.
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          O plano gratuito tem limites por minuto e por dia; o AI Office executa uma chamada por vez
          e re-tenta automaticamente quando o limite é atingido. Não envie dados sensíveis da
          empresa a serviços externos.
        </p>
      </Card>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Sem custo</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {free.map((p) => (
            <ProviderCard key={p.provider} cfg={p} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Pagos (cobrança por token)</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {paid.map((p) => (
            <ProviderCard key={p.provider} cfg={p} />
          ))}
        </div>
      </section>
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-success" /> Segurança das credenciais
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          As chaves são criptografadas com AES-256-GCM no backend e nunca são enviadas ao navegador
          — apenas uma dica (primeiros/últimos caracteres). A verificação lista os modelos
          disponíveis direto da API do provedor.
        </p>
      </Card>
    </div>
  );
}

function ProviderCard({ cfg }: { cfg: ProviderConfig }) {
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(cfg.defaultModel ?? '');
  const [budget, setBudget] = useState(
    cfg.monthlyBudgetUsd == null ? '' : String(cfg.monthlyBudgetUsd),
  );
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl ?? '');
  const [concurrency, setConcurrency] = useState(
    cfg.maxConcurrency == null ? '' : String(cfg.maxConcurrency),
  );
  const [freeTier, setFreeTier] = useState(cfg.freeTier);
  const save = useApiMutation(
    (body: object) =>
      api<ProviderConfig>(`/providers/${cfg.provider}`, { method: 'PUT', json: body }),
    () => [['providers']],
  );
  const verify = useApiMutation(
    () => api<ProviderConfig>(`/providers/${cfg.provider}/verify`, { method: 'POST', json: {} }),
    () => [['providers']],
  );
  const remove = useApiMutation(
    () => api(`/providers/${cfg.provider}`, { method: 'DELETE' }),
    () => [['providers']],
  );
  const models = [...new Set([...cfg.availableModels, ...cfg.suggestedModels])];
  const id = cfg.provider;
  const isLocal = cfg.provider === 'ollama';

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            <Plug className="size-4 text-primary-soft" /> {cfg.label}
            {cfg.freeTier && <Badge variant="success">sem custo</Badge>}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{cfg.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cfg.configured
              ? cfg.keyHint
                ? `Chave: ${cfg.keyHint}`
                : 'Configurado'
              : 'Não configurado'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cfg.lastCheckOk === true && (
            <Badge variant="success">
              <CheckCircle2 className="size-3" /> conectado
            </Badge>
          )}
          {cfg.lastCheckOk === false && (
            <Badge variant="destructive">
              <XCircle className="size-3" /> falhou
            </Badge>
          )}
          <Switch
            checked={cfg.enabled}
            disabled={!cfg.configured}
            onCheckedChange={(v) => save.mutate({ enabled: v })}
            aria-label={`Ativar ${cfg.label}`}
          />
        </div>
      </div>
      {cfg.lastCheckError && (
        <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
          {cfg.lastCheckError}
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              enabled: true,
              ...(apiKey ? { apiKey } : {}),
              defaultModel: defaultModel || null,
              monthlyBudgetUsd: budget === '' ? null : Number(budget),
              maxConcurrency: concurrency === '' ? null : Number(concurrency),
              ...(isLocal ? { baseUrl: baseUrl || null } : { freeTier }),
            },
            {
              onSuccess: () => {
                setApiKey('');
                toast.success(`${cfg.label} salvo`, 'Agora clique em “Verificar conexão”.');
              },
              onError: (err) => toast.error('Falha ao salvar', errorMessage(err)),
            },
          );
        }}
      >
        {cfg.requiresApiKey && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-key`}>
              Chave de API {cfg.configured && '(deixe vazio para manter)'}
              {cfg.keyUrl && (
                <>
                  {' · '}
                  <a
                    className="text-primary-soft underline"
                    href={cfg.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    obter chave
                  </a>
                </>
              )}
            </Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pl-9 font-mono"
              />
            </div>
          </div>
        )}
        {cfg.baseUrlEditable ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-url`}>Endereço do servidor</Label>
            <Input
              id={`${id}-url`}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono text-xs"
              placeholder="http://localhost:11434/v1"
            />
          </div>
        ) : (
          cfg.baseUrl && (
            <p className="font-mono text-[11px] text-muted-foreground">Endpoint: {cfg.baseUrl}</p>
          )
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-model`}>Modelo padrão</Label>
            <Input
              id={`${id}-model`}
              list={`${id}-models`}
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="font-mono text-xs"
              placeholder={models[0] ?? 'verifique a conexão para listar'}
            />
            <datalist id={`${id}-models`}>
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-conc`}>Simultâneas</Label>
            <Input
              id={`${id}-conc`}
              type="number"
              min={1}
              max={16}
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              placeholder={String(cfg.defaultConcurrency)}
            />
          </div>
        </div>
        {!isLocal && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-budget`}>Limite mensal (US$)</Label>
              <Input
                id={`${id}-budget`}
                type="number"
                min={0}
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Sem limite"
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
              <span>
                <span className="block text-sm">Conta no plano gratuito</span>
                <span className="block text-[11px] text-muted-foreground">
                  Registra o custo como US$ 0
                </span>
              </span>
              <Switch
                checked={freeTier}
                onCheckedChange={setFreeTier}
                aria-label="Conta no plano gratuito"
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner />} Salvar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!cfg.configured || verify.isPending}
            onClick={() =>
              verify.mutate(undefined, {
                onSuccess: (r) =>
                  r.lastCheckOk
                    ? toast.success(
                        'Conexão verificada',
                        `${r.availableModels.length} modelos de texto disponíveis`,
                      )
                    : toast.error('Falha na verificação', r.lastCheckError ?? undefined),
                onError: (e) => toast.error('Falha', errorMessage(e)),
              })
            }
          >
            {verify.isPending && <Spinner />} Verificar conexão
          </Button>
          {cfg.configured && cfg.requiresApiKey && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                window.confirm('Remover a chave deste provedor?') &&
                remove.mutate(undefined, { onSuccess: () => toast.success('Chave removida') })
              }
            >
              <Trash2 /> Remover chave
            </Button>
          )}
        </div>
        {cfg.lastCheckedAt && (
          <p className="text-[11px] text-muted-foreground">
            Última verificação: {dateTime(cfg.lastCheckedAt)} · {cfg.availableModels.length} modelos
            de texto listados
          </p>
        )}
      </form>
    </Card>
  );
}

function Prices() {
  const prices = usePrices();
  const [form, setForm] = useState({
    provider: 'openai',
    model: '',
    input: '',
    output: '',
    source: '',
  });
  const save = useApiMutation(
    (body: object) => api('/prices', { method: 'PUT', json: body }),
    () => [['prices']],
  );
  const del = useApiMutation(
    (id: string) => api(`/prices/${id}`, { method: 'DELETE' }),
    () => [['prices']],
  );
  const rows = [
    ...(prices.data?.overrides ?? []).map((o) => ({ ...o, custom: true })),
    ...(prices.data?.defaults ?? [])
      .filter(
        (d) =>
          !prices.data?.overrides.some((o) => o.provider === d.provider && o.model === d.model),
      )
      .map((d) => ({ ...d, custom: false })),
  ];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          Os preços padrão da Anthropic vêm da tabela publicada pelo provedor (fonte indicada
          abaixo). Preços da OpenAI não são pré-cadastrados: informe-os a partir da página oficial.
          Sem preço, o custo aparece como “desconhecido” — nunca estimado.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                provider: form.provider,
                model: form.model,
                inputPerMTokUsd: Number(form.input),
                outputPerMTokUsd: Number(form.output),
                source: form.source || 'Informado pelo usuário',
              },
              {
                onSuccess: () => {
                  toast.success('Preço salvo');
                  setForm({ ...form, model: '', input: '', output: '' });
                },
                onError: (err) => toast.error('Falha', errorMessage(err)),
              },
            );
          }}
        >
          <NativeSelect
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            aria-label="Provedor"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="groq">Groq</option>
            <option value="openrouter">OpenRouter</option>
          </NativeSelect>
          <Input
            required
            placeholder="modelo"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="font-mono text-xs sm:col-span-2"
            aria-label="Modelo"
          />
          <Input
            required
            type="number"
            min={0}
            step="0.0001"
            placeholder="US$/1M entrada"
            value={form.input}
            onChange={(e) => setForm({ ...form, input: e.target.value })}
            aria-label="Preço de entrada por milhão de tokens"
          />
          <Input
            required
            type="number"
            min={0}
            step="0.0001"
            placeholder="US$/1M saída"
            value={form.output}
            onChange={(e) => setForm({ ...form, output: e.target.value })}
            aria-label="Preço de saída por milhão de tokens"
          />
          <Button type="submit" disabled={save.isPending}>
            Salvar
          </Button>
          <Input
            placeholder="Fonte (ex.: página oficial, data)"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            className="sm:col-span-6"
            aria-label="Fonte do preço"
          />
        </form>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Provedor</th>
              <th className="p-3">Modelo</th>
              <th className="p-3">Entrada /1M</th>
              <th className="p-3">Saída /1M</th>
              <th className="p-3">Fonte</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.provider}-${r.model}`} className="border-t border-border/60">
                <td className="p-3">{r.provider}</td>
                <td className="p-3 font-mono text-xs">{r.model}</td>
                <td className="p-3 tabular-nums">{usd(r.inputPerMTokUsd)}</td>
                <td className="p-3 tabular-nums">{usd(r.outputPerMTokUsd)}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.source}</td>
                <td className="p-3">
                  {r.custom && r.id && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => del.mutate(r.id!)}
                      aria-label="Remover preço"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Usage() {
  const { project } = useCurrentProject();
  const usage = useUsage(project?.id ?? null);
  if (!project) return null;
  const pct = usage.data?.budgetLimitUsd
    ? Math.min(100, (usage.data.totalCostUsd / usage.data.budgetLimitUsd) * 100)
    : null;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Projeto {project.name}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {usd(usage.data?.totalCostUsd ?? 0)}
        </p>
        <p className="text-sm text-muted-foreground">
          Orçamento:{' '}
          {usage.data?.budgetLimitUsd == null
            ? 'sem limite (defina nas configurações do projeto)'
            : `${usd(usage.data.budgetLimitUsd)} · ${pct?.toFixed(0)}% usado`}
        </p>
        {pct != null && pct >= 80 && (
          <p className="mt-2 rounded-lg bg-warning/10 p-2 text-sm text-warning">
            Alerta: consumo acima de 80% do orçamento.
          </p>
        )}
      </Card>
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Provedor/modelo</th>
              <th className="p-3">Execuções</th>
              <th className="p-3">Tokens (entrada/saída)</th>
              <th className="p-3">Custo</th>
            </tr>
          </thead>
          <tbody>
            {usage.data?.rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="p-3 font-mono text-xs">
                  {r.provider}/{r.model}
                  {r.demoRuns > 0 && ' (demo)'}
                </td>
                <td className="p-3">{r.runs}</td>
                <td className="p-3 tabular-nums">
                  {r.inputTokens.toLocaleString('pt-BR')} / {r.outputTokens.toLocaleString('pt-BR')}
                </td>
                <td className="p-3">
                  {r.unknownCostRuns ? (
                    <span className="text-warning">desconhecido ({r.unknownCostRuns})</span>
                  ) : (
                    usd(r.costUsd)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
