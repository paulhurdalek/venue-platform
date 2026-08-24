import { notFound } from 'next/navigation';

import { ServiceDetailManager } from '../../../../components/services/service-components';
import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; serviceId: string }>;
}) {
  const { organizationId, serviceId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/services/${serviceId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'services.read'))
    return (
      <section className="state-card">
        <h1>Leistung nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  try {
    const [serviceResult, categoriesResult, partnersResult] = await Promise.all([
      client.GET('/api/v1/organizations/{organizationId}/services/{serviceId}', {
        params: { path: { organizationId, serviceId } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/service-categories', {
        params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
      }),
      hasPermission(membership, 'services.write') &&
      hasPermission(membership, 'business_partners.read')
        ? client.GET('/api/v1/organizations/{organizationId}/business-partners', {
            params: {
              path: { organizationId },
              query: { status: 'ACTIVE', limit: 100, offset: 0 },
            },
          })
        : Promise.resolve(undefined),
    ]);
    return (
      <ServiceDetailManager
        canArchive={hasPermission(membership, 'services.archive')}
        canPurchase={hasPermission(membership, 'calculations.purchase')}
        canWrite={hasPermission(membership, 'services.write')}
        categories={unwrap(categoriesResult).items}
        organizationId={organizationId}
        partners={partnersResult ? unwrap(partnersResult).items : []}
        service={unwrap(serviceResult)}
      />
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
}
