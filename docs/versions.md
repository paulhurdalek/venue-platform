# Pinned versions

Versions were checked against the package registry and upstream PostgreSQL releases on 2026-08-13.
All entries are exact in the manifests or container definitions; `pnpm-lock.yaml` fixes their full
dependency graphs.

| Component                           | Version       |
| ----------------------------------- | ------------- |
| Node.js                             | 24.18.0       |
| pnpm                                | 11.21.0       |
| TypeScript                          | 5.9.3         |
| Next.js                             | 16.3.0        |
| React / React DOM                   | 19.2.8        |
| NestJS core/common/platform/testing | 11.1.29       |
| NestJS Swagger                      | 11.4.6        |
| Prisma CLI/client/adapter           | 7.9.1         |
| PostgreSQL container                | 18.4-bookworm |
| Better Auth / Prisma adapter        | 1.6.25        |
| Express                             | 5.1.0         |
| `pg` driver                         | 8.23.0        |
| OpenAPI TypeScript                  | 7.13.0        |
| OpenAPI Fetch                       | 0.17.0        |
| Playwright                          | 1.62.1        |
| Vitest                              | 4.1.10        |
| ESLint                              | 10.8.1        |
| typescript-eslint                   | 8.67.0        |
| Prettier                            | 3.9.6         |
| Zod                                 | 4.4.3         |

TypeScript 5.9.3 is deliberately the newest stable version accepted by every selected tool. The
newer TypeScript major is outside `openapi-typescript`'s and typescript-eslint's peer ranges, so
selecting it would violate the compatibility requirement. Node type declarations stay on the Node
24 line to match the runtime.

The `js-yaml` 5.2.3 workspace override is a compatible security patch for NestJS Swagger's 5.2.1
pin. It should be removed after the upstream constraint includes a non-vulnerable release.
