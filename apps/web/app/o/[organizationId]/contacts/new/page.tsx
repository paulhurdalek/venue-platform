import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission } from '../../../../../src/api/server';
import { ContactForm } from '../../../../components/master-data/entity-forms';

export default async function NewContactPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/contacts/new`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'contacts.write'))
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Kontakte anlegen.</h1>
      </section>
    );
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Kontakte</p>
          <h1>Kontakt anlegen</h1>
          <p>Vorname oder Nachname genügt; Kontaktdaten können später ergänzt werden.</p>
        </div>
      </header>
      <section className="panel">
        <ContactForm organizationId={organizationId} />
      </section>
    </>
  );
}
