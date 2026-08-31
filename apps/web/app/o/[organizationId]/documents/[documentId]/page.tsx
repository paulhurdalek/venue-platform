import { notFound } from 'next/navigation';

import { DocumentWorkspace } from '../../../../components/documents/document-workspace';
import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; documentId: string }>;
}) {
  const { organizationId, documentId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/documents/${documentId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'documents.read')) {
    return (
      <section className="state-card">
        <h1>Dokument nicht verfügbar.</h1>
      </section>
    );
  }
  try {
    const client = await serverApiClient();
    const document = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/documents/{documentId}', {
        params: { path: { organizationId, documentId } },
      }),
    );
    return (
      <DocumentWorkspace
        canPublish={hasPermission(membership, 'documents.publish')}
        canWrite={hasPermission(membership, 'documents.write')}
        initialDocument={document}
        organizationId={organizationId}
      />
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
}
