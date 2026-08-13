import { createVenueApiClient } from '@venue/api-client';

import { webEnvironment } from '../src/config';

export const dynamic = 'force-dynamic';

async function readApiStatus(): Promise<'verbunden' | 'nicht erreichbar'> {
  try {
    const client = createVenueApiClient({ baseUrl: webEnvironment.API_BASE_URL });
    const { data, error } = await client.GET('/api/v1/health', {
      signal: AbortSignal.timeout(1500),
    });

    return data && !error ? 'verbunden' : 'nicht erreichbar';
  } catch {
    return 'nicht erreichbar';
  }
}

export default async function HomePage() {
  const apiStatus = await readApiStatus();
  const isConnected = apiStatus === 'verbunden';

  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Systemstatus</p>
        <h1 id="page-title">Die Projektgrundlage ist eingerichtet.</h1>
        <p className="intro">
          Web, API, Worker und Datenbank sind als getrennte, gemeinsam versionierte Bausteine
          vorbereitet. Fachliche Funktionen folgen erst in den nächsten Phasen.
        </p>
        <div className="status-line" role="status">
          <span className={isConnected ? 'status-dot status-dot--up' : 'status-dot'} />
          API {apiStatus}
        </div>
      </section>

      <section className="foundation" aria-labelledby="foundation-title">
        <div className="section-heading">
          <p className="eyebrow">Technische Bausteine</p>
          <h2 id="foundation-title">Bereit für kontrolliertes Wachstum</h2>
        </div>
        <div className="card-grid">
          <article className="card">
            <span className="card-index">01</span>
            <h3>Web</h3>
            <p>Barrierearme Next.js-Anwendung mit klarer Server-Grenze.</p>
          </article>
          <article className="card">
            <span className="card-index">02</span>
            <h3>API</h3>
            <p>Versionierte NestJS-REST-API mit OpenAPI-Vertrag.</p>
          </article>
          <article className="card">
            <span className="card-index">03</span>
            <h3>Worker</h3>
            <p>Eigenständig startbarer Prozess für spätere Hintergrundarbeit.</p>
          </article>
          <article className="card">
            <span className="card-index">04</span>
            <h3>Datenbank</h3>
            <p>PostgreSQL mit kontrollierten, versionierten Prisma-Migrationen.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
