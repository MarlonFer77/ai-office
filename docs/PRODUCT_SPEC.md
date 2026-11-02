# Especificação do produto — AI Office

**Categoria:** plataforma de orquestração multiagente com interface gamificada.
**Princípio:** o escritório é a representação visual de um sistema real de agentes. A animação reflete o estado do sistema, nunca o contrário.

## Personas

- **Diretor(a)** — usuário dono do workspace: cria projetos, monta a equipe, define missões, aprova planos e entregas, acompanha custo.

## Conceitos

| Conceito  | Definição                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace | Unidade de isolamento (criado no primeiro acesso).                                                                                         |
| Projeto   | Objetivo + equipe + salas + missões + entregas + consumo. Modo `demo` ou `real`.                                                           |
| Sala      | 7 por projeto: Estratégia, Pesquisa, Produção, Criação, Revisão, Reuniões, Diretor. Coordenadas, identidade visual, agentes, atividades.   |
| Agente    | Instância independente: nome, avatar, provedor, modelo, função, prompt de sistema, sessão própria, permissões, limites.                    |
| Missão    | Objetivo geral que o planejador transforma em tarefas (revisão humana obrigatória).                                                        |
| Tarefa    | Unidade de trabalho com estado, prioridade, dependências, tentativas, agente e artefato de resultado.                                      |
| Handoff   | Transferência formal de entrega/contexto limitado entre agentes, com origem, destino, tarefa, instrução, resumo, artefatos, data e status. |
| Artefato  | Entrega versionada (texto, markdown, JSON, código, documento, relatório, referência externa).                                              |
| Aprovação | Decisão humana sobre plano de missão ou entrega final.                                                                                     |

## Estados

- Agente: `idle`, `queued`, `running`, `awaiting_approval`, `paused`, `error`, `disconnected`.
- Tarefa: `pending`, `ready`, `running`, `waiting_dependency`, `awaiting_approval`, `completed`, `failed`, `cancelled`.
- Missão: `planning`, `awaiting_plan_approval`, `running`, `awaiting_final_approval`, `completed`, `failed`, `cancelled`.

## Fluxo de primeiro acesso

Criar conta → assistente de projeto (nome/objetivo → modo demo/real → equipe recomendada ou vazia) → escritório → definir missão → aprovar plano → acompanhar execução → conversar com agentes → aprovar/reprovar entregas → biblioteca.

## Telas

Escritório (canvas + feed + equipe + painéis de sala/agente) · Projetos (lista, assistente, configurações/arquivamento) · Agentes · Tarefas/Missões · Entregas (aprovações, entregas, decisões) · Biblioteca (busca, versões, download, nova versão, upload) · Histórico (eventos paginados, auditoria) · Configurações (provedores, preços, consumo).

## Modo demonstração × real

- Demo: provedor local determinístico; todas as mensagens, eventos e artefatos carregam o selo **DEMO**; custo zero; não exige chaves.
- Real: chamadas aos SDKs oficiais com as chaves do workspace; consumo e custo registrados; o projeto não cai silenciosamente para demo (agentes `demo` continuam rotulados).

## Fora do escopo desta versão

Execução de código gerada por IA, acesso à internet por agentes, publicação externa, multiusuário por workspace (modelo pronto, UI de convite pendente), SSO.
