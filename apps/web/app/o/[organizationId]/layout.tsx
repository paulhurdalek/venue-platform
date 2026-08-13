import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { ApiResponseError, getSessionContext, hasPermission } from '../../../src/api/server';
import { SignOutButton } from '../../components/sign-out-button';

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
    return (
      <div className="workspace-shell">
        <header className="workspace-header">
          <a className="workspace-brand" href={`/o/${organizationId}`}>
            <span className="brand-mark" aria-hidden="true">
              VP
            </span>
            <span>
              <strong>{membership.organizationName}</strong>
              <small>Verwaltung</small>
            </span>
          </a>
          <nav aria-label="Hauptnavigation" className="workspace-nav">
            <a href={`/o/${organizationId}`}>Übersicht</a>
            <a href={`/o/${organizationId}/settings/organization`}>Organisation</a>
            <a href={`/o/${organizationId}/settings/location`}>Location</a>
            {canViewTeam ? <a href={`/o/${organizationId}/settings/team`}>Team</a> : null}
          </nav>
          <div className="workspace-account">
            {context.memberships.filter((item) => item.status === 'ACTIVE').length > 1 ? (
              <a className="text-link" href="/organizations">
                Organisation wechseln
              </a>
            ) : null}
            <span>{context.name}</span>
            <SignOutButton />
          </div>
        </header>
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
