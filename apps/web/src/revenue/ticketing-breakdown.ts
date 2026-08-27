import type { components } from '@venue/api-client';

import { formatMinorAmount } from '../booking-utils';

type RevenuePlan = components['schemas']['RevenuePlanDto'];
type Tier = components['schemas']['TicketPriceTierDto'];

export function ticketTaxMinor(tier: Tier): string | null {
  if (tier.baseNetUnitMinor == null || tier.baseGrossUnitMinor == null) return null;
  return (BigInt(tier.baseGrossUnitMinor) - BigInt(tier.baseNetUnitMinor)).toString();
}

export function ticketProviderSummary(tiers: Tier[]): string | null {
  const providers = [
    ...new Set(
      tiers
        .map((tier) => tier.sourceTicketProviderNameSnapshot?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (providers.length === 0) return null;
  return providers.join(', ');
}

export function ticketingBreakdownText(
  plan: RevenuePlan,
  eventDate: string,
  locationName: string,
): string {
  const tiers = plan.ticketTiers.filter((tier) => tier.status === 'ACTIVE');
  const provider = ticketProviderSummary(tiers);
  const lines = [
    plan.eventName,
    `Datum: ${formatDate(eventDate)}`,
    `Location: ${locationName}`,
    ...(provider ? [`Ticketanbieter: ${provider}`] : []),
    'Versand: zzgl. Versand, sofern abhängig von der Versandart und nicht im Ticketpreis enthalten.',
  ];

  for (const tier of tiers) {
    const components = tier.components.filter((component) => component.status === 'ACTIVE');
    lines.push(
      '',
      `${tier.name.toLocaleUpperCase('de-DE')} · ${tier.expectedQuantity} Tickets`,
      `Grundpreis netto: ${money(tier.baseNetUnitMinor)}`,
      `Umsatzsteuer ${basisPoints(tier.baseTaxRateBasisPoints)}: ${money(ticketTaxMinor(tier))}`,
      `Grundpreis brutto: ${money(tier.baseGrossUnitMinor)}`,
      '',
      'Preisstruktur',
    );
    if (components.length === 0) lines.push('Keine zusätzlichen Preisstruktur-Positionen');
    else {
      for (const component of components) {
        lines.push(
          `${component.name}: ${money(component.grossUnitMinor)}${component.guestPays ? '' : ' (nicht zusätzlich vom Gast getragen)'}`,
        );
      }
    }
    lines.push(
      `Ticketpreis für den Ticketanbieter: ${money(tier.endCustomerUnitGrossMinor)}`,
      '',
      'Zusätzliche Checkout-Gebühren',
      'Im Event nicht separat ausgewiesen; gegebenenfalls vom Ticketanbieter ergänzen.',
      `Vom Gast zu zahlen: ${money(tier.endCustomerUnitGrossMinor)}`,
      'zzgl. Versand, sofern zutreffend',
    );
  }
  if (tiers.length === 0) lines.push('', 'Keine aktiven Ticketstufen vorhanden.');
  return lines.join('\n');
}

function money(value: string | null | undefined) {
  return formatMinorAmount(value, 'EUR') ?? 'Noch offen';
}

function basisPoints(value: number | null | undefined) {
  if (value == null) return 'noch offen';
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value / 100)} %`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
