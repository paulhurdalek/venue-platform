'use client';

import type { components } from '@venue/api-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';

type Booking = components['schemas']['BookingDto'];
type ProgramItem = components['schemas']['EventProgramItemDto'];
type ProgramKind = ProgramItem['kind'];

export function PerformanceOrder({
  bookings,
  canWrite,
  eventId,
  focusItemId,
  items,
  onChange,
  organizationId,
}: {
  bookings: Booking[];
  canWrite: boolean;
  eventId: string;
  focusItemId?: string;
  items: ProgramItem[];
  onChange: (items: ProgramItem[]) => void;
  organizationId: string;
}) {
  const [adding, setAdding] = useState<ProgramKind>();
  const [bookingId, setBookingId] = useState('');
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusItemId) return;
    section.current
      ?.querySelector<HTMLButtonElement>(`[data-program-handle="${focusItemId}"]`)
      ?.focus();
  }, [focusItemId, items]);

  const knownDuration = items.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);

  function beginCreate(kind: ProgramKind) {
    setAdding(kind);
    setBookingId(kind === 'PERFORMANCE' ? (bookings[0]?.id ?? '') : '');
    setLabel(kind === 'BREAK' ? 'Umbaupause' : '');
    setDuration('');
    setMessage('');
  }

  async function createItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding === 'PERFORMANCE' && !bookingId) return;
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/events/{eventId}/program-items',
      {
        params: { path: { organizationId, eventId } },
        body: {
          kind: adding!,
          bookingId: adding === 'PERFORMANCE' ? bookingId : null,
          label: label.trim() || null,
          durationMinutes: duration ? Number(duration) : null,
        },
      },
    );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Programmpunkt konnte nicht angelegt werden.'));
      setPending(false);
      return;
    }
    onChange([...items, result.data].sort(programOrder));
    setAdding(undefined);
    setMessage('Der Programmpunkt wurde angelegt.');
    setPending(false);
    requestAnimationFrame(() =>
      section.current
        ?.querySelector<HTMLButtonElement>(`[data-program-handle="${result.data!.id}"]`)
        ?.focus(),
    );
  }

  function beginEdit(item: ProgramItem) {
    setEditingId(item.id);
    setLabel(item.label ?? '');
    setDuration(item.durationMinutes?.toString() ?? '');
    setMessage('');
  }

  async function saveItem(item: ProgramItem) {
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.PATCH(
      '/api/v1/organizations/{organizationId}/program-items/{itemId}',
      {
        params: { path: { organizationId, itemId: item.id } },
        body: {
          version: item.version,
          label: label.trim() || null,
          durationMinutes: duration ? Number(duration) : null,
        },
      },
    );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Der Programmpunkt konnte nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    onChange(items.map((candidate) => (candidate.id === item.id ? result.data! : candidate)));
    setEditingId(undefined);
    setMessage('Der Programmpunkt wurde gespeichert.');
    setPending(false);
  }

  async function removeItem(item: ProgramItem) {
    if (!window.confirm(`„${itemTitle(item)}“ aus der Auftrittsreihenfolge entfernen?`)) return;
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.DELETE(
      '/api/v1/organizations/{organizationId}/program-items/{itemId}',
      {
        params: {
          path: { organizationId, itemId: item.id },
          query: { version: item.version },
        },
      },
    );
    const failure = (result as { error?: unknown }).error;
    if (failure) {
      setMessage(apiErrorMessage(failure, 'Der Programmpunkt konnte nicht entfernt werden.'));
      setPending(false);
      return;
    }
    onChange(items.filter((candidate) => candidate.id !== item.id));
    setMessage('Der Programmpunkt wurde entfernt.');
    setPending(false);
  }

  async function moveItem(itemId: string, targetIndex: number) {
    const sourceIndex = items.findIndex((item) => item.id === itemId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    if (sourceIndex === targetIndex) return;
    const previous = items;
    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved!);
    onChange(next.map((item, index) => ({ ...item, sortOrder: index + 1 })));
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.PUT(
      '/api/v1/organizations/{organizationId}/events/{eventId}/program/order',
      {
        params: { path: { organizationId, eventId } },
        body: { items: next.map((item) => ({ itemId: item.id, version: item.version })) },
      },
    );
    if (!result.data || result.error) {
      onChange(previous);
      setMessage(
        `${apiErrorMessage(result.error, 'Die Auftrittsreihenfolge konnte nicht gespeichert werden.')} Die vorherige Reihenfolge wurde wiederhergestellt.`,
      );
      setPending(false);
      focusHandle(itemId);
      return;
    }
    onChange(result.data);
    setMessage('Die Auftrittsreihenfolge wurde gespeichert.');
    setPending(false);
    focusHandle(itemId);
  }

  function focusHandle(itemId: string) {
    requestAnimationFrame(() =>
      section.current
        ?.querySelector<HTMLButtonElement>(`[data-program-handle="${itemId}"]`)
        ?.focus(),
    );
  }

  return (
    <section
      aria-labelledby="performance-order-heading"
      className="performance-order"
      ref={section}
    >
      <div className="compact-section-heading">
        <div>
          <h3 id="performance-order-heading">Auftrittsreihenfolge</h3>
          <p>
            {items.length} Programmpunkte · bekannte Gesamtdauer {knownDuration} Minuten
          </p>
        </div>
        {canWrite && !adding ? (
          <div className="button-row">
            <button
              className="button button--compact"
              onClick={() => beginCreate('PERFORMANCE')}
              type="button"
            >
              Auftritt hinzufügen
            </button>
            <button
              className="button button--ghost button--compact"
              onClick={() => beginCreate('BREAK')}
              type="button"
            >
              Pause / Umbauzeit
            </button>
          </div>
        ) : null}
      </div>

      {adding ? (
        <form className="program-item-editor form-grid" onSubmit={createItem}>
          {adding === 'PERFORMANCE' ? (
            <label>
              Booking
              <select
                onChange={(event) => setBookingId(event.target.value)}
                required
                value={bookingId}
              >
                <option value="">Booking auswählen</option>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.artistName} · {bookingRoleLabel(booking)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Bezeichnung <span className="optional">optional</span>
            <input
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
              value={label}
            />
          </label>
          <label>
            Dauer in Minuten <span className="optional">optional</span>
            <input
              max={1440}
              min={1}
              onChange={(event) => setDuration(event.target.value)}
              type="number"
              value={duration}
            />
          </label>
          <div className="form-span button-row">
            <button className="button" disabled={pending} type="submit">
              Programmpunkt anlegen
            </button>
            <button
              className="button button--ghost"
              disabled={pending}
              onClick={() => setAdding(undefined)}
              type="button"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      {items.length ? (
        <ol aria-label="Gespeicherte Auftrittsreihenfolge" className="program-list">
          {items.map((item, index) => (
            <li
              className={`program-row ${dropTargetId === item.id ? 'program-row--drop-target' : ''}`}
              key={item.id}
              onDragOver={(event) => {
                if (!draggedId || draggedId === item.id) return;
                event.preventDefault();
                setDropTargetId(item.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedId;
                setDraggedId(undefined);
                setDropTargetId(undefined);
                if (sourceId) void moveItem(sourceId, index);
              }}
            >
              <span aria-hidden="true" className="program-position">
                {index + 1}
              </span>
              {canWrite ? (
                <button
                  aria-label={`${itemTitle(item)} ziehen. Mit Pfeil nach oben oder unten verschieben.`}
                  className="program-drag-handle"
                  data-program-handle={item.id}
                  disabled={pending}
                  draggable
                  onDragEnd={() => {
                    setDraggedId(undefined);
                    setDropTargetId(undefined);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                    setDraggedId(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      void moveItem(item.id, index - 1);
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      void moveItem(item.id, index + 1);
                    }
                  }}
                  type="button"
                >
                  <span aria-hidden="true">⋮⋮</span>
                </button>
              ) : null}
              <div className="program-copy">
                {editingId === item.id ? (
                  <div className="program-inline-editor">
                    <label>
                      Bezeichnung <span className="optional">optional</span>
                      <input
                        maxLength={120}
                        onChange={(event) => setLabel(event.target.value)}
                        value={label}
                      />
                    </label>
                    <label>
                      Dauer in Minuten <span className="optional">optional</span>
                      <input
                        max={1440}
                        min={1}
                        onChange={(event) => setDuration(event.target.value)}
                        type="number"
                        value={duration}
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="button button--compact"
                        disabled={pending}
                        onClick={() => void saveItem(item)}
                        type="button"
                      >
                        Speichern
                      </button>
                      <button
                        className="button button--ghost button--compact"
                        onClick={() => setEditingId(undefined)}
                        type="button"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{itemTitle(item)}</strong>
                    <span>
                      {item.label ?? (item.kind === 'BREAK' ? 'Pause' : 'Auftritt')}
                      {' · '}
                      {item.durationMinutes ? `${item.durationMinutes} Minuten` : 'Dauer offen'}
                    </span>
                    {item.bookingId ? (
                      <Link href={`#booking-${item.bookingId}`}>Zum Booking</Link>
                    ) : null}
                  </>
                )}
              </div>
              {canWrite && editingId !== item.id ? (
                <div className="program-actions">
                  <button
                    aria-label={`${itemTitle(item)} nach oben`}
                    className="button button--ghost button--compact"
                    disabled={pending || index === 0}
                    onClick={() => void moveItem(item.id, index - 1)}
                    type="button"
                  >
                    Nach oben
                  </button>
                  <button
                    aria-label={`${itemTitle(item)} nach unten`}
                    className="button button--ghost button--compact"
                    disabled={pending || index === items.length - 1}
                    onClick={() => void moveItem(item.id, index + 1)}
                    type="button"
                  >
                    Nach unten
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    disabled={pending}
                    onClick={() => beginEdit(item)}
                    type="button"
                  >
                    Bearbeiten
                  </button>
                  <button
                    className="button button--ghost button--compact"
                    disabled={pending}
                    onClick={() => void removeItem(item)}
                    type="button"
                  >
                    Entfernen
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="compact-empty">Noch keine aktiven Programmpunkte.</p>
      )}
      <FormMessage message={message} />
    </section>
  );
}

function itemTitle(item: ProgramItem) {
  return item.kind === 'BREAK'
    ? (item.label ?? 'Pause / Umbauzeit')
    : (item.artistName ?? 'Auftritt');
}

function bookingRoleLabel(booking: Pick<Booking, 'role' | 'customRoleLabel'>) {
  if (booking.role === 'ARTIST') return 'Artist';
  if (booking.role === 'MODERATOR') return 'Moderator';
  return booking.customRoleLabel ?? 'Weitere Rolle';
}

function programOrder(left: ProgramItem, right: ProgramItem) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}
