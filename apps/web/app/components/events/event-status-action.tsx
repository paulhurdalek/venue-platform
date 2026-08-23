'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selected, setSelected] = useState<EventStatus>(status);
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);

  function cancelConfirmation() {
    dialogRef.current?.close();
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
      dialogRef.current?.showModal();
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
    dialogRef.current?.close();
    setPending(false);
    router.refresh();
  }

  return (
    <div className="event-status-action">
      <label>
        Status ändern
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
      <button
        className="button button--quiet"
        disabled={pending}
        onClick={requestChange}
        type="button"
      >
        Übernehmen
      </button>
      <FormMessage message={message} />
      <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
      <dialog
        aria-labelledby={titleId}
        className="confirmation-dialog"
        onCancel={(event) => {
          event.preventDefault();
          cancelConfirmation();
        }}
        ref={dialogRef}
      >
        <div className="confirmation-dialog__content">
          <div>
            <p className="eyebrow">Veranstaltungsstatus</p>
            <h2 id={titleId}>{labels[selected]} bestätigen?</h2>
          </div>
          <p>
            Die Veranstaltung bleibt historisch sichtbar. Der Status kann bei einer fehlerhaften
            Zuordnung später kontrolliert korrigiert werden.
          </p>
          <FormMessage message={message} />
          <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
          <div className="button-row confirmation-dialog__actions">
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
              onClick={() => void changeStatus()}
              type="button"
            >
              {pending ? 'Status wird geändert …' : `${labels[selected]} setzen`}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
