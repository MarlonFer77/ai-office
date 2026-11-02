# Arquitetura — AI Office

## Visão geral

```
                ┌──────────────────────── Navegador ────────────────────────┐
                │ Next.js (App Router) · React 19 · Tailwind 4 · PixiJS 8    │
                │ TanStack Query (dados) · Zustand (UI + estado visual)      │
                │ EventSource (SSE) ─┐                                       │
                └────────────────────┼───────────────────────────────────────┘
                                     │  mesma origem: /api/* → proxy do Next
                ┌────────────────────▼──────────────────┐
                │ apps/api — Fastify 5                    │
                │  Better Auth · Zod · rate limit · CORS  │
                │  REST + SSE (/events/stream)            │
                └───────┬───────────────┬────────────────┘
                        │ SQL           │ enqueue (BullMQ)      ▲ pub/sub (eventos)
                ┌───────▼──────┐  ┌─────▼──────┐               │
                │ PostgreSQL   │  │   Redis    │◄──────────────┤
                │ (Drizzle)    │  │ BullMQ +   │               │
                └───────▲──────┘  │ pub/sub    │               │
                        │         └─────┬──────┘               │
                ┌───────┴───────────────▼───────────────────────┴──┐
                │ apps/worker — BullMQ Worker                        │
                │  @ai-office/orchestrator (missões, tarefas, handoffs│
                │  sessões, consumo) → @ai-office/agents (adaptadores)│
                └───────────────┬───────────────────────────────────┘
                                │ HTTPS (SDKs oficiais)
                   Anthropic API · OpenAI API · (demo: simulador local)
```

## Pacotes

