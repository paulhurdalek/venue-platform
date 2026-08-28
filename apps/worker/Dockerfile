# syntax=docker/dockerfile:1

FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS dependencies
COPY . .
RUN --mount=type=cache,id=venue-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --prefer-offline

FROM dependencies AS build
RUN pnpm packages:build && pnpm --filter @venue/worker build

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 venue && useradd --system --uid 1001 --gid venue venue
COPY --from=build --chown=venue:venue /app/node_modules ./node_modules
COPY --from=build --chown=venue:venue /app/apps/worker ./apps/worker
COPY --from=build --chown=venue:venue /app/packages/configuration ./packages/configuration
COPY --from=build --chown=venue:venue /app/packages/database ./packages/database
COPY --from=build --chown=venue:venue /app/packages/shared ./packages/shared
USER venue
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "try{process.kill(1,0)}catch{process.exit(1)}"
CMD ["node", "apps/worker/dist/main.js"]
