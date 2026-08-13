import { serverApiClient, unwrap } from '../../src/api/server';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

const messages: Record<string, { title: string; text: string }> = {
  INVALID: {
    title: 'Einrichtungslink ungültig',
    text: 'Der Link ist unbekannt oder unvollständig.',
  },
  EXPIRED: {
    title: 'Einrichtungslink abgelaufen',
    text: 'Erzeugen Sie einen neuen Link mit dem Bootstrap-Befehl.',
  },
  USED: {
    title: 'Einrichtungslink bereits verwendet',
    text: 'Dieser Link kann nur einmal verwendet werden.',
  },
  UNAVAILABLE: {
    title: 'Ersteinrichtung abgeschlossen',
    text: 'Für diese Installation ist keine weitere Ersteinrichtung möglich.',
  },
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  let status = 'INVALID';
  let expiresAt: string | undefined;
  if (token) {
    const client = await serverApiClient();
    const result = await client.GET('/api/v1/setup/bootstrap', { params: { query: { token } } });
    const data = unwrap(result);
    status = data.status;
    expiresAt = data.expiresAt;
  }
  const state = messages[status];

  return (
    <main className="public-shell public-shell--wide" id="main-content">
      <section className="auth-card auth-card--wide">
        <div>
          <p className="eyebrow">Einmalige Ersteinrichtung</p>
          <h1>{status === 'VALID' ? 'Organisation einrichten.' : state?.title}</h1>
          <p className="lede">
            {status === 'VALID'
              ? 'Legen Sie den ersten Administrator, die Organisation und die erste Location an.'
              : state?.text}
          </p>
          {status === 'VALID' && expiresAt ? (
            <p className="muted small">
              Der Link ist gültig bis {new Date(expiresAt).toLocaleString('de-DE')}.
            </p>
          ) : null}
        </div>
        {status === 'VALID' && token ? <SetupForm token={token} /> : null}
      </section>
    </main>
  );
}
