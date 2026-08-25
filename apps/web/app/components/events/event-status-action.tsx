'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ActionMenu } from '../ui/action-menu';
import { Dialog } from '../ui/dialog';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

type EventStatus = components['schemas']['UpdateEventStatusDto']['status'];

const labels: Record<EventStatus, string> = {
  DRAFT: 'Entwurf',
  PLANNED: 'Geplant',
  CONFIRMED: 'Bestätigt',
  COMPLETED: 'Durchgeführt',
  CANCELLED: 'Abgesagt',
};

export function EventStatusAction({
  organizationId,
  eventId,
  version,
  status,
}: {
  organizationId: string;
  eventId: string;
  version: number;
  status: EventStatus;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<EventStatus>(status);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);

  function cancelConfirmation() {
    setEditing(false);
    setConfirming(false);
    setSelected(status);
    setMessage(undefined);
    setConflicts([]);
  }

  function requestChange() {
    setMessage(undefined);
    setConflicts([]);
    if (selected === status) {
      setMessage('Wählen Sie einen anderen Status.');
      return;
    }
    if (selected === 'CANCELLED' || selected === 'COMPLETED') {
      setConfirming(true);
      return;
    }
    void changeStatus();
  }

  async function changeStatus() {
    setPending(true);
    setMessage(undefined);
    setConflicts([]);
    const client = createBrowserApiClient();
    const result = await client.PATCH(
      '/api/v1/organizations/{organizationId}/events/{eventId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, eventId } },
        body: { version, status: selected },
      },
    );
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
      setPending(false);
      return;
    }
    setEditing(false);
    setConfirming(false);
    setPending(false);
    router.refresh();
  }

  return (
    <>
      <ActionMenu
        items={[
          {
            id: 'status',
            label: 'Status bearbeiten',
            onSelect: () => setEditing(true),
          },
        ]}
        label="Weitere Veranstaltungsaktionen"
      />
      <Dialog
        eyebrow="Veranstaltungsstatus"
        onClose={cancelConfirmation}
        open={editing}
        title={confirming ? `${labels[selected]} bestätigen?` : 'Status bearbeiten'}
      >
        <div className="event-status-action">
          {confirming ? (
            <p>
              Die Veranstaltung bleibt historisch sichtbar. Der Status kann bei einer fehlerhaften
              Zuordnung später kontrolliert korrigiert werden.
            </p>
          ) : (
            <label>
              Status
              <select
                onChange={(event) => setSelected(event.target.value as EventStatus)}
                value={selected}
              >
                {(Object.keys(labels) as EventStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {labels[value]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <FormMessage message={message} />
          <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
          <div className="button-row app-dialog__actions">
            <button
              className="button button--secondary"
              disabled={pending}
              onClick={cancelConfirmation}
              type="button"
            >
              Abbrechen
            </button>
            <button
              className={selected === 'CANCELLED' ? 'button button--danger' : 'button'}
              disabled={pending}
              onClick={confirming ? () => void changeStatus() : requestChange}
              type="button"
            >
              {pending
                ? 'Status wird geändert …'
                : confirming
                  ? `${labels[selected]} setzen`
                  : selected === 'CANCELLED' || selected === 'COMPLETED'
                    ? 'Änderung prüfen'
                    : 'Status übernehmen'}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
