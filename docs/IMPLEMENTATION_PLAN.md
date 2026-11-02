# Plano de implementação

| Fase                  | Conteúdo                                                                                        | Situação                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1 — Fundação          | Monorepo pnpm/Turborepo, TS strict, schema e migrações, Better Auth, API base, Docker Compose   | ✅                                                             |
| 2 — Interface         | Design system, layout, sidebar/topbar, painéis, cena isométrica, salas, personagens, interações | ✅                                                             |
| 3 — Persistência      | CRUD de projetos/agentes, sessões independentes, mensagens, tarefas, entregas, seed demo        | ✅                                                             |
| 4 — Integrações       | Adaptadores Anthropic e OpenAI (streaming, ferramentas, erros, abort, consumo), isolamento      | ✅ (testado com mocks HTTP; chamadas reais dependem de chaves) |
| 5 — Orquestração      | BullMQ, worker, dependências, handoffs, aprovações, eventos em tempo real                       | ✅                                                             |
| 6 — Integração visual | Eventos → avatares, feed, animação de handoff, salas ↔ chats/tarefas                            | ✅                                                             |
| 7 — Qualidade         | Testes unitários/integração/e2e, revisão de segurança, acessibilidade essencial                 | ✅ (ver PROGRESS para pendências)                              |
| 8 — Entrega           | README, docs, Dockerfile de produção, CI, commits                                               | ✅ local · ⏳ push no GitHub depende de permissão              |

## Próximos incrementos sugeridos

1. OpenTelemetry (SDK Node + auto-instrumentação) na API e no worker.
2. Convites/membros de workspace na UI (modelo já existe).
3. Adaptador OpenAI Responses API e fallbacks de recusa da Anthropic (`fallbacks`) para modelos que suportam.
4. Edição manual do plano antes da aprovação (hoje: aprovar ou rejeitar).
5. Prompt caching (`cache_control`) para históricos longos na Anthropic.
6. Sandbox isolado para a permissão `execute_code`.
