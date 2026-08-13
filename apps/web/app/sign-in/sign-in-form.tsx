'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';

import { authClient } from '../../src/auth-client';
import { FormMessage } from '../components/form-message';

export function SignInForm({ nextPath = '/' }: { nextPath: string | undefined }) {
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get('email') ?? '')
        .trim()
        .toLowerCase(),
      password: String(form.get('password') ?? ''),
      rememberMe: true,
    });
    if (result.error) {
      setMessage('Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.');
      setPending(false);
      return;
    }
    window.location.assign(nextPath.startsWith('/') ? nextPath : '/');
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        E-Mail-Adresse
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Passwort
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      <FormMessage message={message} />
      <button className="button" disabled={pending} type="submit">
        {pending ? 'Anmeldung läuft …' : 'Anmelden'}
      </button>
    </form>
  );
}
