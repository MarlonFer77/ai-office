# Progresso

_Última atualização: 2026-11-02_

## Fases concluídas

1–8 (ver `IMPLEMENTATION_PLAN.md`). Commits locais organizados por fase na branch `main`.

## Verificações executadas nesta sessão (todas aprovadas)

| Verificação                   | Comando                             | Resultado                                                                                                                                                       |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatação                    | `pnpm format:check`                 | ok                                                                                                                                                              |
| Lint                          | `pnpm lint`                         | 9/9 pacotes ok                                                                                                                                                  |
| Typecheck                     | `pnpm typecheck`                    | ok                                                                                                                                                              |
| Build de produção             | `pnpm build`                        | ok (Next: 14 rotas)                                                                                                                                             |
| Testes unitários + integração | `pnpm test`                         | **59 testes** — shared 3, agents 17, office-engine 8, orchestrator 9 (Postgres real), api 11 (Postgres real, SSE real), worker 1 (BullMQ + Redis reais), web 10 |
| End-to-end                    | `E2E_START_SERVERS=1 pnpm test:e2e` | 2/2 — fluxo completo demo pela UI                                                                                                                               |
| Verificação visual            | Playwright (capturas)               | escritório, chat em streaming, painel de sala, celular                                                                                                          |

Ambiente de verificação: Node 22.23, PostgreSQL 16 e Redis 7 nativos (o daemon Docker não estava disponível no container).

## Funcionando

Contas e sessões; workspace automático; projetos (CRUD, arquivamento, modo demo/real, orçamento); 7 salas clicáveis; agentes configuráveis (provedor, modelo, função, prompt, permissões, limites, pausa, remoção); sessões independentes com continuidade; chat com streaming e interrupção; missões com plano aprovado por humano, dependências, prioridades, retentativas com backoff, cancelamento, reexecução manual; handoffs formais com animação; artefatos versionados, busca, download, upload S3; aprovações com feedback; eventos SSE persistidos com replay e deduplicação; consumo e custo por agente/modelo com limites e alertas; auditoria; configuração de provedores com verificação real; tabela de preços editável; visão em lista para celulares.

## Depende de credenciais externas

- Chamadas reais à Anthropic/OpenAI: adaptadores implementados e testados contra respostas HTTP simuladas dos SDKs oficiais; **não foram feitas chamadas reais** (não havia chaves).
- Upload de documentos: requer S3/MinIO (`S3_*`). Rota implementada; não exercitada aqui (sem MinIO no container).
- Publicação no GitHub: o repositório `ai-office` não existe e o token do `gh` no container é inválido (ver relatório final).

## Problemas conhecidos / pendências

- Imagens Docker e `docker compose` escritos mas **não construídos** aqui (sem daemon Docker).
- OpenTelemetry ainda não instrumentado (logs estruturados sim).
- Sem UI para convidar membros ao workspace.
- O plano pode ser aprovado ou rejeitado, mas não editado manualmente.
- Robôs sem sprite sheet raster: arte procedural original em PixiJS (decisão 12).

## Próxima tarefa concreta

Criar o repositório privado `ai-office` no GitHub (ou conceder permissão) e executar `git push -u origin main`; em seguida, verificar o workflow de CI no GitHub Actions.
