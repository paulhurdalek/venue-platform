import { DocumentTemplateManager } from '../../../components/documents/document-template-manager';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

export default async function DocumentTemplatesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/document-templates`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'document_templates.read')) {
    return (
      <section className="state-card">
        <h1>Dokumentvorlagen nicht verfügbar.</h1>
      </section>
    );
  }
  const client = await serverApiClient();
  const templates = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/document-templates', {
      params: { path: { organizationId }, query: { status: 'ALL' } },
    }),
  );
  return (
    <DocumentTemplateManager
      canArchive={hasPermission(membership, 'document_templates.archive')}
      canWrite={hasPermission(membership, 'document_templates.write')}
      initialTemplates={templates}
      organizationId={organizationId}
    />
  );
}
