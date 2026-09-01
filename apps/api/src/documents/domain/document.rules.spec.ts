import { describe, expect, it } from 'vitest';

import {
  assertDocumentStatusTransition,
  canDeleteDocumentDraft,
  calculateOffer,
  differsFromSource,
  draftStatusAfterEdit,
  isOfferExpired,
} from './document.rules.js';

describe('document rules', () => {
  it('calculates position discounts, proportional total discounts and tax groups exactly', () => {
    const result = calculateOffer(
      [
        {
          quantity: '3',
          unitPriceNetMinor: 1_999n,
          taxRateBasisPoints: 1_900,
          discount: { type: 'FIXED', fixedMinor: 997n, percentageBasisPoints: null },
        },
        {
          quantity: '2,5',
          unitPriceNetMinor: 1_000n,
          taxRateBasisPoints: 700,
          discount: { type: 'PERCENTAGE', fixedMinor: null, percentageBasisPoints: 1_000 },
        },
      ],
      { type: 'PERCENTAGE', fixedMinor: null, percentageBasisPoints: 1_000 },
    );

    expect(result).toMatchObject({
      subtotalNetMinor: '8497',
      positionDiscountNetMinor: '1247',
      totalDiscountNetMinor: '725',
      totalNetMinor: '6525',
      taxMinor: '997',
      totalGrossMinor: '7522',
    });
    expect(result.positions).toEqual([
      expect.objectContaining({ totalNetMinor: '4500', taxMinor: '855' }),
      expect.objectContaining({ totalNetMinor: '2025', taxMinor: '142' }),
    ]);
    expect(result.taxGroups).toEqual([
      { taxRateBasisPoints: 700, netMinor: '2025', taxMinor: '142', grossMinor: '2167' },
      { taxRateBasisPoints: 1900, netMinor: '4500', taxMinor: '855', grossMinor: '5355' },
    ]);
  });

  it('keeps offer and production status machines separate', () => {
    expect(() => assertDocumentStatusTransition('OFFER', 'ENTWURF', 'ERSTELLT')).not.toThrow();
    expect(() => assertDocumentStatusTransition('OFFER', 'UEBERGEBEN', 'ANGENOMMEN')).not.toThrow();
    expect(() =>
      assertDocumentStatusTransition('PRODUCTION_INFORMATION', 'FREIGEGEBEN', 'ARCHIVIERT'),
    ).not.toThrow();
    expect(() =>
      assertDocumentStatusTransition('PRODUCTION_INFORMATION', 'ENTWURF', 'ERSTELLT'),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_STATUS_TRANSITION_INVALID' }));
    expect(draftStatusAfterEdit('OFFER', 'UEBERGEBEN')).toBe('ENTWURF');
    expect(() => draftStatusAfterEdit('PRODUCTION_INFORMATION', 'ARCHIVIERT')).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_ARCHIVED' }),
    );
  });

  it('derives expiry by calendar date and detects source deviations', () => {
    expect(
      isOfferExpired(
        'OFFER',
        'UEBERGEBEN',
        new Date('2027-04-09T00:00:00.000Z'),
        new Date('2027-04-10T18:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isOfferExpired(
        'OFFER',
        'UEBERGEBEN',
        new Date('2027-04-10T00:00:00.000Z'),
        new Date('2027-04-10T18:00:00.000Z'),
      ),
    ).toBe(false);

    const source = {
      description: 'Saalmiete',
      quantity: '1',
      unitPriceNetMinor: '100000',
      taxRateBasisPoints: 1900,
      discountType: null,
      discountFixedMinor: null,
      discountPercentageBasisPoints: null,
    };
    expect(differsFromSource(source, source)).toBe(false);
    expect(differsFromSource({ ...source, unitPriceNetMinor: '99000' }, source)).toBe(true);
  });

  it('only permits final deletion for an unversioned document draft', () => {
    expect(canDeleteDocumentDraft('ENTWURF', 0)).toBe(true);
    expect(canDeleteDocumentDraft('ENTWURF', 1)).toBe(false);
    expect(canDeleteDocumentDraft('UEBERGEBEN', 1)).toBe(false);
    expect(canDeleteDocumentDraft('FREIGEGEBEN', 1)).toBe(false);
  });
});
