# syntax=docker/dockerfile:1.7
# Multi-target image for the AI Office monorepo.
#   docker build -f infra/docker/Dockerfile --target api    -t ai-office-api .
#   docker build -f infra/docker/Dockerfile --target worker -t ai-office-worker .
#   docker build -f infra/docker/Dockerfile --target web --build-arg API_INTERNAL_URL=http://api:4000 -t ai-office-web .

ARG NODE_VERSION=22.23.4

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/agents/package.json packages/agents/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/office-engine/package.json packages/office-engine/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
COPY . .
RUN pnpm turbo run build

# ---------- API (Fastify) ----------
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /repo /repo
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "apps/api/dist/server.js"]

# ---------- Worker (BullMQ) ----------
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /repo /repo
USER node
CMD ["node", "apps/worker/dist/main.js"]

# ---------- Web (Next.js standalone) ----------
FROM node:${NODE_VERSION}-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
