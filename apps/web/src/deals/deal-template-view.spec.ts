import type { components } from '@venue/api-client';
import { describe, expect, it } from 'vitest';

import { dealTemplateSummary, discountLabel, positionMeta } from './deal-template-view';

type DealComponent = components['schemas']['DealComponentDto'];
type DealServicePosition = components['schemas']['DealServicePositionDto'];

describe('deal-template view formatting', () => {
  it('summarizes fixed rent, split, WKZ and additional components compactly', () => {
    expect(dealTemplateSummary([component({ type: 'FIXED_RENT' })])).toBe('Feste Miete');
    expect(
      dealTemplateSummary([
        component({
          type: 'REVENUE_SHARE',
          locationShareBasisPoints: 5_000,
          counterpartyShareBasisPoints: 5_000,
          includeWkz: true,
        }),
      ]),
    ).toBe('Umsatzbeteiligung 50/50 · WKZ enthalten');
    expect(
      dealTemplateSummary([
        component({ type: 'FIXED_RENT' }),
        component({ type: 'MINIMUM_GUARANTEE_SHARE' }),
        component({ type: 'REVENUE_SHARE' }),
      ]),
    ).toContain('· +1 weitere');
  });

  it('formats fixed and percentage discounts without inventing missing values', () => {
    expect(discountLabel('FIXED', '1250', null)).toBe('12,50 € Festbetrag');
    expect(discountLabel('PERCENTAGE', null, 1_250)).toBe('12,5 %');
    expect(discountLabel(null, null, null)).toBeNull();
  });

  it('formats service quantities, units and tax compactly', () => {
    expect(positionMeta(position())).toBe('1,5 Stunden · 19 % USt.');
  });
});

function component(values: Partial<DealComponent>): DealComponent {
  return {
    id: crypto.randomUUID(),
    type: 'MINIMUM_GUARANTEE_SHARE',
    label: 'Dealbaustein',
    amountNetMinor: null,
    minimumGuaranteeNetMinor: '50000',
    taxRateBasisPoints: 1_900,
    locationShareBasisPoints: 6_000,
    counterpartyShareBasisPoints: 4_000,
    includeWkz: false,
    sortOrder: 0,
    version: 1,
    ...values,
  };
}

function position(): DealServicePosition {
  return {
    id: crypto.randomUUID(),
    sourceServiceId: null,
    sourceServiceVersion: null,
    name: 'Technik',
    unit: 'HOUR',
    quantity: '1.500',
    salesUnitPriceNetMinor: '10000',
    internalUnitCostNetMinor: '5000',
    taxRateBasisPoints: 1_900,
    billingMode: 'SEPARATELY_BILLABLE',
    discountType: null,
    discountFixedMinor: null,
    discountPercentageBasisPoints: null,
    sortOrder: 0,
    version: 1,
  };
}
