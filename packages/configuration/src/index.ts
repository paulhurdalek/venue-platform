import { z } from 'zod';

const nodeEnvironment = z.enum(['development', 'test', 'production']);
const logLevel = z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']);

const commaSeparatedUrls = z
  .string()
  .default('http://localhost:3000')
  .transform((value) => value.split(',').map((entry) => entry.trim()))
  .pipe(z.array(z.url()));

const localAuthSecret = 'local-development-only-change-before-production-32chars';

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: nodeEnvironment.default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    CORS_ORIGINS: commaSeparatedUrls,
    WEB_PUBLIC_URL: z.url().default('http://localhost:3000'),
    AUTH_PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    AUTH_INTERNAL_BASE_URL: z.url().default('http://localhost:3001'),
    BETTER_AUTH_SECRET: z.string().min(32).default(localAuthSecret),
    BETTER_AUTH_SECRET_PREVIOUS: z.string().min(32).optional(),
    SESSION_DURATION_SECONDS: z.coerce.number().int().min(900).default(604_800),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(10).max(128).default(12),
    BOOTSTRAP_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(900),
    INVITATION_TTL_SECONDS: z.coerce.number().int().min(900).default(604_800),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
    AUTH_SIGN_IN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
    SENSITIVE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    LOG_LEVEL: logLevel.default('log'),
    SWAGGER_UI_ENABLED: z.stringbool().default(false),
  })
  .superRefine((environment, context) => {
    if (!environment.CORS_ORIGINS.includes(environment.WEB_PUBLIC_URL)) {
      context.addIssue({
        code: 'custom',
        message: 'WEB_PUBLIC_URL must be one of CORS_ORIGINS',
        path: ['WEB_PUBLIC_URL'],
      });
    }

    if (
      new URL(environment.AUTH_PUBLIC_BASE_URL).origin !==
      new URL(environment.WEB_PUBLIC_URL).origin
    ) {
      context.addIssue({
        code: 'custom',
        message: 'AUTH_PUBLIC_BASE_URL must use the public web origin',
        path: ['AUTH_PUBLIC_BASE_URL'],
      });
    }

    if (environment.NODE_ENV === 'production') {
      if (
        environment.BETTER_AUTH_SECRET === localAuthSecret ||
        hasWeakSecretPattern(environment.BETTER_AUTH_SECRET)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'A strong production secret is required',
          path: ['BETTER_AUTH_SECRET'],
        });
      }
      if (
        environment.BETTER_AUTH_SECRET_PREVIOUS &&
        hasWeakSecretPattern(environment.BETTER_AUTH_SECRET_PREVIOUS)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'A strong previous production secret is required',
          path: ['BETTER_AUTH_SECRET_PREVIOUS'],
        });
      }
      for (const origin of [environment.WEB_PUBLIC_URL, ...environment.CORS_ORIGINS]) {
        if (new URL(origin).protocol !== 'https:') {
          context.addIssue({
            code: 'custom',
            message: 'Public production origins must use HTTPS',
            path: ['WEB_PUBLIC_URL'],
          });
          break;
        }
      }
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const workerEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironment.default('development'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  LOG_LEVEL: logLevel.default('log'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const webEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironment.default('development'),
  API_BASE_URL: z.url().default('http://localhost:3001'),
  NEXT_PUBLIC_API_BASE_URL: z.url().default('http://localhost:3001'),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export function parseEnvironment<T>(
  schema: z.ZodType<T>,
  input: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration. Check: ${fields}`);
  }

  return result.data;
}

function hasWeakSecretPattern(secret: string): boolean {
  return (
    new Set(secret).size < 12 ||
    /^(.)\1+$/.test(secret) ||
    /(change|example|local|password|test-only|never-use|development)/i.test(secret)
  );
}
