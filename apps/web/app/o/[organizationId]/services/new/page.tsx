import { ServiceForm } from '../../../../components/services/service-components';
import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/services/new`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'services.write'))
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Leistungen anlegen.</h1>
      </section>
    );
  const categories = unwrap(
    await (
      await serverApiClient()
    ).GET('/api/v1/organizations/{organizationId}/service-categories', {
      params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
    }),
  ).items;
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Leistungen</p>
          <h1>Leistung anlegen</h1>
          <p>Preise werden netto und ausschließlich in Euro geführt.</p>
        </div>
      </header>
      <section className="panel">
        {categories.length ? (
          <ServiceForm categories={categories} organizationId={organizationId} />
        ) : (
          <div className="empty-state">
            <strong>Zuerst wird eine aktive Kategorie benötigt.</strong>
            <a className="button" href={`/o/${organizationId}/services/categories`}>
              Kategorie anlegen
            </a>
          </div>
        )}
      </section>
    </>
  );
}
