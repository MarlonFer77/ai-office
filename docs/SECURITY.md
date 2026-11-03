# Segurança e governança

## Implementado

- **Autenticação** Better Auth (e-mail/senha, scrypt), sessões em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, expiração de 7 dias.
- **Autorização por recurso**: toda rota carrega o recurso e verifica se o usuário é membro do workspace do projeto; recursos alheios retornam **404** (não vazam existência). Coberto por testes (`apps/api/src/api.test.ts`).
- **Isolamento**: cada agente tem sessão própria; o histórico enviado ao modelo vem só daquela sessão. Handoffs compartilham apenas um resumo limitado (4000 caracteres) e referências a artefatos.
- **Validação** com Zod em todas as entradas; limites de tamanho (mensagens 20k, conteúdo 2 MB, upload 5 MB, body 8 MB).
- **Rate limiting**: global 600/min por IP, auth 30/min, chat 30/min, verificação de provedor 10/min; Better Auth com limite próprio por IP (`X-Forwarded-For`).
- **CORS** restrito a `WEB_ORIGIN`; **Helmet** na API; cabeçalhos de segurança no Next (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
- **Segredos**: chaves de provedores criptografadas (AES-256-GCM, IV aleatório, tag de autenticação); nunca retornadas pela API nem logadas (redação no pino). `.env` fora do Git.
- **Auditoria** (`audit_logs`): criação/edição de projeto e agente, credenciais, preços, missões, aprovações, cancelamentos, uploads.
- **Limites de gasto**: por projeto, por agente e mensal por provedor; checados antes de cada execução real (bloqueio + `budget.exceeded`) e alerta a 80% (`budget.warning`).
- **Limites de execução**: timeout, tokens de saída, tentativas, tarefas por missão, rodadas de ferramentas.
- **Conteúdo não confiável**: respostas de modelos são renderizadas como Markdown **sem HTML** (`skipHtml`), links só `http(s)/mailto` com `rel="noopener noreferrer nofollow"`; downloads sempre como anexo `text/*` + `nosniff`. Briefings marcam entregas e resultados de ferramentas como dados não confiáveis; o prompt de sistema proíbe alterar permissões com base nelas. Permissões são aplicadas no servidor — o modelo não consegue concedê-las.
- **Sem execução de código / shell / rede** por agentes. As permissões `execute_code`, `external_network` e `publish_external` existem no modelo de dados, mas ficam bloqueadas na UI e não têm ferramenta associada.
- **Falhas de provedor** normalizadas (`auth`, `rate_limit`, `unavailable`, `refusal`, `budget`, `aborted`), sem incluir credenciais em mensagens.

- **SSRF**: provedores externos (Groq, OpenRouter, Anthropic, OpenAI) têm endereço fixo no servidor. Só o Ollama aceita URL personalizada, e apenas quando `ALLOW_CUSTOM_PROVIDER_URLS=true` (padrão fora de produção). Desative em implantações multiusuário.
- **Dados enviados a terceiros**: planos gratuitos externos podem ter termos próprios de uso de dados; a tela de configurações alerta para não enviar dados sensíveis.

## Recomendações para produção

- Usar KMS/Secret Manager para `ENCRYPTION_KEY` e `BETTER_AUTH_SECRET`; planejar rotação (re-criptografar `provider_configs`).
- Configurar `trustProxy` do Fastify para o IP do proxy real (hoje `true`, adequado atrás do proxy do Next/balanceador; sem proxy confiável o `X-Forwarded-For` pode ser forjado).
- Ativar verificação de e-mail e/ou SSO no Better Auth; desativar `DEMO_LOGIN_ENABLED`.
- Antivírus/validação de tipo para uploads; bucket privado (já configurado no `minio-init`).
- Qualquer futura execução de código gerado por IA deve ocorrer em sandbox isolado (ex.: microVM/gVisor), sem rede por padrão, com cotas de CPU/memória/tempo e aprovação explícita.
