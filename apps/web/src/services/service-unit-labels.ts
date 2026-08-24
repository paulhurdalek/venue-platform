import type { components } from '@venue/api-client';

export type ServiceUnit = components['schemas']['ServiceDto']['unit'];

const serviceUnitLabels = {
  PIECE: 'Stück',
  HOUR: 'Stunde',
  DAY: 'Tag',
  PERSON: 'Person',
  FLAT_RATE: 'Pauschale',
  PER_GUEST: 'pro Gast',
  PER_TICKET: 'pro Ticket',
} as const satisfies Record<ServiceUnit, string>;

export const serviceUnitOptions = Object.entries(serviceUnitLabels).map(([value, label]) => ({
  value: value as ServiceUnit,
  label,
}));

export function unitLabel(unit: ServiceUnit): string {
  return serviceUnitLabels[unit];
}
