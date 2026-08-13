'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../src/api/browser';
import { FormMessage } from '../components/form-message';

async function accept(body: {
  token: string;
  name?: string;
  password?: string;
  passwordConfirmation?: string;
}) {
  const client = createBrowserApiClient();
  return client.POST('/api/v1/invitations/accept', {
    credentials: 'include',
    body,
  });
}

export function NewUserInvitationForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const { data, error } = await accept({
      token,
      name: String(form.get('name') ?? ''),
      password: String(form.get('password') ?? ''),
      passwordConfirmation: String(form.get('passwordConfirmation') ?? ''),
    });
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Einladung konnte nicht angenommen werden.'));
      setPending(false);
      return;
    }
    window.location.assign(`/sign-in?invitation=accepted`);
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Ihr Name
        <input autoComplete="name" name="name" required />
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
      <FormMessage message={message} />
      <button className="button" disabled={pending} type="submit">
        {pending ? 'Einladung wird angenommen …' : 'Konto anlegen und Einladung annehmen'}
      </button>
    </form>
  );
}

export function ExistingUserInvitationForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <div className="form-stack">
      <FormMessage message={message} />
      <button
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const { data, error } = await accept({ token });
          if (!data || error) {
            setMessage(apiErrorMessage(error, 'Die Einladung konnte nicht angenommen werden.'));
            setPending(false);
            return;
          }
          window.location.assign(`/o/${data.organizationId}`);
        }}
        type="button"
      >
        {pending ? 'Einladung wird angenommen …' : 'Einladung annehmen'}
      </button>
    </div>
  );
}
