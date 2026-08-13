import { parseEnvironment, webEnvironmentSchema } from '@venue/configuration';

export const webEnvironment = parseEnvironment(webEnvironmentSchema, process.env);
