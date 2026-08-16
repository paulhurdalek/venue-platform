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
      <header className="page-heading">
        <div>
          <p className="eyebrow">Kontakt</p>
          <h1>{[contact.firstName, contact.lastName].filter(Boolean).join(' ')}</h1>
          <p>{contact.label ?? 'Keine Funktionsbezeichnung'}</p>
        </div>
        <div className="heading-badges">
          <span className={`status-badge status-badge--${contact.status.toLowerCase()}`}>
            {contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
          {contact.incomplete ? (
            <span className="status-badge status-badge--warning">Keine Kontaktmöglichkeit</span>
          ) : null}
        </div>
      </header>
      <section className="panel">
        <div className="panel__heading">
          <div>
            <h2>Stammdaten</h2>
            <p>Zuletzt geändert: {new Date(contact.updatedAt).toLocaleString('de-DE')}</p>
          </div>
        </div>
        {canWrite ? (
          <ContactForm contact={contact} organizationId={organizationId} />
        ) : (
          <ContactDetails contact={contact} />
        )}
      </section>
      <section className="panel">
        <div className="panel__heading">
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
      {canArchive ? (
        <section className="panel danger-zone">
          <div>
            <h2>Lebenszyklus</h2>
            <p>Verknüpfungen bleiben beim Archivieren nachvollziehbar.</p>
          </div>
          <LifecycleAction
            entityId={contact.id}
            kind="contact"
            organizationId={organizationId}
            status={contact.status}
            version={contact.version}
          />
        </section>
      ) : null}
    </>
  );
}

function ContactDetails({ contact }: { contact: Contact }) {
  return (
    <dl className="detail-list">
      <div>
        <dt>E-Mail</dt>
        <dd>{contact.email ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Telefon</dt>
        <dd>{contact.phone ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Mobil</dt>
        <dd>{contact.mobile ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Notizen</dt>
        <dd>{contact.notes ?? 'Nicht angegeben'}</dd>
      </div>
    </dl>
  );
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
