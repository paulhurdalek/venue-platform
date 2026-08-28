import type { components } from '@venue/api-client';

import { formatMinorAmount } from '../booking-utils';

type DealComponent = components['schemas']['DealComponentDto'];
type DealServicePosition = components['schemas']['DealServicePositionDto'];
type DiscountType = 'FIXED' | 'PERCENTAGE' | null | undefined;

export function dealTemplateSummary(components: DealComponent[]): string {
  if (components.length === 0) return 'Keine Deal-Bausteine';
  const summaries = components.map(dealComponentSummary);
  return summaries.length <= 2
    ? summaries.join(' · ')
    : `${summaries.slice(0, 2).join(' · ')} · +${summaries.length - 2} weitere`;
}

export function dealComponentSummary(component: DealComponent): string {
  if (component.type === 'FIXED_RENT') return 'Feste Miete';
  const split = `${basisPoints(component.locationShareBasisPoints)}/${basisPoints(component.counterpartyShareBasisPoints)}`;
  const wkz = component.includeWkz ? 'WKZ enthalten' : 'WKZ ausgeschlossen';
  return component.type === 'MINIMUM_GUARANTEE_SHARE'
    ? `Mindestgarantie + Beteiligung ${split} · ${wkz}`
    : `Umsatzbeteiligung ${split} · ${wkz}`;
}

export function discountLabel(
  type: DiscountType,
  fixedMinor: string | null | undefined,
  percentageBasisPoints: number | null | undefined,
): string | null {
  if (type === 'FIXED' && fixedMinor != null) return `${money(fixedMinor)} Festbetrag`;
  if (type === 'PERCENTAGE' && percentageBasisPoints != null)
    return `${basisPoints(percentageBasisPoints)} %`;
  return null;
}

export function positionMeta(position: DealServicePosition): string {
  return `${quantity(position.quantity)} ${unitLabel(position.unit)} · ${basisPoints(position.taxRateBasisPoints)} % USt.`;
}

export function money(value: string | null | undefined): string {
  return formatMinorAmount(value, 'EUR') ?? 'Betrag offen';
}

export function basisPoints(value: number | null | undefined): string {
  if (value == null) return '–';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value / 100);
}

function quantity(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(parsed)
    : value;
}

function unitLabel(unit: DealServicePosition['unit']): string {
  return (
    {
      PIECE: 'Stück',
      HOUR: 'Stunden',
      DAY: 'Tage',
      PERSON: 'Personen',
      FLAT_RATE: 'Pauschalen',
      PER_GUEST: 'je Gast',
      PER_TICKET: 'je Ticket',
    } satisfies Record<DealServicePosition['unit'], string>
  )[unit];
}
