import type { components } from '@venue/api-client';
import { describe, expect, it } from 'vitest';

import {
  ticketingBreakdownText,
  ticketProviderSummary,
  ticketTaxMinor,
} from './ticketing-breakdown';

type Plan = components['schemas']['RevenuePlanDto'];
type Tier = components['schemas']['TicketPriceTierDto'];

const tier = {
  id: 'tier-1',
  name: 'Vorverkauf',
  expectedQuantity: 80,
  baseNetUnitMinor: '1261',
  baseGrossUnitMinor: '1500',
  baseTaxRateBasisPoints: 1900,
  sourceTicketProviderNameSnapshot: 'Rausgegangen',
  endCustomerUnitGrossMinor: '2148',
  components: [
    {
      id: 'component-1',
      name: 'VVK-Gebühr',
      grossUnitMinor: '98',
      guestPays: true,
      status: 'ACTIVE',
    },
  ],
  status: 'ACTIVE',
} as unknown as Tier;

describe('ticketing breakdown', () => {
  it('derives tax only from the existing net and gross snapshots', () => {
    expect(ticketTaxMinor(tier)).toBe('239');
  });

  it('deduplicates provider snapshots without inventing a provider', () => {
    expect(ticketProviderSummary([tier, { ...tier, id: 'tier-2' }])).toBe('Rausgegangen');
    expect(ticketProviderSummary([{ ...tier, sourceTicketProviderNameSnapshot: null }])).toBeNull();
  });

  it('creates a sendable event-wide text with EUR values and shipping qualification', () => {
    const text = ticketingBreakdownText(
      {
        eventName: 'Clubnacht',
        ticketTiers: [tier],
      } as unknown as Plan,
      '2026-08-27',
      'Halle',
    );
    const normalized = text.replaceAll('\u00a0', ' ');
    expect(normalized).toContain('Clubnacht');
    expect(normalized).toContain('Ticketanbieter: Rausgegangen');
    expect(normalized).toContain('Umsatzsteuer 19 %: 2,39 €');
    expect(normalized).toContain('Ticketpreis für den Ticketanbieter: 21,48 €');
    expect(normalized).toContain('zzgl. Versand, sofern zutreffend');
    expect(normalized).not.toContain('Minor');
  });
});
