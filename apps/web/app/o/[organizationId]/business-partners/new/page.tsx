import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import { BusinessPartnerForm } from '../../../../components/master-data/entity-forms';

export default async function NewBusinessPartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const search = await searchParams;
  const returnTo = safeArtistReturnTo(organizationId, first(search.returnTo));
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/business-partners/new`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'business_partners.write'))
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Geschäftspartner anlegen.</h1>
      </section>
    );
  const client = await serverApiClient();
  const roles = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/business-partner-roles', {
      params: { path: { organizationId } },
    }),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Geschäftspartner</p>
          <h1>Geschäftspartner anlegen</h1>
          <p>Der Firmenname ist die einzige Pflichtangabe.</p>
        </div>
      </header>
      <section className="panel">
        <BusinessPartnerForm organizationId={organizationId} returnTo={returnTo} roles={roles} />
      </section>
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeArtistReturnTo(organizationId: string, candidate: string | undefined) {
  if (!candidate || candidate.startsWith('//')) return undefined;
  try {
    const parsed = new URL(candidate, 'http://venue.local');
    const prefix = `/o/${organizationId}/artists/`;
    if (parsed.origin !== 'http://venue.local' || !parsed.pathname.startsWith(prefix)) {
      return undefined;
    }
    const artistId = parsed.pathname.slice(prefix.length);
    if (!/^[0-9a-f-]{36}$/i.test(artistId)) return undefined;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return undefined;
  }
}
