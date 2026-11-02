# AI Office

**Escritório virtual isométrico para orquestrar agentes de IA reais.**
Cada funcionário do escritório é uma instância independente de um agente (Anthropic ou OpenAI) com sessão, histórico, função e limites próprios. Você define uma missão, aprova o plano, acompanha a execução em tempo real, conversa com qualquer agente e revisa as entregas. A animação reflete o estado real do sistema — nunca o contrário.

![Escritório](docs/images/office.png)

| Aprovação do plano            | Chat com streaming        | Tarefas e handoffs         | Celular                     |
| ----------------------------- | ------------------------- | -------------------------- | --------------------------- |
| ![](docs/images/approval.png) | ![](docs/images/chat.png) | ![](docs/images/tasks.png) | ![](docs/images/mobile.png) |

## Destaques

- **Escritório isométrico** (PixiJS): 7 salas clicáveis, robôs com estados reais (ocioso, executando, na fila, aguardando aprovação, pausado, erro), animação de handoff entre agentes, câmera com pan/zoom/pinça.
- **Agentes independentes**: várias instâncias do mesmo modelo com históricos separados e persistentes; trava de concorrência por sessão.
- **Orquestrador multiagente**: missão → plano estruturado (validado) → aprovação humana → tarefas com dependências, prioridade, retentativas, cancelamento → handoffs formais → artefatos versionados → aprovação final.
- **Tempo real** via SSE com replay por `Last-Event-ID` e sem duplicatas.
- **Modo demonstração** sem chaves de API (tudo rotulado como DEMO) e **modo real** com os SDKs oficiais.
- **Governança**: autenticação, autorização por workspace, chaves criptografadas, limites de gasto/execução, auditoria.

## Stack

pnpm + Turborepo · TypeScript strict · Next.js 16 (App Router) · React 19 · Tailwind 4 · componentes estilo shadcn/ui (Radix) · Lucide · Motion · Zustand · TanStack Query · PixiJS 8 + @pixi/react · Fastify 5 · Zod 4 · PostgreSQL + Drizzle · Redis + BullMQ · Better Auth · `@anthropic-ai/sdk` · `openai` · S3/MinIO · Vitest · Playwright · GitHub Actions · Docker.

## Estrutura

```
apps/
  web/        Next.js — escritório, painéis e páginas (proxy /api → API)
  api/        Fastify — auth, REST, SSE, uploads
  worker/     BullMQ — planejamento, tarefas, chats
packages/
  shared/         domínio, eventos, schemas Zod, plantas das salas
  database/       schema Drizzle + migrações
  agents/         adaptadores Anthropic/OpenAI/Demo, preços, prompts, cripto
  orchestrator/   missões, tarefas, handoffs, sessões, consumo, eventos
  office-engine/  projeção isométrica, layout, reducer de estado visual
  ui/             design system
infra/docker/  Dockerfile multi-target · docs/ · tests/e2e/ · .github/workflows/
```

## Começando (desenvolvimento local)

Requisitos: Node ≥ 22, pnpm 10, Docker (ou PostgreSQL 16 + Redis 7 instalados).

```bash
pnpm install
```

```bash
cp .env.example .env   # depois gere BETTER_AUTH_SECRET e ENCRYPTION_KEY (openssl rand -base64 48)
```

```bash
pnpm services:up       # PostgreSQL, Redis e MinIO (cria também o banco aioffice_test)
```

```bash
pnpm build && pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev               # web :3000 · api :4000 · worker
```

Abra http://localhost:3000 e clique em **Explorar o escritório demo** (usuário `demo@aioffice.dev` / `aioffice-demo`, criado pelo seed com uma missão já executada), ou crie sua conta.

> O worker é um processo separado: a execução das tarefas não depende de nenhuma requisição HTTP aberta.

### Comandos

| Comando                                              | Ação                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                           | web, API e worker em modo watch                                            |
| `pnpm build`                                         | build de produção de todos os pacotes                                      |
| `pnpm start`                                         | inicia os builds de produção                                               |
| `pnpm db:generate`                                   | gera migração a partir do schema                                           |
| `pnpm db:migrate`                                    | aplica migrações                                                           |
| `pnpm db:seed`                                       | cria usuário e escritório demo                                             |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | qualidade                                                                  |
| `pnpm test`                                          | testes unitários e de integração (exigem Postgres e Redis)                 |
| `pnpm test:e2e`                                      | Playwright (servidores em execução; `E2E_START_SERVERS=1` para iniciá-los) |
| `docker compose --profile app up -d --build`         | stack completa em containers                                               |

## Configurando as APIs de IA (modo real)

1. **Configurações → Provedores**: informe a chave da Anthropic e/ou da OpenAI. Ela é criptografada no servidor (AES-256-GCM) e nunca volta ao navegador.
2. **Verificar conexão**: lista os modelos disponíveis direto da API do provedor.
3. Escolha o modelo padrão, um limite mensal (opcional) e salve.
4. No projeto, mude o modo para **Real** (assistente ou configurações do projeto) e configure cada agente com provedor e modelo.
5. **Configurações → Preços**: preços da Anthropic vêm pré-carregados da tabela publicada; os da OpenAI devem ser informados por você a partir da página oficial. Sem preço, o custo aparece como "desconhecido".

As variáveis de ambiente estão documentadas em [`.env.example`](.env.example).

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) · [Especificação do produto](docs/PRODUCT_SPEC.md) · [Plano](docs/IMPLEMENTATION_PLAN.md)
- [Progresso e pendências](docs/PROGRESS.md) · [Decisões](docs/DECISIONS.md)
- [Implantação](docs/DEPLOYMENT.md) · [Segurança](docs/SECURITY.md)

## Estado atual

Verificado nesta versão: lint, typecheck, build de produção, **59 testes** unitários/integração (com Postgres, Redis e BullMQ reais) e **e2e** do fluxo completo em modo demonstração pela UI. Os adaptadores Anthropic/OpenAI foram testados com respostas HTTP simuladas dos SDKs oficiais; chamadas reais dependem das suas chaves. Detalhes e limitações em [docs/PROGRESS.md](docs/PROGRESS.md).
