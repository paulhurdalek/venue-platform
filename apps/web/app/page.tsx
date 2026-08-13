import { redirect } from 'next/navigation';

import { ApiResponseError, getSessionContext } from '../src/api/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const context = await getSessionContext();
    const active = context.memberships.filter((membership) => membership.status === 'ACTIVE');
    if (active.length === 1) redirect(`/o/${active[0]!.organizationId}`);
    if (active.length > 1) redirect('/organizations');
    return (
      <main className="public-shell" id="main-content">
        <section className="state-card">
          <p className="eyebrow">Kein aktiver Zugang</p>
          <h1>Derzeit ist keine aktive Organisation verfügbar.</h1>
          <p>
            Eine gesperrte Mitgliedschaft kann nur durch eine berechtigte Verwaltung reaktiviert
            werden.
          </p>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 401) redirect('/sign-in');
    throw error;
  }
}
