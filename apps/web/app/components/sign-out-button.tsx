'use client';

import { useState } from 'react';

import { authClient } from '../../src/auth-client';

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      className="button button--quiet"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign('/sign-in');
      }}
      type="button"
    >
      {pending ? 'Abmelden …' : 'Abmelden'}
    </button>
  );
}
