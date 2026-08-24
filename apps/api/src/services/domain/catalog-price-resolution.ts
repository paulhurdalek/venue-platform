export interface CatalogProviderCandidate {
  businessPartnerId: string;
  purchasePriceMinor: bigint | null;
  preferred: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  businessPartner: {
    companyName: string;
    status: 'ACTIVE' | 'ARCHIVED';
  };
}

/**
 * Resolves a provider deterministically. An explicit provider wins; otherwise
 * the preferred active provider, or the sole active provider, is selected.
 */
export function resolveCatalogProvider<T extends CatalogProviderCandidate>(
  candidates: T[],
  requestedBusinessPartnerId?: string | null,
): T | undefined {
  const active = candidates.filter(
    (candidate) => candidate.status === 'ACTIVE' && candidate.businessPartner.status === 'ACTIVE',
  );
  if (requestedBusinessPartnerId) {
    return active.find((candidate) => candidate.businessPartnerId === requestedBusinessPartnerId);
  }
  return (
    active.find((candidate) => candidate.preferred) ?? (active.length === 1 ? active[0] : undefined)
  );
}
