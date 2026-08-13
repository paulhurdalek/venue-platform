import { parseEnvironment, webEnvironmentSchema } from '@venue/configuration';

export const webEnvironment = parseEnvironment(webEnvironmentSchema, {
  NODE_ENV: process.env.NODE_ENV,
  API_BASE_URL: process.env.API_BASE_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});
