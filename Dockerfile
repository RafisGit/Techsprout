# Multi-stage Dockerfile for TechSprout API in pnpm Monorepo
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Dependencies Stage (includes all dependencies for compilation)
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Build Stage
FROM dependencies AS builder
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY tsconfig.json ./
RUN pnpm --filter @techsprout/contracts build
RUN pnpm --filter @techsprout/api build

# Production Dependencies Stage (only production dependencies, devDependencies pruned)
FROM base AS prod-dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --prod --frozen-lockfile

# Production Runner Stage
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# Set non-root ownership for working directory
RUN chown -R node:node /app

# Production node_modules containing only runtime dependencies
COPY --chown=node:node --from=prod-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=prod-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=prod-dependencies /app/packages/contracts/node_modules ./packages/contracts/node_modules

# Compiled artifacts and required schema/migration files
COPY --chown=node:node --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/apps/api/src/database/migrations ./apps/api/src/database/migrations
COPY --chown=node:node --from=builder /app/apps/api/src/database/migrations ./apps/api/dist/database/migrations
COPY --chown=node:node --from=builder /app/apps/api/src/modules/media/migration-manifest.json ./apps/api/src/modules/media/migration-manifest.json
COPY --chown=node:node --from=builder /app/pnpm-workspace.yaml /app/package.json ./

# Entrypoint script
COPY --chown=node:node docker/api-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Run as non-root node user
USER node

EXPOSE 3001

# Container healthcheck via existing /api/v1/health endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
