import { describe, expect, it } from 'vitest';

import {
  resolveCatalogProvider,
  type CatalogProviderCandidate,
} from './catalog-price-resolution.js';

describe('resolveCatalogProvider', () => {
  it('selects an explicit active provider before all automatic rules', () => {
    expect(
      resolveCatalogProvider([provider('one', true), provider('two')], 'two')?.businessPartnerId,
    ).toBe('two');
  });

  it('selects the preferred active provider or the only active provider', () => {
    expect(
      resolveCatalogProvider([provider('one'), provider('two', true)])?.businessPartnerId,
    ).toBe('two');
    expect(resolveCatalogProvider([provider('only')])?.businessPartnerId).toBe('only');
  });

  it('does not make an arbitrary choice between multiple active providers', () => {
    expect(resolveCatalogProvider([provider('one'), provider('two')])).toBeUndefined();
  });

  it('ignores archived provider prices and archived business partners', () => {
    expect(
      resolveCatalogProvider([
        provider('archived-price', true, 'ARCHIVED'),
        provider('archived-partner', true, 'ACTIVE', 'ARCHIVED'),
        provider('active'),
      ])?.businessPartnerId,
    ).toBe('active');
  });
});

function provider(
  businessPartnerId: string,
  preferred = false,
  status: CatalogProviderCandidate['status'] = 'ACTIVE',
  partnerStatus: CatalogProviderCandidate['businessPartner']['status'] = 'ACTIVE',
): CatalogProviderCandidate {
  return {
    businessPartnerId,
    purchasePriceMinor: 100n,
    preferred,
    status,
    businessPartner: { companyName: businessPartnerId, status: partnerStatus },
  };
}
