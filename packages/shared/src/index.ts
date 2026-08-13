export const API_GLOBAL_PREFIX = 'api';
export const API_VERSION = '1';

export type ServiceStatus = 'up' | 'down';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    application: { status: ServiceStatus };
    database: { status: ServiceStatus };
  };
}
