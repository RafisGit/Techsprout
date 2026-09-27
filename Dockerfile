# Multi-stage Dockerfile for TechSprout API in pnpm Monorepo
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Dependencies Stage
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Build Stage
FROM dependencies AS builder
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY tsconfig.json ./
RUN pnpm --filter @techsprout/contracts build
RUN pnpm --filter @techsprout/api build

# Production Runner Stage
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/src/database/migrations ./apps/api/src/database/migrations
COPY --from=builder /app/apps/api/src/database/migrate.ts ./apps/api/src/database/migrate.ts
COPY --from=builder /app/apps/api/src/database/seed ./apps/api/src/database/seed
COPY pnpm-workspace.yaml package.json ./

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
