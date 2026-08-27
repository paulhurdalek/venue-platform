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
    return (
      <div className="workspace-shell">
        <WorkspaceNavigation
          organizationId={organizationId}
          organizationName={membership.organizationName}
          sections={[
            { href: `/o/${organizationId}`, label: 'Übersicht' },
            ...(canViewArtists ? [{ href: `/o/${organizationId}/artists`, label: 'Artists' }] : []),
            ...(canViewContacts
              ? [{ href: `/o/${organizationId}/contacts`, label: 'Kontakte' }]
              : []),
            ...(canViewBusinessPartners
              ? [{ href: `/o/${organizationId}/business-partners`, label: 'Geschäftspartner' }]
              : []),
            ...(canViewEventFormats
              ? [{ href: `/o/${organizationId}/event-formats`, label: 'Formate' }]
              : []),
            ...(canViewEvents
              ? [{ href: `/o/${organizationId}/events`, label: 'Veranstaltungen' }]
              : []),
            ...(canViewServices
              ? [{ href: `/o/${organizationId}/services`, label: 'Leistungen' }]
              : []),
            ...(canViewRevenueTemplates
              ? [{ href: `/o/${organizationId}/revenue-templates`, label: 'Erlösvorlagen' }]
              : []),
            { href: `/o/${organizationId}/settings/organization`, label: 'Organisation' },
            { href: `/o/${organizationId}/settings/location`, label: 'Location' },
            ...(canViewTeam ? [{ href: `/o/${organizationId}/settings/team`, label: 'Team' }] : []),
          ]}
        >
          <div className="workspace-account">
            {context.memberships.filter((item) => item.status === 'ACTIVE').length > 1 ? (
              <a className="text-link" href="/organizations">
                Organisation wechseln
              </a>
            ) : null}
            <span>{context.name}</span>
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