| Pacote                   | Responsabilidade                                                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`        | Domínio puro: enums, catálogo de eventos, schemas Zod de entrada, plantas das salas, cálculo de progresso. Sem I/O.                                                                                                                                                              |
| `packages/database`      | Schema Drizzle (23 tabelas), cliente `pg`, migrações versionadas em `drizzle/`.                                                                                                                                                                                                  |
| `packages/agents`        | Interface `ProviderAdapter` + adaptadores Anthropic, OpenAI e Demo; preços; prompts; parsing/validação de planos; criptografia de segredos. Sem acesso a banco.                                                                                                                  |
| `packages/orchestrator`  | Lógica de domínio com I/O: bootstrap de workspace/projeto, criação de agentes, execução de turnos (trava de sessão, histórico isolado, streaming, ferramentas, consumo), missões, tarefas, dependências, handoffs, aprovações, orçamento, eventos. Usado pela API e pelo worker. |
| `packages/office-engine` | Matemática isométrica, layout de salas/mesas, reducer puro `eventos → estado visual`, paleta. Sem React/Pixi (testável).                                                                                                                                                         |
| `packages/ui`            | Design system no estilo shadcn/ui (Radix + Tailwind + CVA).                                                                                                                                                                                                                      |
| `apps/api`               | Fastify: autenticação, autorização, rotas REST, SSE, upload S3. Não executa modelos.                                                                                                                                                                                             |
| `apps/worker`            | Consome a fila e executa planejamento, tarefas e chats. Recupera trabalho órfão no startup.                                                                                                                                                                                      |
| `apps/web`               | Next.js: shell, escritório PixiJS, painéis, páginas. Proxy `/api/*` para a API.                                                                                                                                                                                                  |

## Fluxos principais

### Chat com um agente

1. `POST /api/agents/:id/messages` cria um `agent_run` (`kind=chat`, `status=queued`, `input=conteúdo`) e enfileira `{kind:'chat', runId}`.
2. O worker chama `runChat` → `runAgentTurn`:
   - verifica pausa; **reivindica a sessão** com `UPDATE agent_sessions SET active_run_id=… WHERE active_run_id IS NULL …` (trava otimista + `version++`). Se ocupada → reenfileira com atraso (sem perder a mensagem);
   - resolve o adaptador (demo se o projeto estiver em modo demo; caso contrário decripta a chave do workspace);
   - checa orçamento (projeto, agente, mês do provedor);
   - grava a mensagem do usuário **só agora** (evita intercalar mensagens em execuções concorrentes);
   - carrega **apenas o histórico desta sessão** (últimas N mensagens) e chama `adapter.generate` com streaming;
   - cada delta vira um evento transitório `agent.message.delta` (Redis pub/sub, não persistido);
   - persiste a resposta, `usage_records` (custo pela tabela de preços; `null` se desconhecido), atualiza o run e emite `agent.message`.
3. A API repassa os eventos ao navegador via SSE; o chat mostra o texto em streaming e substitui pela mensagem persistida.

### Missão

```
createMission ─► [plan job] planMission (planejador gera JSON validado por Zod; demo = plano determinístico)
   └► tarefas pending + dependências + approval(mission_plan)  ──►  Diretor aprova
        └► refreshTaskReadiness: sem dependências → ready (enfileira) · com dependências → waiting_dependency
             └► [task job] executeTask: ready→running (atômico) · briefing com handoffs recebidos · runAgentTurn
                  └► artefato (versão nova se já existir) · handoffs consumidos (handoff.completed)
                       ├► requiresApproval → awaiting_approval + approval(task_result)
                       └► completeTask → handoff.created para cada dependente → dependentes prontos
                            └► todas concluídas → mission.completed
```

Limites: ≤ 12 tarefas por missão, dependências só para chaves anteriores (grafo acíclico por construção), profundidade de delegação fixa (o planejador é o único que cria tarefas), ≤ 3 tentativas por tarefa com backoff exponencial, timeout de 5 min por execução, ≤ 8000 tokens de saída, ≤ 4 rodadas de ferramentas por execução.

### Eventos em tempo real

- `emitEvent` grava em `events` (id `bigserial` monotônico) **e depois** publica no canal Redis `ai-office:events:<projectId>`.
- `GET /api/projects/:id/events/stream` assina o canal **antes** de reproduzir o histórico a partir de `Last-Event-ID`/`?since=`, guarda em buffer o que chega durante o replay e descarta ids `<=` ao último enviado → sem lacunas e sem duplicatas.
- Deltas não têm `id:` SSE, então não movem o cursor de retomada.
- O cliente (`useProjectStream`) deduplica por id, reconecta com backoff e invalida caches do React Query por tipo de evento.

### Escritório isométrico

- `office-engine` define projeção 2:1, polígonos das salas, assentos (robôs sentados atrás das mesas, de frente para a câmera) e o reducer `applyEvent`.
- `apps/web/components/office` renderiza com `@pixi/react`: piso, paredes de vidro, móveis desenhados proceduralmente (arte original, sem assets de terceiros), robôs com animação **condicionada ao estado real** (digitando só em `running`), selos de aprovação/erro/fila/pausa, pacote animado em arco entre agentes em `handoff.created` e pulsos em conclusão/erro.
- Câmera: arrastar, pinça, roda do mouse, botões de zoom/enquadrar. Alternativas acessíveis: chips de salas, barra da equipe e visão em lista.

## Modelo de dados (resumo)

`users/sessions/accounts/verifications` (Better Auth) · `workspaces`, `workspace_members` · `projects` · `rooms` · `agents` · `agent_sessions` (1 por agente, trava `active_run_id`) · `messages` (`seq` bigserial por ordem) · `missions` · `tasks` · `task_dependencies` · `agent_runs` · `handoffs` · `artifacts` · `artifact_versions` · `approvals` · `provider_configs` (chave criptografada) · `model_prices` (sobrescritas por workspace) · `usage_records` · `events` (log de eventos = task_events) · `audit_logs`.

FKs com `ON DELETE CASCADE` a partir de projeto/workspace; referências a agentes/tarefas que podem sumir usam `SET NULL` para preservar histórico. Índices nos acessos quentes (`events(project_id,id)`, `messages(session_id,seq)`, etc.).

## Extensibilidade de provedores

Implemente `ProviderAdapter` (`generate`, `listModels`, `verify`) em `packages/agents/src/providers/<novo>.ts`, adicione o id em `PROVIDERS` (shared) e no `pgEnum`, e registre-o em `createAdapter`. Orquestração, UI e eventos não mudam.
