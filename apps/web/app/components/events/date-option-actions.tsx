'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

export function DateOptionActions({
  organizationId,
  optionId,
  version,
  canPromote,
}: {
  organizationId: string;
  optionId: string;
  version: number;
  canPromote: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);

  async function mutate(action: 'release' | 'promote') {
    if (action === 'release' && !window.confirm('Terminoption wirklich freigeben?')) return;
    setPending(true);
    setMessage(undefined);
    setConflicts([]);
    const client = createBrowserApiClient();
    const result =
      action === 'release'
        ? await client.PATCH(
            '/api/v1/organizations/{organizationId}/date-options/{optionId}/release',
            {
              credentials: 'include',
              params: { path: { organizationId, optionId } },
              body: { version },
            },
          )
        : await client.PATCH(
            '/api/v1/organizations/{organizationId}/date-options/{optionId}/promote',
            {
              credentials: 'include',
              params: { path: { organizationId, optionId } },
              body: { version },
            },
          );
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(apiErrorMessage(result.error, 'Die Aktion konnte nicht ausgeführt werden.'));
      setPending(false);
      return;
    }
    setPending(false);
    router.refresh();
  }

  return (
    <div className="event-status-action">
      <div className="button-row">
        {canPromote ? (
          <button
            className="button button--secondary"
            disabled={pending}
            onClick={() => void mutate('promote')}
            type="button"
          >
            Zur 1. Option hochstufen
          </button>
        ) : null}
        <button
          className="button button--quiet"
          disabled={pending}
          onClick={() => void mutate('release')}
          type="button"
        >
          Freigeben
        </button>
      </div>
      <FormMessage message={message} />
      <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
    </div>
  );
}
