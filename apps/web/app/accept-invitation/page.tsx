import Link from 'next/link';

import { ApiResponseError, getSessionContext, serverApiClient, unwrap } from '../../src/api/server';
import { ExistingUserInvitationForm, NewUserInvitationForm } from './accept-forms';

export const dynamic = 'force-dynamic';

const stateText: Record<string, { title: string; text: string }> = {
  INVALID: {
    title: 'Einladung ungültig',
    text: 'Der Einladungslink ist unbekannt oder unvollständig.',
  },
  EXPIRED: {
    title: 'Einladung abgelaufen',
    text: 'Bitten Sie die Organisation um eine neue Einladung.',
  },
  REVOKED: {
    title: 'Einladung widerrufen',
    text: 'Diese Einladung wurde von der Organisation zurückgenommen.',
  },
  USED: {
    title: 'Einladung bereits verwendet',
    text: 'Dieser Einladungslink kann nur einmal verwendet werden.',
  },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  if (!token) return <InvitationState status="INVALID" />;
  const client = await serverApiClient();
  const validation = unwrap(
    await client.GET('/api/v1/invitations/validate', { params: { query: { token } } }),
  );
  if (validation.status !== 'VALID') return <InvitationState status={validation.status} />;

  let signedInEmail: string | undefined;
  try {
    signedInEmail = (await getSessionContext()).email;
  } catch (error) {
    if (!(error instanceof ApiResponseError && error.status === 401)) throw error;
  }
  const correctSession = signedInEmail?.toLowerCase() === validation.email?.toLowerCase();
  const returnPath = `/accept-invitation?token=${encodeURIComponent(token)}`;

  return (
    <main className="public-shell" id="main-content">
      <section className="auth-card">
        <div>
          <p className="eyebrow">Einladung</p>
          <h1>{validation.organizationName} beitreten.</h1>
          <p className="lede">Die Einladung gilt für {validation.email}.</p>
        </div>
        {validation.existingUser ? (
          correctSession ? (
            <ExistingUserInvitationForm token={token} />
          ) : (
            <div className="form-stack">
              <p>
                Für diese E-Mail-Adresse besteht bereits ein Konto. Melden Sie sich mit genau diesem
                Konto an.
              </p>
              <Link className="button" href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>
                Anmelden und fortfahren
              </Link>
            </div>
          )
        ) : (
          <NewUserInvitationForm token={token} />
        )}
      </section>
    </main>
  );
}

function InvitationState({ status }: { status: string }) {
  const state = stateText[status] ?? stateText.INVALID!;
  return (
    <main className="public-shell" id="main-content">
      <section className="state-card">
        <p className="eyebrow">Einladung</p>
        <h1>{state.title}</h1>
        <p>{state.text}</p>
        <Link className="text-link" href="/sign-in">
          Zur Anmeldung
        </Link>
      </section>
    </main>
  );
}
