FROM node:24.18.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS dependencies
COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
RUN pnpm packages:build && pnpm --filter @venue/api build
RUN pnpm --filter @venue/api deploy --prod --legacy /opt/venue-api

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
RUN groupadd --system --gid 1001 venue && useradd --system --uid 1001 --gid venue venue
COPY --from=build --chown=venue:venue /opt/venue-api ./
USER venue
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
