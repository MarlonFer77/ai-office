# Guia de implantação

> Este repositório **não foi publicado na internet** por esta sessão de desenvolvimento (não havia credenciais de hospedagem). Este guia descreve como fazê-lo.

## Componentes

| Serviço       | Processo                                                | Escala                                          |
| ------------- | ------------------------------------------------------- | ----------------------------------------------- |
| web           | `node apps/web/server.js` (Next standalone)             | horizontal, sem estado                          |
| api           | `node apps/api/dist/server.js`                          | horizontal (SSE usa Redis pub/sub)              |
| worker        | `node apps/worker/dist/main.js`                         | horizontal (`WORKER_CONCURRENCY` por instância) |
| PostgreSQL 16 | gerenciado (RDS, Cloud SQL, Neon, Supabase…)            | —                                               |
| Redis 7       | gerenciado (ElastiCache, Upstash com TCP, Redis Cloud…) | `maxmemory-policy noeviction` (BullMQ)          |
| S3            | AWS S3 / R2 / MinIO                                     | opcional (uploads)                              |

## Imagens Docker

```bash
docker build -f infra/docker/Dockerfile --target api    -t ai-office-api .
docker build -f infra/docker/Dockerfile --target worker -t ai-office-worker .
docker build -f infra/docker/Dockerfile --target web --build-arg API_INTERNAL_URL=http://api:4000 -t ai-office-web .
```

`API_INTERNAL_URL` é lido **no build** do web (os rewrites do Next são serializados no build). Use o endereço interno da API na sua rede.

Stack completa local: `docker compose --profile app up -d --build` (as imagens não foram construídas nesta sessão porque o container de desenvolvimento não tinha daemon Docker; valide no seu ambiente).

## Variáveis obrigatórias em produção

`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` (≥32), `ENCRYPTION_KEY` (≥16, **estável**), `WEB_ORIGIN` e `BETTER_AUTH_URL` (URL pública do web, https), `NODE_ENV=production`, `DEMO_LOGIN_ENABLED=false`. Ver `.env.example`.

## Ordem de deploy

1. Migrações: `RUN_MIGRATIONS=true` na API (aplica no boot) **ou** job `node packages/database/dist/migrate-cli.js`.
2. Subir API e worker; depois web.
3. (Opcional) Seed demo: `node apps/api/dist/scripts/seed.js`.

## Proxy reverso

- Encaminhe tudo para o **web**; o web faz proxy de `/api/*` para a API. Para SSE, desative buffering no proxy (`proxy_buffering off;` no Nginx) e use timeouts de leitura longos (a API envia heartbeat a cada 15 s).
- Alternativa: rotear `/api/*` direto para a API no balanceador (mesma origem), mantendo `/api/projects/*/events/stream` sem buffering.

## Observabilidade

Logs estruturados JSON (pino) com redação de segredos. Para tracing, adicione `@opentelemetry/sdk-node` com auto-instrumentações de HTTP/pg/ioredis no entrypoint de API e worker (pendente — ver PROGRESS).

## Backups

Postgres: snapshots diários + PITR. Redis contém apenas fila e pub/sub; o worker re-enfileira tarefas `ready` e recupera execuções órfãs no startup.
