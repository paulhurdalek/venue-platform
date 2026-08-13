export const DATABASE_HEALTH_PORT = Symbol('DATABASE_HEALTH_PORT');

export interface DatabaseHealthPort {
  isHealthy(): Promise<boolean>;
}
