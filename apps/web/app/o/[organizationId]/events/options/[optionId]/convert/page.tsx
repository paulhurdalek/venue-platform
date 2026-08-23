import { notFound } from 'next/navigation';

import { DateOptionConvertForm } from '../../../../../../components/events/date-option-convert-form';
import { activePageMembership } from '../../../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../../../src/api/server';

export default async function ConvertDateOptionPage({
  params,
}: {
  params: Promise<{ organizationId: string; optionId: string }>;
}) {
  const { organizationId, optionId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/events/options/${optionId}/convert`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'date_options.convert'))
    return (
      <section className="state-card">
        <h1>Sie dürfen Terminoptionen nicht umwandeln.</h1>
      </section>
    );
  const client = await serverApiClient();
  try {
    const [option, formats] = await Promise.all([
      client
        .GET('/api/v1/organizations/{organizationId}/date-options/{optionId}', {
          params: { path: { organizationId, optionId } },
        })
        .then(unwrap),
      client
        .GET('/api/v1/organizations/{organizationId}/event-formats', {
          params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
        })
        .then(unwrap),
    ]);
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">Terminoption</p>
            <h1>In Veranstaltung umwandeln</h1>
            <p>
              Prüfen Sie die endgültigen Eventwerte. Option und Veranstaltung werden atomar ersetzt.
            </p>
          </div>
        </header>
        <section className="panel">
          <DateOptionConvertForm
            formats={formats.items}
            option={option}
            organizationId={organizationId}
          />
        </section>
      </>
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
}
