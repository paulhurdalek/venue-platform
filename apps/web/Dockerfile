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
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV API_BASE_URL=http://api:3001
ENV NEXT_PUBLIC_API_BASE_URL=http://api:3001
RUN pnpm api:generate && pnpm --filter @venue/web build

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
