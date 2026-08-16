import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import { BusinessPartnerForm } from '../../../../components/master-data/entity-forms';

export default async function NewBusinessPartnerPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
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
        <BusinessPartnerForm organizationId={organizationId} roles={roles} />
      </section>
    </>
  );
}
