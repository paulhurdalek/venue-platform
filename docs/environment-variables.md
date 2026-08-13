# Environment variables

Actual secrets are supplied out of band. `.env.example` and `.env.test.example` contain only
local/test values. Validation reports field names, never rejected values. Production startup fails
for any committed example/weak Better Auth secret, a weak previous rotation secret, non-HTTPS
public origins, or a Better Auth public origin that differs from the web origin.

| Variable                      | Used by             | Default/requirement                               | Purpose                                            |
| ----------------------------- | ------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                    | all                 | `development`                                     | `development`, `test`, or `production`             |
| `DATABASE_URL`                | API, worker, Prisma | required                                          | PostgreSQL URL; secret                             |
| `TEST_DATABASE_URL`           | DB/API/E2E tests    | required for explicit DB tests                    | Isolated PostgreSQL URL                            |
| `PORT`                        | API                 | `3001`                                            | Listen port                                        |
| `CORS_ORIGINS`                | API/Auth            | `http://localhost:3000`                           | Comma-separated exact trusted browser origins      |
| `WEB_PUBLIC_URL`              | API links           | `http://localhost:3000`                           | Public web origin; must occur in `CORS_ORIGINS`    |
| `AUTH_PUBLIC_BASE_URL`        | Better Auth         | `http://localhost:3000`                           | Browser-visible same-origin Auth base              |
| `AUTH_INTERNAL_BASE_URL`      | operations          | `http://localhost:3001`                           | Internal API/Auth origin for deployment wiring     |
| `BETTER_AUTH_SECRET`          | Better Auth         | local-only default; strong required in production | Current signing/encryption secret                  |
| `BETTER_AUTH_SECRET_PREVIOUS` | Better Auth         | optional                                          | Previous secret accepted during supported rotation |
| `SESSION_DURATION_SECONDS`    | Better Auth         | `604800` (7 days), minimum 900                    | Database session lifetime                          |
| `PASSWORD_MIN_LENGTH`         | Auth/setup/invite   | `12`, range 10–128                                | Minimum new password length                        |
| `BOOTSTRAP_TOKEN_TTL_SECONDS` | setup               | `900` (15 minutes), minimum 300                   | Setup-link lifetime                                |
| `INVITATION_TTL_SECONDS`      | invitations         | `604800` (7 days), minimum 900                    | Invitation lifetime                                |
| `RATE_LIMIT_WINDOW_SECONDS`   | API/Auth            | `60`                                              | Counter window                                     |
| `RATE_LIMIT_MAX_REQUESTS`     | Better Auth         | `100`                                             | General auth maximum per window                    |
| `AUTH_SIGN_IN_RATE_LIMIT_MAX` | Better Auth         | `5`                                               | Email sign-in maximum per window                   |
| `SENSITIVE_RATE_LIMIT_MAX`    | setup/invitations   | `10`                                              | Sensitive business endpoint maximum per window     |
| `LOG_LEVEL`                   | API, worker         | `log`                                             | Minimum structured console level                   |
| `SWAGGER_UI_ENABLED`          | API                 | `false`                                           | Development UI only; ignored in production         |
| `API_BASE_URL`                | Next server         | `http://localhost:3001`                           | Internal server-to-API origin                      |
| `NEXT_PUBLIC_API_BASE_URL`    | browser client      | `http://localhost:3001`                           | Same-origin URL in recommended deployments         |
| `WORKER_POLL_INTERVAL_MS`     | worker              | `5000`                                            | Reserved cadence; no Phase 1 jobs                  |

Rotate the Better Auth secret by deploying the new value as `BETTER_AUTH_SECRET` and the old value
as `BETTER_AUTH_SECRET_PREVIOUS`. After the maximum session lifetime has passed, deploy again
without the previous value. Never give either value a `NEXT_PUBLIC_` prefix.
