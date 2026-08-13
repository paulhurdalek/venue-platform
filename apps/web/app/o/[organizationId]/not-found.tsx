export default function OrganizationNotFound() {
  return (
    <main className="public-shell" id="main-content">
      <section className="state-card">
        <p className="eyebrow">Nicht gefunden</p>
        <h1>Diese Organisation ist nicht verfügbar.</h1>
        <p>Sie existiert nicht oder Sie besitzen keinen Zugriff darauf.</p>
        <a className="button" href="/">
          Zur Startseite
        </a>
      </section>
    </main>
  );
}
