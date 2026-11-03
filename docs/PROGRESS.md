# Progresso

_Última atualização: 2026-11-03_

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

## Incremento 2026-11-03 — provedores sem custo

- Novos provedores compatíveis com OpenAI: **Groq** (foco: plano gratuito), **OpenRouter** e **Ollama (local)**, com migração `0002_compatible_providers`.
- Limites por provedor: concorrência, tokens de saída, orçamento de histórico; espera de 20 s × tentativa em erros 429.
- Custo US$ 0 para Ollama e contas marcadas como plano gratuito.
- Testes novos: adaptador (Groq com `max_tokens`, `x_groq.usage`, repetição sem ferramentas, 429), orquestrador (custo zero, corte de histórico, limite de concorrência com reenfileiramento, equipe inicial no Groq) e API (configuração, proteção de URL, fluxo completo contra um servidor compatível real em HTTP).
- **Verificado ao vivo com o Groq (2026-11-03)**: chave salva criptografada, verificação de conexão pela Models API, chat real (`openai/gpt-oss-20b`, 630→188 tokens) com histórico isolado, e uma missão real completa — plano gerado pelo modelo e validado, 7 tarefas, 7 handoffs, 2 aprovações humanas, ~156 s, 9 execuções, ~40k tokens de entrada, custo registrado US$ 0, sem erros 429.
- Em redes com proxy, o Node precisa de `NODE_USE_ENV_PROXY=1` para alcançar os provedores (documentado em `.env.example`).

## Depende de credenciais externas

- Chamadas reais à Anthropic/OpenAI: adaptadores implementados e testados contra respostas HTTP simuladas dos SDKs oficiais; **não foram feitas chamadas reais** (não havia chaves).
- Upload de documentos: requer S3/MinIO (`S3_*`). Rota implementada; não exercitada aqui (sem MinIO no container).
- Publicação no GitHub: ✅ concluída em https://github.com/MarlonFer77/ai-office (privado). CI no GitHub Actions aprovado no primeiro push (format, lint, build, typecheck, testes, migração + seed, e2e).

## Problemas conhecidos / pendências

- Imagens Docker e `docker compose` escritos mas **não construídos** aqui (sem daemon Docker).
- OpenTelemetry ainda não instrumentado (logs estruturados sim).
- Sem UI para convidar membros ao workspace.
- O plano pode ser aprovado ou rejeitado, mas não editado manualmente.
- Robôs sem sprite sheet raster: arte procedural original em PixiJS (decisão 12).

## Próxima tarefa concreta

Fazer a primeira execução em modo real: configurar uma chave Anthropic/OpenAI em Configurações → Provedores, verificar a conexão e rodar uma missão curta num projeto em modo real com limite de gasto baixo. Em seguida, instrumentar OpenTelemetry na API e no worker.
