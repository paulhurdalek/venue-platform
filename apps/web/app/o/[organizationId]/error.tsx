'use client';

export default function OrganizationError({ reset }: { reset: () => void }) {
  return (
    <section className="state-card" role="alert">
      <p className="eyebrow">Anfrage fehlgeschlagen</p>
      <h1>Die Daten konnten nicht geladen werden.</h1>
      <p>
        Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, wenden Sie sich an die
        Administration.
      </p>
      <button className="button" onClick={reset} type="button">
        Erneut versuchen
      </button>
    </section>
  );
}
