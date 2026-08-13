import { redirect } from 'next/navigation';

import { ApiResponseError, getSessionContext } from '../../src/api/server';
import { SignOutButton } from '../components/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function OrganizationsPage() {
  try {
    const context = await getSessionContext();
    const memberships = context.memberships.filter((membership) => membership.status === 'ACTIVE');
    if (memberships.length === 1) redirect(`/o/${memberships[0]!.organizationId}`);

    return (
      <main className="public-shell public-shell--wide" id="main-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Organisation auswählen</p>
            <h1>Guten Tag, {context.name}.</h1>
            <p>Wählen Sie den Arbeitsbereich, den Sie verwalten möchten.</p>
          </div>
          <SignOutButton />
        </section>
        {memberships.length > 0 ? (
          <div className="selection-grid">
            {memberships.map((membership) => (
              <a
                className="selection-card"
                href={`/o/${membership.organizationId}`}
                key={membership.id}
              >
                <span className="selection-card__label">Organisation</span>
                <strong>{membership.organizationName}</strong>
                <span>{membership.roles.map((role) => role.name).join(', ')}</span>
              </a>
            ))}
          </div>
        ) : (
          <section className="state-card">
            <h2>Kein aktiver Organisationszugang</h2>
            <p>
              Eine gesperrte Mitgliedschaft kann nur durch eine berechtigte Verwaltung reaktiviert
              werden.
            </p>
          </section>
        )}
      </main>
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 401) redirect('/sign-in');
    throw error;
  }
}
