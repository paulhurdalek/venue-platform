# Environment variables

Actual secrets are supplied out of band. `.env.example` and `.env.test.example` contain only
explicit local-only values. Environment parsing reports invalid field names, never submitted
values.

| Variable                   | Used by             | Required/default                 | Description                                     |
| -------------------------- | ------------------- | -------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                 | all                 | `development`                    | `development`, `test`, or `production`          |
| `DATABASE_URL`             | API, worker, Prisma | required at app startup          | PostgreSQL connection URL; sensitive            |
| `TEST_DATABASE_URL`        | DB test             | optional locally, required in CI | Isolated PostgreSQL test URL; sensitive         |
| `PORT`                     | API                 | `3001`                           | API listen port                                 |
| `CORS_ORIGINS`             | API                 | `http://localhost:3000`          | Comma-separated, exact allowed origins          |
| `LOG_LEVEL`                | API, worker         | `log`                            | Minimum structured console-log level            |
| `SWAGGER_UI_ENABLED`       | API                 | `false`                          | Enables UI only outside production              |
| `API_BASE_URL`             | Web server          | `http://localhost:3001`          | Server-side API origin                          |
| `NEXT_PUBLIC_API_BASE_URL` | Web                 | `http://localhost:3001`          | Public API origin reserved for later client use |
| `WORKER_POLL_INTERVAL_MS`  | Worker              | `5000`                           | Reserved Phase 0 cadence; no jobs poll yet      |

`DATABASE_URL`, `TEST_DATABASE_URL`, and any future tokens must be marked secret in CI/deployment
systems. They must not be logged, exposed with a `NEXT_PUBLIC_` prefix, or baked into images.
