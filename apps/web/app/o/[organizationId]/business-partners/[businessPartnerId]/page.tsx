import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';
import { BusinessPartnerForm } from '../../../../components/master-data/entity-forms';
import {
  BusinessPartnerRoleManager,
  ContactAssociationManager,
  LifecycleAction,
} from '../../../../components/master-data/entity-actions';

type Partner = components['schemas']['BusinessPartnerDto'];

export default async function BusinessPartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; businessPartnerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId, businessPartnerId } = await params;
  const search = await searchParams;
  const contactSearch = first(search.contactQ);
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/business-partners/${businessPartnerId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'business_partners.read'))
    return (
      <section className="state-card">
        <h1>Geschäftspartner nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  let partner: Partner;
  try {
    partner = unwrap(
      await client.GET(
        '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}',
        { params: { path: { organizationId, businessPartnerId } } },
      ),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const canWrite = hasPermission(membership, 'business_partners.write');
  const canArchive = hasPermission(membership, 'business_partners.archive');
  const [partnerRoles, contactRoles, contacts] = await Promise.all([
    client
      .GET('/api/v1/organizations/{organizationId}/business-partner-roles', {
        params: { path: { organizationId } },
      })
      .then(unwrap),
    canWrite
      ? client
          .GET('/api/v1/organizations/{organizationId}/contact-roles', {
            params: { path: { organizationId } },
          })
          .then(unwrap)
      : Promise.resolve([]),
    canWrite
      ? client
          .GET('/api/v1/organizations/{organizationId}/contacts', {
            params: {
              path: { organizationId },
              query: {
                status: 'ACTIVE',
                limit: 100,
                offset: 0,
                ...(contactSearch ? { q: contactSearch } : {}),
              },
            },
          })
          .then(unwrap)
      : Promise.resolve({ items: [] }),
  ]);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Geschäftspartner</p>
          <h1>{partner.companyName}</h1>
          <p>
            {partner.roles.map((role) => role.name).join(', ') || 'Noch keine Rolle zugewiesen'}
          </p>
        </div>
        <span className={`status-badge status-badge--${partner.status.toLowerCase()}`}>
          {partner.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
        </span>
      </header>
      <section className="panel">
        <div className="panel__heading">
          <div>
            <h2>Stammdaten</h2>
            <p>Zuletzt geändert: {new Date(partner.updatedAt).toLocaleString('de-DE')}</p>
          </div>
        </div>
        {canWrite ? (
          <BusinessPartnerForm
            organizationId={organizationId}
            partner={partner}
            roles={partnerRoles}
          />
        ) : (
          <PartnerDetails partner={partner} />
        )}
      </section>
      {canWrite ? (
        <BusinessPartnerRoleManager
          organizationId={organizationId}
          partner={partner}
          roles={partnerRoles}
        />
      ) : null}
      <ContactAssociationManager
        associations={partner.contacts}
        canWrite={canWrite}
        contactSearch={contactSearch}
        contacts={contacts.items}
        organizationId={organizationId}
        owner={{ kind: 'business-partner', value: partner }}
        roles={contactRoles}
      />
      {canArchive ? (
        <section className="panel danger-zone">
          <div>
            <h2>Lebenszyklus</h2>
            <p>Verknüpfungen bleiben beim Archivieren nachvollziehbar.</p>
          </div>
          <LifecycleAction
            entityId={partner.id}
            kind="business-partner"
            organizationId={organizationId}
            status={partner.status}
            version={partner.version}
          />
        </section>
      ) : null}
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function PartnerDetails({ partner }: { partner: Partner }) {
  return (
    <dl className="detail-list">
      <div>
        <dt>E-Mail</dt>
        <dd>{partner.email ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Telefon</dt>
        <dd>{partner.phone ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>USt-ID</dt>
        <dd>{partner.vatId ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Website</dt>
        <dd>{partner.website ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Anschrift</dt>
        <dd>
          {[
            partner.addressLine1,
            partner.addressLine2,
            [partner.postalCode, partner.city].filter(Boolean).join(' '),
            partner.countryCode,
          ]
            .filter(Boolean)
            .join(', ') || 'Nicht angegeben'}
        </dd>
      </div>
      <div>
        <dt>Notizen</dt>
        <dd>{partner.notes ?? 'Nicht angegeben'}</dd>
      </div>
    </dl>
  );
}
