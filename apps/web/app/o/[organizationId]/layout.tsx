import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { ApiResponseError, getSessionContext, hasPermission } from '../../../src/api/server';
import { SignOutButton } from '../../components/sign-out-button';
import { WorkspaceNavigation } from '../../components/workspace-navigation';

export const dynamic = 'force-dynamic';

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  try {
    const context = await getSessionContext();
    const membership = context.memberships.find((item) => item.organizationId === organizationId);
    if (!membership) notFound();

    if (membership.status !== 'ACTIVE') {
      return (
        <main className="public-shell" id="main-content">
          <section className="state-card">
            <p className="eyebrow">Zugang gesperrt</p>
            <h1>Diese Mitgliedschaft ist derzeit nicht aktiv.</h1>
            <p>Wenden Sie sich an eine berechtigte Verwaltung der Organisation.</p>
            <div className="button-row">
              <a className="button button--secondary" href="/organizations">
                Andere Organisation wählen
              </a>
              <SignOutButton />
            </div>
          </section>
        </main>
      );
    }

    const canViewTeam = hasPermission(membership, 'memberships.read');
    const canViewArtists = hasPermission(membership, 'artists.read');
    const canViewContacts = hasPermission(membership, 'contacts.read');
    const canViewBusinessPartners = hasPermission(membership, 'business_partners.read');
    const canViewEventFormats = hasPermission(membership, 'event_formats.read');
    const canViewEvents = hasPermission(membership, 'events.read');
    const canViewServices = hasPermission(membership, 'services.read');
    const canViewRevenueTemplates = hasPermission(membership, 'revenue_templates.read');
    const canViewDealTemplates = hasPermission(membership, 'deal_templates.read');
    const canViewDocuments = hasPermission(membership, 'documents.read');
    const canViewDocumentTemplates = hasPermission(membership, 'document_templates.read');
    return (
      <div className="workspace-shell">
        <WorkspaceNavigation
          organizationId={organizationId}
          organizationName={membership.organizationName}
          userEmail={context.email}
          userName={context.name}
          workSections={[
            { href: `/o/${organizationId}`, label: 'Übersicht' },
            ...(canViewEvents
              ? [{ href: `/o/${organizationId}/events`, label: 'Veranstaltungen' }]
              : []),
            ...(canViewDocuments
              ? [{ href: `/o/${organizationId}/documents`, label: 'Dokumente' }]
              : []),
          ]}
          masterDataSections={[
            ...(canViewArtists ? [{ href: `/o/${organizationId}/artists`, label: 'Artists' }] : []),
            ...(canViewContacts
              ? [{ href: `/o/${organizationId}/contacts`, label: 'Kontakte' }]
              : []),
            ...(canViewBusinessPartners
              ? [{ href: `/o/${organizationId}/business-partners`, label: 'Geschäftspartner' }]
              : []),
            ...(canViewServices
              ? [{ href: `/o/${organizationId}/services`, label: 'Leistungen' }]
              : []),
            ...(canViewEventFormats
              ? [{ href: `/o/${organizationId}/event-formats`, label: 'Formate' }]
              : []),
          ]}
          templateSections={[
            ...(canViewRevenueTemplates
              ? [{ href: `/o/${organizationId}/revenue-templates`, label: 'Erlösvorlagen' }]
              : []),
            ...(canViewDealTemplates
              ? [{ href: `/o/${organizationId}/deal-templates`, label: 'Dealvorlagen' }]
              : []),
            ...(canViewDocumentTemplates
              ? [{ href: `/o/${organizationId}/document-templates`, label: 'Dokumentvorlagen' }]
              : []),
          ]}
        >
          <div className="workspace-account">
            <a
              className="workspace-account__link"
              href={`/o/${organizationId}/settings/organization`}
            >
              Organisation
            </a>
            <a className="workspace-account__link" href={`/o/${organizationId}/settings/location`}>
              Location
            </a>
            {canViewTeam ? (
              <a className="workspace-account__link" href={`/o/${organizationId}/settings/team`}>
                Team
              </a>
            ) : null}
            {context.memberships.filter((item) => item.status === 'ACTIVE').length > 1 ? (
              <a className="workspace-account__link" href="/organizations">
                Organisation wechseln
              </a>
            ) : null}
            <SignOutButton />
          </div>
        </WorkspaceNavigation>
        <main className="workspace-main" id="main-content">
          {children}
        </main>
      </div>
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 401) {
      redirect(`/sign-in?next=${encodeURIComponent(`/o/${organizationId}`)}`);
    }
    throw error;
  }
}
