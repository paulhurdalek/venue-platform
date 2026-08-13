'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../src/api/browser';
import { FormMessage } from '../components/form-message';

export function SetupForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const client = createBrowserApiClient();
    const { data, error } = await client.POST('/api/v1/setup/bootstrap', {
      credentials: 'include',
      body: {
        token,
        administratorName: String(form.get('administratorName') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        passwordConfirmation: String(form.get('passwordConfirmation') ?? ''),
        organizationName: String(form.get('organizationName') ?? ''),
        locationName: String(form.get('locationName') ?? ''),
        timezone: String(form.get('timezone') ?? ''),
      },
    });
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Einrichtung konnte nicht abgeschlossen werden.'));
      setPending(false);
      return;
    }
    window.location.assign('/sign-in?setup=complete');
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Name des Administrators
        <input autoComplete="name" name="administratorName" required />
      </label>
      <label>
        E-Mail-Adresse
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Passwort
        <input
          autoComplete="new-password"
          minLength={10}
          name="password"
          required
          type="password"
        />
        <span className="field-hint">Mindestens die serverseitig konfigurierte Mindestlänge.</span>
      </label>
      <label>
        Passwort bestätigen
        <input
          autoComplete="new-password"
          minLength={10}
          name="passwordConfirmation"
          required
          type="password"
        />
      </label>
      <label>
        Organisation
        <input name="organizationName" required />
      </label>
      <label>
        Location
        <input name="locationName" required />
      </label>
      <label className="form-span">
        IANA-Zeitzone
        <input defaultValue="Europe/Berlin" name="timezone" required />
        <span className="field-hint">Beispiel: Europe/Berlin</span>
      </label>
      <div className="form-span">
        <FormMessage message={message} />
        <button className="button" disabled={pending} type="submit">
          {pending ? 'Einrichtung läuft …' : 'Ersteinrichtung abschließen'}
        </button>
      </div>
    </form>
  );
}
