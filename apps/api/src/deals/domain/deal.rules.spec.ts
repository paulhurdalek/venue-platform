import { describe, expect, it } from 'vitest';

import { assertShareInvariant, calculateDeal, isWkzName } from './deal.rules.js';

const noDiscount = { type: null, fixedMinor: null, percentageBasisPoints: null } as const;

describe('deal rules', () => {
  it('enforces an exact 100 percent split', () => {
    expect(() => assertShareInvariant(6_000, 4_000)).not.toThrow();
    expect(() => assertShareInvariant(6_000, 3_999)).toThrowError(
      expect.objectContaining({ code: 'DEAL_SHARE_MUST_EQUAL_100_PERCENT' }),
    );
  });

  it('includes WKZ only when explicitly selected and applies the minimum guarantee', () => {
    const result = calculateDeal({
      ticketNetRevenueMinor: 1_000_00n,
      wkzNetRevenueMinor: 100_00n,
      totalDiscount: noDiscount,
      servicePositions: [],
      components: [
        {
          id: 'without-wkz',
          type: 'REVENUE_SHARE',
          label: 'Teilung',
          amountNetMinor: null,
          minimumGuaranteeNetMinor: null,
          taxRateBasisPoints: 0,
          locationShareBasisPoints: 5_000,
          counterpartyShareBasisPoints: 5_000,
          includeWkz: false,
        },
        {
          id: 'guarantee',
          type: 'MINIMUM_GUARANTEE_SHARE',
          label: 'Garantie',
          amountNetMinor: null,
          minimumGuaranteeNetMinor: 60_000n,
          taxRateBasisPoints: 0,
          locationShareBasisPoints: 5_000,
          counterpartyShareBasisPoints: 5_000,
          includeWkz: true,
        },
      ],
    });
    expect(result.components[0]).toMatchObject({
      splitBasisMinor: '100000',
      effectiveLocationAmountMinor: '50000',
    });
    expect(result.components[1]).toMatchObject({
      splitBasisMinor: '110000',
      effectiveLocationAmountMinor: '60000',
      appliedRule: 'MINIMUM_GUARANTEE',
    });
  });

  it('combines rent and share while discounts never affect included positions', () => {
    const result = calculateDeal({
      ticketNetRevenueMinor: 100_000n,
      wkzNetRevenueMinor: 0n,
      totalDiscount: { type: 'PERCENTAGE', fixedMinor: null, percentageBasisPoints: 1_000 },
      components: [
        {
          id: 'rent',
          type: 'FIXED_RENT',
          label: 'Miete',
          amountNetMinor: 50_000n,
          minimumGuaranteeNetMinor: null,
          taxRateBasisPoints: 1_900,
          locationShareBasisPoints: null,
          counterpartyShareBasisPoints: null,
          includeWkz: false,
        },
        {
          id: 'share',
          type: 'REVENUE_SHARE',
          label: 'Split',
          amountNetMinor: null,
          minimumGuaranteeNetMinor: null,
          taxRateBasisPoints: 0,
          locationShareBasisPoints: 5_000,
          counterpartyShareBasisPoints: 5_000,
          includeWkz: false,
        },
      ],
      servicePositions: [
        {
          id: 'billable',
          quantity: '2',
          salesUnitPriceNetMinor: 10_000n,
          internalUnitCostNetMinor: 4_000n,
          taxRateBasisPoints: 1_900,
          billingMode: 'SEPARATELY_BILLABLE',
          discount: { type: 'FIXED', fixedMinor: 2_000n, percentageBasisPoints: null },
        },
        {
          id: 'included',
          quantity: '1',
          salesUnitPriceNetMinor: 30_000n,
          internalUnitCostNetMinor: 5_000n,
          taxRateBasisPoints: 1_900,
          billingMode: 'INCLUDED',
          discount: noDiscount,
        },
      ],
    });
    expect(result).toMatchObject({
      billableServiceSubtotalNetMinor: '20000',
      positionDiscountNetMinor: '2000',
      totalDiscountNetMinor: '1800',
      customerAmountNetMinor: '66200',
      expectedLocationShareNetMinor: '50000',
      internalCostNetMinor: '13000',
      expectedOperatingResultNetMinor: '103200',
    });
  });

  it('recognizes only the explicit Phase-8 WKZ labels', () => {
    expect(isWkzName('WKZ')).toBe(true);
    expect(isWkzName('Werbekostenzuschuss')).toBe(true);
    expect(isWkzName('Ticketanbietergebühr')).toBe(false);
  });
});
