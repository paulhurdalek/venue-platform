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
  CompactEmpty,
  ContactChannels,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
  formatAddress,
  SafeWebLink,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import {
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
  const canCreateContacts = hasPermission(membership, 'contacts.write');
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
      <EditableDetail
        badges={
          <span className={`status-badge status-badge--${partner.status.toLowerCase()}`}>
            {partner.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
        }
        canEdit={canWrite}
        editTitle="Geschäftspartner bearbeiten"
        eyebrow="Geschäftspartner"
        id="business-partner-detail"
        sectionTitle="Unternehmensdaten"
        secondaryActions={
          canArchive ? (
            <LifecycleAction
              entityId={partner.id}
              kind="business-partner"
              organizationId={organizationId}
              status={partner.status}
              version={partner.version}
            />
          ) : null
        }
        summary={partner.roles.map((role) => role.name).join(', ') || undefined}
        title={partner.companyName}
        updatedLabel={`Zuletzt geändert: ${new Date(partner.updatedAt).toLocaleString('de-DE')}`}
        view={<PartnerDetails partner={partner} />}
      >
        {canWrite ? (
          <BusinessPartnerForm
            organizationId={organizationId}
            partner={partner}
            roles={partnerRoles}
          />
        ) : null}
      </EditableDetail>
      <ContactAssociationManager
        associations={partner.contacts}
        canWrite={canWrite}
        canCreateContacts={canCreateContacts}
        contactSearch={contactSearch}
        contacts={contacts.items}
        organizationId={organizationId}
        owner={{ kind: 'business-partner', value: partner }}
        roles={contactRoles}
      />
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function PartnerDetails({ partner }: { partner: Partner }) {
  const address = formatAddress(partner);
  const billingAddress = formatAddress({
    addressLine1: partner.billingAddressLine1,
    addressLine2: partner.billingAddressLine2,
    postalCode: partner.billingPostalCode,
    city: partner.billingCity,
    state: partner.billingState,
    countryCode: partner.billingCountryCode,
  });
  const hasContact = Boolean(partner.email || partner.phone || partner.website);
  const hasCompany = Boolean(partner.vatId || address || billingAddress);
  if (!hasContact && !hasCompany && !partner.notes) {
    return <CompactEmpty>Keine weiteren Unternehmensdaten hinterlegt.</CompactEmpty>;
  }
  return (
    <DetailSections>
      {hasContact ? (
        <DetailSection title="Kontakt">
          <ContactChannels contact={partner} emptyMessage={null} />
          {partner.website ? (
            <DetailFields>
              <DetailField label="Website">
                <SafeWebLink href={partner.website} />
              </DetailField>
            </DetailFields>
          ) : null}
        </DetailSection>
      ) : null}
      {hasCompany ? (
        <DetailSection title="Unternehmensangaben">
          <DetailFields>
            {partner.vatId ? <DetailField label="USt-ID">{partner.vatId}</DetailField> : null}
            {address ? <DetailField label="Anschrift">{address}</DetailField> : null}
            {billingAddress ? (
              <DetailField label="Rechnungsanschrift">{billingAddress}</DetailField>
            ) : null}
          </DetailFields>
        </DetailSection>
      ) : null}
      {partner.notes ? (
        <DetailSection title="Interne Angaben" wide>
          <DetailFields>
            <DetailField label="Notizen" wide>
              <span className="pre-wrap">{partner.notes}</span>
            </DetailField>
          </DetailFields>
        </DetailSection>
      ) : null}
    </DetailSections>
  );
}
