import { DealTemplateManager } from '../../../components/deals/deal-template-manager';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

export default async function DealTemplatesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/deal-templates`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'deal_templates.read'))
    return (
      <section className="state-card">
        <h1>Dealvorlagen nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  const [templateResult, serviceResult] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/deal-templates', {
      params: { path: { organizationId }, query: { status: 'ALL' } },
    }),
    hasPermission(membership, 'services.read')
      ? client.GET('/api/v1/organizations/{organizationId}/services', {
          params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
        })
      : Promise.resolve(undefined),
  ]);
  return (
    <DealTemplateManager
      canArchive={hasPermission(membership, 'deal_templates.archive')}
      canWrite={hasPermission(membership, 'deal_templates.write')}
      initialTemplates={unwrap(templateResult)}
      organizationId={organizationId}
      services={serviceResult ? unwrap(serviceResult).items : []}
    />
  );
}
