import Link from 'next/link';

import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; setup?: string; invitation?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="public-shell" id="main-content">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div>
          <p className="eyebrow">Venue Platform · Phase 1</p>
          <h1 id="sign-in-title">Willkommen zurück.</h1>
          <p className="lede">Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an.</p>
        </div>
        {query.setup === 'complete' ? (
          <p className="notice notice--success">
            Die Ersteinrichtung ist abgeschlossen. Sie können sich jetzt anmelden.
          </p>
        ) : null}
        {query.invitation === 'accepted' ? (
          <p className="notice notice--success">
            Die Einladung wurde angenommen. Bitte melden Sie sich an.
          </p>
        ) : null}
        <SignInForm nextPath={query.next} />
        <p className="muted small">
          Es gibt keine öffentliche Registrierung. Neue Konten entstehen nur über die
          Ersteinrichtung oder einen Einladungslink.
        </p>
        <Link className="text-link" href="/">
          Zur Anwendung
        </Link>
      </section>
    </main>
  );
}
