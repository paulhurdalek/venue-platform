import { describe, expect, it } from 'vitest';

import {
  convertNetGross,
  percentageOfMinor,
  resolveAdditionalRevenue,
  resolveAllocations,
  resolveComponentAmount,
} from './revenue-planning.rules.js';

describe('Phase 8 revenue rules', () => {
  it('converts net and gross with deterministic HALF_UP rounding', () => {
    expect(convertNetGross(1_000n, 'NET', 1_900)).toEqual({ netMinor: 1_000n, grossMinor: 1_190n });
    expect(convertNetGross(1_190n, 'GROSS', 1_900)).toEqual({
      netMinor: 1_000n,
      grossMinor: 1_190n,
    });
    expect(convertNetGross(1n, 'NET', 1_900)).toEqual({ netMinor: 1n, grossMinor: 1n });
  });

  it('calculates percentages without floating point', () => {
    expect(percentageOfMinor(1_999n, 500)).toBe(100n);
    expect(
      resolveComponentAmount(2_000n, {
        amountType: 'PERCENTAGE',
        inputType: 'GROSS',
        inputAmountMinor: null,
        percentageRateBasisPoints: 750,
        taxRateBasisPoints: 1_900,
      }),
    ).toEqual({ netMinor: 126n, grossMinor: 150n });
  });

  it('requires component allocations to match the component gross amount exactly', () => {
    const valid = resolveAllocations({ netMinor: 1_000n, grossMinor: 1_190n }, [
      {
        id: 'club',
        recipientType: 'ORGANIZATION',
        allocationType: 'PERCENTAGE',
        fixedAmountMinor: null,
        percentageBasisPoints: 6_000,
      },
      {
        id: 'artist',
        recipientType: 'ARTIST',
        allocationType: 'FIXED',
        fixedAmountMinor: 476n,
        percentageBasisPoints: null,
      },
    ]);
    expect(valid.complete).toBe(true);
    expect(valid.differenceGrossMinor).toBe(0n);
    expect(valid.items.map((item) => item.grossAmountMinor)).toEqual([714n, 476n]);

    expect(
      resolveAllocations({ netMinor: 1_000n, grossMinor: 1_190n }, [
        {
          id: 'club',
          recipientType: 'ORGANIZATION',
          allocationType: 'PERCENTAGE',
          fixedAmountMinor: null,
          percentageBasisPoints: 9_000,
        },
      ]).complete,
    ).toBe(false);

    const thirds = resolveAllocations(
      { netMinor: 100n, grossMinor: 119n },
      [40n, 40n, 39n].map((fixedAmountMinor, index) => ({
        id: String(index),
        recipientType: 'ORGANIZATION' as const,
        allocationType: 'FIXED' as const,
        fixedAmountMinor,
        percentageBasisPoints: null,
      })),
    );
    expect(thirds.complete).toBe(true);
    expect(thirds.items.map((item) => item.netAmountMinor)).toEqual([34n, 33n, 33n]);
    expect(thirds.items.reduce((sum, item) => sum + (item.netAmountMinor ?? 0n), 0n)).toBe(100n);
  });

  it('resolves guest- and ticket-dependent additional revenue', () => {
    expect(
      resolveAdditionalRevenue(
        {
          calculationType: 'PER_EXPECTED_GUEST',
          inputType: 'NET',
          inputAmountMinor: 250n,
          percentageRateBasisPoints: null,
          taxRateBasisPoints: 700,
        },
        { expectedGuests: 400, payingTickets: 300, ticketBaseNetMinor: 300_000n },
      ),
    ).toMatchObject({ netMinor: 100_000n, grossMinor: 107_200n, quantity: 400 });
    expect(
      resolveAdditionalRevenue(
        {
          calculationType: 'PERCENT_TICKET_BASE_NET',
          inputType: 'NET',
          inputAmountMinor: null,
          percentageRateBasisPoints: 1_000,
          taxRateBasisPoints: 1_900,
        },
        { expectedGuests: null, payingTickets: 300, ticketBaseNetMinor: 300_000n },
      ),
    ).toMatchObject({ netMinor: 30_000n, grossMinor: 35_700n, basisMinor: 300_000n });
  });
});
