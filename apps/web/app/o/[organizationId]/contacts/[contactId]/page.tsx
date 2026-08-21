import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';
import { ContactForm } from '../../../../components/master-data/entity-forms';
import { LifecycleAction } from '../../../../components/master-data/entity-actions';
import {
  CompactEmpty,
  ContactChannels,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';

type Contact = components['schemas']['ContactDto'];

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; contactId: string }>;
}) {
  const { organizationId, contactId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/contacts/${contactId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'contacts.read'))
    return (
      <section className="state-card">
        <h1>Kontakt nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  let contact: Contact;
  try {
    contact = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/contacts/{contactId}', {
        params: { path: { organizationId, contactId } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const canWrite = hasPermission(membership, 'contacts.write');
  const canArchive = hasPermission(membership, 'contacts.archive');
  return (
    <>
      <EditableDetail
        badges={
          <>
            <span className={`status-badge status-badge--${contact.status.toLowerCase()}`}>
              {contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
            </span>
            {contact.incomplete ? (
              <span className="status-badge status-badge--warning">Keine Kontaktmöglichkeit</span>
            ) : null}
          </>
        }
        canEdit={canWrite}
        editTitle="Kontakt bearbeiten"
        eyebrow="Kontakt"
        id="contact-detail"
        sectionTitle="Kontakt-Stammdaten"
        secondaryActions={
          canArchive ? (
            <LifecycleAction
              entityId={contact.id}
              kind="contact"
              organizationId={organizationId}
              status={contact.status}
              version={contact.version}
            />
          ) : null
        }
        summary={contact.label}
        title={contactName(contact)}
        updatedLabel={`Zuletzt geändert: ${new Date(contact.updatedAt).toLocaleString('de-DE')}`}
        view={<ContactDetails contact={contact} />}
      >
        {canWrite ? <ContactForm contact={contact} organizationId={organizationId} /> : null}
      </EditableDetail>
      <section className="panel detail-panel">
        <div className="panel__heading panel__heading--compact">
          <div>
            <h2>Verwendung</h2>
            <p>Zuordnungsrollen gelten jeweils nur für die konkrete Verknüpfung.</p>
          </div>
        </div>
        <div className="usage-grid">
          <Usage
            title="Artists"
            items={contact.artistLinks}
            href={(id) => `/o/${organizationId}/artists/${id}`}
          />
          <Usage
            title="Geschäftspartner"
            items={contact.businessPartnerLinks}
            href={(id) => `/o/${organizationId}/business-partners/${id}`}
          />
        </div>
      </section>
    </>
  );
}

function ContactDetails({ contact }: { contact: Contact }) {
  const hasContact = Boolean(contact.email || contact.phone || contact.mobile);
  if (!hasContact && !contact.notes) {
    return <CompactEmpty>Keine weiteren Kontaktinformationen hinterlegt.</CompactEmpty>;
  }
  return (
    <DetailSections>
      {hasContact ? (
        <DetailSection title="Kontaktwege">
          <ContactChannels contact={contact} emptyMessage={null} />
        </DetailSection>
      ) : null}
      {contact.notes ? (
        <DetailSection title="Weitere Angaben" wide>
          <DetailFields>
            <DetailField label="Notizen" wide>
              <span className="pre-wrap">{contact.notes}</span>
            </DetailField>
          </DetailFields>
        </DetailSection>
      ) : null}
    </DetailSections>
  );
}

function contactName(contact: Contact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unbenannter Kontakt';
}
function Usage({
  title,
  items,
  href,
}: {
  title: string;
  items: Contact['artistLinks'];
  href: (id: string) => string;
}) {
  return (
    <div>
      <h3>{title}</h3>
      <ul className="usage-list">
        {items.map((item) => (
          <li key={item.id}>
            <a className="text-link" href={href(item.entityId)}>
              {item.name}
            </a>
            <span>{item.roles.map((role) => role.name).join(', ')}</span>
          </li>
        ))}
        {items.length === 0 ? <li className="muted">Keine Zuordnung</li> : null}
      </ul>
    </div>
  );
}
