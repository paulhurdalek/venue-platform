import { activePageMembership } from '../../../src/api/page-access';
import { hasPermission } from '../../../src/api/server';

export default async function OrganizationHomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}`);
  if (!membership) return null;

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Arbeitsbereich</p>
          <h1>{membership.organizationName}</h1>
          <p>Verwalten Sie Organisation, Betriebsort und die zentralen Stammdaten.</p>
        </div>
      </header>
      <div className="selection-grid selection-grid--compact">
        {hasPermission(membership, 'artists.read') ? (
          <a className="selection-card" href={`/o/${organizationId}/artists`}>
            <span className="selection-card__label">Programm</span>
            <strong>Artists</strong>
            <span>Artists und ihre zentralen Kontaktbeziehungen verwalten.</span>
          </a>
        ) : null}
        {hasPermission(membership, 'contacts.read') ? (
          <a className="selection-card" href={`/o/${organizationId}/contacts`}>
            <span className="selection-card__label">Adressbuch</span>
            <strong>Kontakte</strong>
            <span>Personen einmalig pflegen und mehrfach verknüpfen.</span>
          </a>
        ) : null}
        {hasPermission(membership, 'business_partners.read') ? (
          <a className="selection-card" href={`/o/${organizationId}/business-partners`}>
            <span className="selection-card__label">Netzwerk</span>
            <strong>Geschäftspartner</strong>
            <span>Kunden, Veranstalter, Agenturen und Dienstleister verwalten.</span>
          </a>
        ) : null}
        <a className="selection-card" href={`/o/${organizationId}/settings/organization`}>
          <span className="selection-card__label">Stammdaten</span>
          <strong>Organisation</strong>
          <span>Name und Kontaktdaten ansehen.</span>
        </a>
        <a className="selection-card" href={`/o/${organizationId}/settings/location`}>
          <span className="selection-card__label">Betriebsort</span>
          <strong>Location</strong>
          <span>Adresse, Zeitzone und Kapazität ansehen.</span>
        </a>
        {hasPermission(membership, 'memberships.read') ? (
          <a className="selection-card" href={`/o/${organizationId}/settings/team`}>
            <span className="selection-card__label">Zugriff</span>
            <strong>Team</strong>
            <span>Mitglieder, Rollen und Einladungen verwalten.</span>
          </a>
        ) : null}
      </div>
    </>
  );
}
