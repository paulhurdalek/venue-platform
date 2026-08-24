import { CategoryManager } from '../../../../components/services/service-components';
import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';

export default async function ServiceCategoriesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/services/categories`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'services.read'))
    return (
      <section className="state-card">
        <h1>Kategorien sind für Ihre Rolle nicht freigegeben.</h1>
      </section>
    );
  const categories = unwrap(
    await (
      await serverApiClient()
    ).GET('/api/v1/organizations/{organizationId}/service-categories', {
      params: { path: { organizationId }, query: { status: 'ALL', limit: 100, offset: 0 } },
    }),
  ).items;
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Leistungen</p>
          <h1>Leistungskategorien</h1>
          <p>Organisationsweite Kategorien; archivierte Einträge bleiben historisch lesbar.</p>
        </div>
        <a className="button button--secondary" href={`/o/${organizationId}/services`}>
          Zum Leistungskatalog
        </a>
      </header>
      <section className="panel">
        <CategoryManager
          canArchive={hasPermission(membership, 'services.archive')}
          canWrite={hasPermission(membership, 'services.write')}
          initialCategories={categories}
          organizationId={organizationId}
        />
      </section>
    </>
  );
}
