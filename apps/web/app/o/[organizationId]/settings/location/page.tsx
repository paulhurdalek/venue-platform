import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import {
  ContactChannels,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
  formatAddress,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import { LocationForm } from './location-form';

export default async function LocationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/o/${organizationId}/settings/location`;
  const membership = await activePageMembership(organizationId, returnPath);
  if (!membership) return null;
  const client = await serverApiClient();
  const locations = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/locations', {
      params: { path: { organizationId } },
    }),
  );
  const location = locations[0];
  const canEdit = hasPermission(membership, 'location.edit');

  if (!location) {
    return (
      <>
        <header className="page-heading">
          <div>
            <p className="eyebrow">Einstellungen</p>
            <h1>Location</h1>
          </div>
        </header>
        <section className="state-card">
          <h2>Keine Location verfügbar</h2>
          <p>Die Organisation besitzt derzeit keine aktive Phase-1-Location.</p>
        </section>
      </>
    );
  }

  return (
    <EditableDetail
      badges={
        <span className={`status-badge status-badge--${location.status.toLowerCase()}`}>
          {location.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
        </span>
      }
      canEdit={canEdit}
      editTitle="Location bearbeiten"
      eyebrow="Einstellungen"
      id="location-detail"
      sectionTitle="Locationdaten"
      summary={location.name}
      title="Location"
      updatedLabel={`Zuletzt geändert: ${new Date(location.updatedAt).toLocaleString('de-DE')}`}
      view={<LocationDetails location={location} />}
    >
      {canEdit ? <LocationForm location={location} /> : null}
    </EditableDetail>
  );
}

function LocationDetails({
  location,
}: {
  location: {
    name: string;
    timezone: string;
    capacity?: number | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    countryCode?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
}) {
  const address = formatAddress(location);

  return (
    <DetailSections>
      <DetailSection title="Basisdaten">
        <DetailFields>
          <DetailField label="Name">{location.name}</DetailField>
          <DetailField label="Zeitzone">{location.timezone}</DetailField>
          {location.capacity !== null && location.capacity !== undefined ? (
            <DetailField label="Kapazität">{location.capacity}</DetailField>
          ) : null}
        </DetailFields>
      </DetailSection>
      {address ? (
        <DetailSection title="Adresse">
          <DetailFields>
            <DetailField label="Anschrift">{address}</DetailField>
          </DetailFields>
        </DetailSection>
      ) : null}
      {location.contactEmail || location.contactPhone ? (
        <DetailSection title="Kontakt">
          <ContactChannels
            contact={{ email: location.contactEmail, phone: location.contactPhone }}
            emptyMessage={null}
          />
        </DetailSection>
      ) : null}
    </DetailSections>
  );
}
