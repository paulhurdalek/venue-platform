import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import {
  ContactChannels,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import { OrganizationForm } from './organization-form';

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/o/${organizationId}/settings/organization`;
  const membership = await activePageMembership(organizationId, returnPath);
  if (!membership) return null;
  const client = await serverApiClient();
  const organization = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}', {
      params: { path: { organizationId } },
    }),
  );
  const canEdit = hasPermission(membership, 'organization.edit');

  return (
    <EditableDetail
      badges={
        <span className={`status-badge status-badge--${organization.status.toLowerCase()}`}>
          {organization.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
        </span>
      }
      canEdit={canEdit}
      editTitle="Organisation bearbeiten"
      eyebrow="Einstellungen"
      id="organization-detail"
      sectionTitle="Organisationsdaten"
      summary={organization.name}
      title="Organisation"
      updatedLabel={`Zuletzt geändert: ${new Date(organization.updatedAt).toLocaleString('de-DE')}`}
      view={<OrganizationDetails organization={organization} />}
    >
      {canEdit ? <OrganizationForm organization={organization} /> : null}
    </EditableDetail>
  );
}

function OrganizationDetails({
  organization,
}: {
  organization: {
    name: string;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}) {
  return (
    <DetailSections>
      <DetailSection title="Basisdaten">
        <DetailFields>
          <DetailField label="Name">{organization.name}</DetailField>
          {organization.legalName ? (
            <DetailField label="Rechtlicher Name">{organization.legalName}</DetailField>
          ) : null}
        </DetailFields>
      </DetailSection>
      {organization.email || organization.phone ? (
        <DetailSection title="Kontakt">
          <ContactChannels contact={organization} emptyMessage={null} />
        </DetailSection>
      ) : null}
    </DetailSections>
  );
}
