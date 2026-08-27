import { RevenueTemplateManager } from '../../../components/revenue-templates/revenue-template-manager';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

export default async function RevenueTemplatesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/revenue-templates`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'revenue_templates.read')) {
    return (
      <section className="state-card">
        <h1>Erlösvorlagen sind für Ihre Rolle nicht freigegeben.</h1>
      </section>
    );
  }

  const client = await serverApiClient();
  const [taxRates, providers, calculations, artists, partners] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/revenue-templates/tax-rates', {
      params: { path: { organizationId }, query: { status: 'ALL' } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers', {
      params: { path: { organizationId }, query: { status: 'ALL' } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/revenue-templates/calculations', {
      params: { path: { organizationId }, query: { status: 'ALL' } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/artists', {
      params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/business-partners', {
      params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
    }),
  ]);

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Erlösplanung</p>
          <h1>Erlösvorlagen</h1>
          <p>
            Organisationsweite Steuersätze, Ticketanbieter und wiederkehrende Kalkulationen.
            Übernommene Werte werden im Event stets als unabhängige Momentaufnahme gespeichert.
          </p>
        </div>
      </header>
      <RevenueTemplateManager
        artists={unwrap(artists).items}
        calculationTemplates={unwrap(calculations)}
        canArchive={hasPermission(membership, 'revenue_templates.archive')}
        canWrite={hasPermission(membership, 'revenue_templates.write')}
        organizationId={organizationId}
        partners={unwrap(partners).items}
        providerTemplates={unwrap(providers)}
        taxRates={unwrap(taxRates)}
      />
    </>
  );
}
