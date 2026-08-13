import { z } from 'zod';

const nodeEnvironment = z.enum(['development', 'test', 'production']);
const logLevel = z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']);

const commaSeparatedUrls = z
  .string()
  .default('http://localhost:3000')
  .transform((value) => value.split(',').map((entry) => entry.trim()))
  .pipe(z.array(z.url()));

export const apiEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironment.default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  CORS_ORIGINS: commaSeparatedUrls,
  LOG_LEVEL: logLevel.default('log'),
  SWAGGER_UI_ENABLED: z.stringbool().default(false),
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
