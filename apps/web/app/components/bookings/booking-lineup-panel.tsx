'use client';

import type { components } from '@venue/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
  prefillArtistContacts,
} from '../../../src/booking-utils';
import { FormMessage } from '../form-message';
import { ArtistCombobox } from './artist-combobox';
import { LineupRequirements } from './lineup-requirements';
import { PerformanceOrder } from './performance-order';

type Booking = components['schemas']['BookingDto'];
type BookingStatus = Booking['status'];
type Role = Booking['role'];
type Progress = components['schemas']['BookingProgressDto'];
type Requirements = components['schemas']['LineupRequirementSetDto'];
type Requirement = components['schemas']['LineupRequirementDto'];
type Artist = components['schemas']['ArtistDto'];
type ProgramItem = components['schemas']['EventProgramItemDto'];
type HotelArrangement = Booking['hotelArrangement'];

type BookingDraft = {
  artistId: string;
  role: Role;
  customRoleLabel: string;
  status: BookingStatus;
  internalNote: string;
  businessPartnerId: string;
  contactId: string;
  agreedFeeAmount: string;
  agreedFeeCurrency: string;
  travelArrangement: string;
  travelCostAmount: string;
  travelCostCurrency: string;
  hotelArrangement: HotelArrangement;
  hotelBuyoutAmount: string;
  hotelBuyoutCurrency: string;
  hotelNote: string;
};

type StatusConfirmation = { booking: Booking; status: BookingStatus };
type DuplicateBooking = {
  body: components['schemas']['CreateBookingDto'];
  existing: {
    id: string;
    role: Role;
    customRoleLabel: string | null;
    status: BookingStatus;
  };
};

const bookingStatuses: BookingStatus[] = [
  'SHORTLISTED',
  'REQUESTED',
  'OPTION',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
];

export function BookingLineupPanel({
  artists,
  canCreateArtist,
  canEditArtist,
  canFinance,
  canLineupWrite,
  canStatus,
  canWrite,
  eventId,
  initialBookings,
  initialProgress,
  initialProgramItems,
  initialRequirements,
  organizationId,
}: {
  artists: Artist[];
  canCreateArtist: boolean;
  canEditArtist: boolean;
  canFinance: boolean;
  canLineupWrite: boolean;
  canStatus: boolean;
  canWrite: boolean;
  eventId: string;
  initialBookings: Booking[];
  initialProgress: Progress;
  initialProgramItems: ProgramItem[];
  initialRequirements: Requirements;
  organizationId: string;
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initialBookings);
  const [progress, setProgress] = useState(initialProgress);
  const [programItems, setProgramItems] = useState(initialProgramItems);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [showHistorical, setShowHistorical] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [statusPendingId, setStatusPendingId] = useState<string>();
  const [message, setMessage] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, BookingStatus>>({});
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>();
  const [duplicateBooking, setDuplicateBooking] = useState<DuplicateBooking>();
  const [programFocusItemId, setProgramFocusItemId] = useState<string>();
  const [draft, setDraft] = useState<BookingDraft>(() => emptyDraft());
  const [editDraft, setEditDraft] = useState<BookingDraft>(() => emptyDraft());
  const [selectedArtist, setSelectedArtist] = useState<Artist>();
  const [selectedEditArtist, setSelectedEditArtist] = useState<Artist>();
  const [automaticContact, setAutomaticContact] = useState(false);
  const [createdArtistId, setCreatedArtistId] = useState<string>();

  async function refresh(includeHistorical = showHistorical) {
    const client = createBrowserApiClient();
    const [bookingResult, progressResult, programResult] = await Promise.all([
      client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/bookings', {
        params: { path: { organizationId, eventId }, query: { includeHistorical } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/booking-progress', {
        params: { path: { organizationId, eventId } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/program-items', {
        params: { path: { organizationId, eventId } },
      }),
    ]);
    if (
      !bookingResult.data ||
      !progressResult.data ||
      !programResult.data ||
      bookingResult.error ||
      progressResult.error ||
      programResult.error
    ) {
      setMessage('Das Line-up konnte nicht vollständig aktualisiert werden.');
      return;
    }
    setBookings(bookingResult.data);
    setProgress(progressResult.data);
    setProgramItems(programResult.data);
  }

  async function toggleHistorical(checked: boolean) {
    setShowHistorical(checked);
    await refresh(checked);
  }

  function setDraftValue<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setEditValue<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
    setEditDraft((current) => ({ ...current, [key]: value }));
  }

  function selectArtist(artist: Artist | undefined) {
    setSelectedArtist(artist);
    setCreatedArtistId(
      artist && !artists.some(({ id }) => id === artist.id) ? artist.id : undefined,
    );
    const prefill = artist
      ? prefillArtistContacts(artist)
      : { businessPartnerId: '', contactId: '', automatic: false };
    setDraft((current) => ({
      ...current,
      artistId: artist?.id ?? '',
      businessPartnerId: prefill.businessPartnerId,
      contactId: prefill.contactId,
    }));
    setAutomaticContact(prefill.automatic);
  }

  function setRole(requirement: Requirement | Role | 'CUSTOM', editing = false) {
    const set = editing ? setEditDraft : setDraft;
    const selectedRequirement =
      typeof requirement === 'object'
        ? requirement
        : requirement === 'ARTIST' || requirement === 'MODERATOR'
          ? requirements.items.find((candidate) => candidate.role === requirement)
          : undefined;
    const role: Role = selectedRequirement
      ? selectedRequirement.role
      : requirement === 'CUSTOM'
        ? 'OTHER'
        : (requirement as Role);
    set((current) => ({
      ...current,
      role,
      customRoleLabel:
        role === 'OTHER'
          ? selectedRequirement
            ? (selectedRequirement.customRoleLabel ?? '')
            : current.role === 'OTHER'
              ? current.customRoleLabel
              : ''
          : '',
      ...(!editing && canFinance
        ? {
            agreedFeeAmount: minorAmountToInput(
              selectedRequirement?.defaultFeeMinor,
              selectedRequirement?.defaultFeeCurrency ?? 'EUR',
            ),
            agreedFeeCurrency: selectedRequirement?.defaultFeeCurrency ?? 'EUR',
          }
        : {}),
    }));
  }

  function beginAdd() {
    const suggestion = requirements.items.find((requirement) => requirement.role === 'ARTIST');
    setDraft({
      ...emptyDraft(),
      ...(canFinance
        ? {
            agreedFeeAmount: minorAmountToInput(
              suggestion?.defaultFeeMinor,
              suggestion?.defaultFeeCurrency ?? 'EUR',
            ),
            agreedFeeCurrency: suggestion?.defaultFeeCurrency ?? 'EUR',
          }
        : {}),
    });
    setSelectedArtist(undefined);
    setAutomaticContact(false);
    setCreatedArtistId(undefined);
    setAdding(true);
    setMessage('');
  }

  function requirementsChanged(next: Requirements) {
    setRequirements(next);
    void refresh();
  }

  async function createBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    let body: components['schemas']['CreateBookingDto'];
    try {
      body = bookingBody(draft, canFinance);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte die Geldbeträge prüfen.');
      setPending(false);
      return;
    }
    await submitBooking(body);
  }

  async function submitBooking(
    body: components['schemas']['CreateBookingDto'],
    confirmDuplicateArtist = false,
  ) {
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/events/{eventId}/bookings',
      {
        params: { path: { organizationId, eventId } },
        body: { ...body, confirmDuplicateArtist },
      },
    );
    if (!result.data || result.error) {
      const existing = duplicateBookingDetails(result.error);
      if (existing) {
        setDuplicateBooking({ body, existing });
        setMessage('');
        setPending(false);
        return;
      }
      setMessage(apiErrorMessage(result.error, 'Das Booking konnte nicht angelegt werden.'));
      setPending(false);
      return;
    }
    setDraft(emptyDraft());
    setSelectedArtist(undefined);
    setAdding(false);
    setMessage('Das Booking wurde angelegt.');
    await refresh();
    router.refresh();
    setPending(false);
  }

  async function addPerformanceToExistingBooking(conflict: DuplicateBooking) {
    setPending(true);
    setMessage('');
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/events/{eventId}/program-items',
      {
        params: { path: { organizationId, eventId } },
        body: {
          kind: 'PERFORMANCE',
          bookingId: conflict.existing.id,
          label: null,
          durationMinutes: null,
        },
      },
    );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Der weitere Auftritt konnte nicht angelegt werden.'),
      );
      setPending(false);
      return;
    }
    setProgramItems((current) => [...current, result.data!]);
    setProgramFocusItemId(result.data.id);
    setDuplicateBooking(undefined);
    setAdding(false);
    setDraft(emptyDraft());
    setSelectedArtist(undefined);
    setMessage('Ein weiterer Auftritt wurde dem bestehenden Booking hinzugefügt.');
    setPending(false);
  }

  async function beginEdit(booking: Booking) {
    setEditingId(booking.id);
    setEditDraft(fromBooking(booking));
    setMessage('');
    const cached = artists.find(({ id }) => id === booking.artistId);
    if (cached) {
      setSelectedEditArtist(cached);
      return;
    }
    const client = createBrowserApiClient();
    const result = await client.GET('/api/v1/organizations/{organizationId}/artists/{artistId}', {
      params: { path: { organizationId, artistId: booking.artistId } },
    });
    if (result.data) setSelectedEditArtist(result.data);
  }

  async function saveBooking(booking: Booking) {
    setPending(true);
    setMessage('');
    let body: Omit<components['schemas']['UpdateBookingDto'], 'version'>;
    try {
      body = bookingUpdateBody(editDraft, canFinance);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte die Geldbeträge prüfen.');
      setPending(false);
      return;
    }
    const client = createBrowserApiClient();
    const result = await client.PATCH(
      '/api/v1/organizations/{organizationId}/bookings/{bookingId}',
      {
        params: { path: { organizationId, bookingId: booking.id } },
        body: { version: booking.version, ...body },
      },
    );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Das Booking konnte nicht gespeichert werden.'));
      setPending(false);
      return;
    }
    setEditingId(undefined);
    setMessage('Das Booking wurde gespeichert.');
    await refresh();
    router.refresh();
    setPending(false);
  }

  function requestStatusChange(booking: Booking, status: BookingStatus) {
    if (status === booking.status) return;
    setSelectedStatuses((current) => ({ ...current, [booking.id]: status }));
    if (
      status === 'DECLINED' ||
      status === 'CANCELLED' ||
      booking.status === 'DECLINED' ||
      booking.status === 'CANCELLED'
    ) {
      setStatusConfirmation({ booking, status });
      return;
    }
    void changeStatus(booking, status, null);
  }

  async function changeStatus(booking: Booking, status: BookingStatus, note: string | null) {
    if (status === booking.status) return;
    setStatusPendingId(booking.id);
    setMessage('');
    const reactivation =
      (booking.status === 'DECLINED' || booking.status === 'CANCELLED') && isActive(status);
    const client = createBrowserApiClient();
    const result = await client.PATCH(
      '/api/v1/organizations/{organizationId}/bookings/{bookingId}/status',
      {
        params: { path: { organizationId, bookingId: booking.id } },
        body: { version: booking.version, status, note, confirmReactivation: reactivation },
      },
    );
    if (!result.data || result.error) {
      setSelectedStatuses((current) => ({ ...current, [booking.id]: booking.status }));
      setMessage(apiErrorMessage(result.error, 'Der Bookingstatus konnte nicht geändert werden.'));
      setStatusPendingId(undefined);
      return;
    }
    setBookings((current) =>
      current
        .map((candidate) => (candidate.id === booking.id ? result.data! : candidate))
        .filter((candidate) => showHistorical || isActive(candidate.status)),
    );
    setSelectedStatuses((current) => {
      const next = { ...current };
      delete next[booking.id];
      return next;
    });
    setMessage(`Status geändert: ${statusLabel(status)}.`);
    setStatusPendingId(undefined);
    await refresh();
    router.refresh();
  }

  const activeBookings = bookings.filter((booking) => isActive(booking.status));

  return (
    <section className="booking-panel" aria-labelledby="booking-lineup-heading">
      <div className="booking-panel-heading">
        <div>
          <p className="eyebrow">Booking &amp; Line-up</p>
          <h2 id="booking-lineup-heading">Besetzung im Blick</h2>
        </div>
      </div>
      <ProgressOverview progress={progress} />
      <div className="lineup-list-heading compact-section-heading">
        <div>
          <h3>Aktuelles Line-up</h3>
          <p>{activeBookings.length} aktive geschäftliche Bookings</p>
        </div>
        <div className="lineup-heading-actions">
          <label className="check-row compact-check">
            <input
              checked={showHistorical}
              onChange={(event) => void toggleHistorical(event.target.checked)}
              type="checkbox"
            />
            Historische einblenden
          </label>
          {canWrite && !adding ? (
            <button className="button button--compact" onClick={beginAdd} type="button">
              {activeBookings.length ? 'Artist hinzufügen' : 'Ersten Artist hinzufügen'}
            </button>
          ) : null}
        </div>
      </div>

      {adding ? (
        <form className="booking-editor form-grid" onSubmit={createBooking}>
          <div className="form-span compact-section-heading">
            <div>
              <h3>Artist zum Line-up hinzufügen</h3>
              <p>Das Booking referenziert den organisationsweiten Artist-Stammdatensatz.</p>
            </div>
          </div>
          <ArtistCombobox
            canCreateArtist={canCreateArtist}
            initialArtists={artists}
            onSelect={selectArtist}
            organizationId={organizationId}
            selected={selectedArtist}
          />
          {createdArtistId ? (
            <p className="form-span compact-success">
              Artist angelegt.{' '}
              <Link href={`/o/${organizationId}/artists/${createdArtistId}`}>
                Vollständiges Profil öffnen
              </Link>
            </p>
          ) : null}
          <BookingFields
            artist={selectedArtist}
            automaticContact={automaticContact}
            canFinance={canFinance}
            draft={draft}
            onContactManualChange={() => setAutomaticContact(false)}
            onRoleChange={(choice) => setRole(choice)}
            requirements={requirements.items}
            setValue={setDraftValue}
          />
          <label>
            Anfangsstatus
            <select
              onChange={(event) => setDraftValue('status', event.target.value as BookingStatus)}
              value={draft.status}
            >
              {bookingStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-span">
            <FormMessage message={message} />
            <div className="button-row">
              <button className="button" disabled={pending || !draft.artistId} type="submit">
                {pending ? 'Speichern …' : 'Booking anlegen'}
              </button>
              <button
                className="button button--ghost"
                disabled={pending}
                onClick={() => {
                  setAdding(false);
                  setDraft(emptyDraft());
                  setSelectedArtist(undefined);
                }}
                type="button"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {bookings.length > 0 ? (
        <div className="booking-list">
          {bookings.map((booking) => {
            const statusSaving = statusPendingId === booking.id;
            return (
              <article
                className={`booking-card ${isActive(booking.status) ? '' : 'booking-card--historical'}`}
                id={`booking-${booking.id}`}
                key={booking.id}
              >
                <div className="booking-card-main">
                  <div className="booking-card-copy">
                    <div className="booking-title-row">
                      <div>
                        <h4>
                          <Link href={`/o/${organizationId}/artists/${booking.artistId}`}>
                            {booking.artistName}
                          </Link>
                        </h4>
                        <p className="booking-role">{roleLabel(booking)}</p>
                      </div>
                      {canStatus ? (
                        <label className="booking-status-select">
                          <span className="sr-only">Status von {booking.artistName}</span>
                          <select
                            aria-label={`Status von ${booking.artistName}`}
                            className={`status-select status-select--${booking.status.toLowerCase()}`}
                            disabled={statusSaving}
                            onChange={(event) =>
                              requestStatusChange(booking, event.target.value as BookingStatus)
                            }
                            value={selectedStatuses[booking.id] ?? booking.status}
                          >
                            {bookingStatuses.map((status) => (
                              <option key={status} value={status}>
                                {statusLabel(status)}
                              </option>
                            ))}
                          </select>
                          {statusSaving ? <span aria-live="polite">Wird gespeichert …</span> : null}
                        </label>
                      ) : (
                        <span
                          className={`status-badge status-badge--booking-${booking.status.toLowerCase()}`}
                        >
                          {statusLabel(booking.status)}
                        </span>
                      )}
                    </div>
                    <BookingContactBlock
                      booking={booking}
                      canEditArtist={canEditArtist}
                      organizationId={organizationId}
                    />
                    {canFinance ? (
                      <div className="booking-money">
                        <span>
                          Gage:{' '}
                          {formatMinorAmount(booking.agreedFeeMinor, booking.agreedFeeCurrency) ??
                            'keine Gage'}
                        </span>
                        {booking.travelCostMinor ? (
                          <span>
                            Reisekosten:{' '}
                            {formatMinorAmount(booking.travelCostMinor, booking.travelCostCurrency)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {booking.internalNote ? (
                      <p className="booking-note" title={booking.internalNote}>
                        {booking.internalNote}
                      </p>
                    ) : null}
                  </div>
                </div>
                {editingId === booking.id ? (
                  <div className="booking-inline-editor form-grid">
                    <BookingFields
                      artist={selectedEditArtist}
                      automaticContact={false}
                      canFinance={canFinance}
                      draft={editDraft}
                      onContactManualChange={() => undefined}
                      onRoleChange={(choice) => setRole(choice, true)}
                      requirements={requirements.items}
                      setValue={setEditValue}
                    />
                    <div className="form-span button-row">
                      <button
                        className="button"
                        disabled={pending}
                        onClick={() => void saveBooking(booking)}
                        type="button"
                      >
                        Änderungen speichern
                      </button>
                      <button
                        className="button button--ghost"
                        onClick={() => setEditingId(undefined)}
                        type="button"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="booking-actions">
                    {canWrite ? (
                      <button
                        className="button button--secondary button--compact"
                        onClick={() => void beginEdit(booking)}
                        type="button"
                      >
                        Booking bearbeiten
                      </button>
                    ) : null}
                    <details className="booking-details">
                      <summary>Bookingdetails und Statushistorie</summary>
                      <dl>
                        <div>
                          <dt>Hotelregelung</dt>
                          <dd>{hotelArrangementLabel(booking.hotelArrangement)}</dd>
                        </div>
                        {canFinance && booking.hotelArrangement === 'BUYOUT' ? (
                          <div>
                            <dt>Hotel-Buy-out</dt>
                            <dd>
                              {formatMinorAmount(
                                booking.hotelBuyoutMinor,
                                booking.hotelBuyoutCurrency,
                              ) ?? 'Betrag offen'}
                            </dd>
                          </div>
                        ) : null}
                        {booking.hotelNote ? (
                          <div>
                            <dt>Hotelnotiz</dt>
                            <dd>{booking.hotelNote}</dd>
                          </div>
                        ) : null}
                        {booking.travelArrangement ? (
                          <div>
                            <dt>Reisevereinbarung</dt>
                            <dd>{booking.travelArrangement}</dd>
                          </div>
                        ) : null}
                        {canFinance && booking.travelCostMinor ? (
                          <div>
                            <dt>Reisekosten</dt>
                            <dd>
                              {formatMinorAmount(
                                booking.travelCostMinor,
                                booking.travelCostCurrency,
                              )}
                            </dd>
                          </div>
                        ) : null}
                        {booking.statusHistory.map((history) => (
                          <div key={history.id}>
                            <dt>{new Date(history.changedAt).toLocaleString('de-DE')}</dt>
                            <dd>
                              {statusLabel(history.previousStatus)} →{' '}
                              {statusLabel(history.newStatus)} · {history.actorName}
                              {history.note ? ` · ${history.note}` : ''}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="lineup-empty">
          <p>Noch keine Bookings im Line-up.</p>
          {canWrite && !adding ? (
            <button className="button" onClick={beginAdd} type="button">
              Ersten Artist hinzufügen
            </button>
          ) : null}
        </div>
      )}
      <PerformanceOrder
        bookings={activeBookings}
        canWrite={canLineupWrite}
        eventId={eventId}
        {...(programFocusItemId ? { focusItemId: programFocusItemId } : {})}
        items={programItems}
        onChange={setProgramItems}
        organizationId={organizationId}
      />
      <FormMessage message={message} />
      <LineupRequirements
        canFinance={canFinance}
        canWrite={canLineupWrite}
        initial={requirements}
        onChange={requirementsChanged}
        organizationId={organizationId}
        resourceId={eventId}
        resourceType="event"
      />
      {statusConfirmation ? (
        <StatusConfirmationDialog
          change={statusConfirmation}
          onCancel={() => {
            setSelectedStatuses((current) => ({
              ...current,
              [statusConfirmation.booking.id]: statusConfirmation.booking.status,
            }));
            setStatusConfirmation(undefined);
          }}
          onConfirm={(note) => {
            const change = statusConfirmation;
            setStatusConfirmation(undefined);
            void changeStatus(change.booking, change.status, note);
          }}
        />
      ) : null}
      {duplicateBooking ? (
        <DuplicateBookingDialog
          conflict={duplicateBooking}
          onAddPerformance={() => void addPerformanceToExistingBooking(duplicateBooking)}
          onCancel={() => setDuplicateBooking(undefined)}
          onCreateSeparate={() => {
            const conflict = duplicateBooking;
            setDuplicateBooking(undefined);
            void submitBooking(conflict.body, true);
          }}
          pending={pending}
        />
      ) : null}
    </section>
  );
}

function ProgressOverview({ progress }: { progress: Progress }) {
  return (
    <div className="booking-progress-grid" aria-label="Bookingfortschritt">
      {progress.roles.length > 0 ? (
        progress.roles.map((role) => (
          <article
            className="booking-progress-card"
            key={`${role.role}:${role.customRoleLabel ?? ''}`}
          >
            <strong>{role.label}</strong>
            <span className="progress-primary">
              {role.confirmedCount}/{role.requiredCount} bestätigt
            </span>
            <span>
              {role.optionCount ? `${role.optionCount} Option · ` : ''}
              {role.requestedCount ? `${role.requestedCount} angefragt · ` : ''}
              {role.shortlistedCount ? `${role.shortlistedCount} vorgemerkt · ` : ''}
              {role.missingCount} fehlt
            </span>
          </article>
        ))
      ) : (
        <article className="booking-progress-card booking-progress-card--empty">
          <strong>Fortschritt noch nicht berechenbar</strong>
          <span>Bitte Line-up-Vorgaben festlegen.</span>
        </article>
      )}
      <article className="booking-progress-card booking-progress-card--summary">
        <strong>{progress.complete ? 'Vollständig bestätigt' : 'Booking in Arbeit'}</strong>
        <span>
          {progress.totalOpenRequests} offene Anfragen · {progress.totalOptions} Optionen
        </span>
        <span>
          {progress.moderatorRequired
            ? progress.moderatorConfirmed
              ? 'Moderator bestätigt'
              : 'Moderator fehlt'
            : 'Kein Moderator benötigt'}
        </span>
      </article>
    </div>
  );
}

function BookingFields({
  artist,
  automaticContact,
  canFinance,
  draft,
  onContactManualChange,
  onRoleChange,
  requirements,
  setValue,
}: {
  artist: Artist | undefined;
  automaticContact: boolean;
  canFinance: boolean;
  draft: BookingDraft;
  onContactManualChange: () => void;
  onRoleChange: (choice: Requirement | Role | 'CUSTOM') => void;
  requirements: Requirement[];
  setValue: <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => void;
}) {
  const partner = artist?.businessPartners.find(
    (association) => association.businessPartner.id === draft.businessPartnerId,
  );
  const contactOptions = useMemo(() => {
    if (!artist) return [];
    if (partner)
      return partner.representatives
        .filter(({ contact }) => contact.status === 'ACTIVE')
        .map(({ contact }) => contact);
    return artist.contacts
      .filter(({ contact }) => contact.status === 'ACTIVE')
      .map(({ contact }) => contact);
  }, [artist, partner]);
  const customRequirements = uniqueCustomRequirements(requirements);
  const roleValue = roleSelectValue(draft, customRequirements);
  const selectedContact = contactOptions.find(({ id }) => id === draft.contactId);
  return (
    <>
      <label>
        Rolle
        <select
          onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith('requirement:')) {
              const requirement = customRequirements.find(({ id }) => id === value.slice(12));
              if (requirement) onRoleChange(requirement);
            } else onRoleChange(value === 'CUSTOM' ? 'CUSTOM' : (value as Role));
          }}
          value={roleValue}
        >
          <option value="ARTIST">Artist</option>
          <option value="MODERATOR">Moderator</option>
          {customRequirements.map((requirement) => (
            <option key={requirement.id} value={`requirement:${requirement.id}`}>
              {requirement.customRoleLabel}
            </option>
          ))}
          <option value="CUSTOM">Weitere Rolle …</option>
        </select>
      </label>
      {draft.role === 'OTHER' && roleValue === 'CUSTOM' ? (
        <label>
          Rollenbezeichnung
          <input
            maxLength={120}
            onChange={(event) => setValue('customRoleLabel', event.target.value)}
            required
            value={draft.customRoleLabel}
          />
        </label>
      ) : null}
      <label>
        Agentur / Management <span className="optional">optional</span>
        <select
          onChange={(event) => {
            setValue('businessPartnerId', event.target.value);
            setValue('contactId', '');
            onContactManualChange();
          }}
          value={draft.businessPartnerId}
        >
          <option value="">Keine</option>
          {artist?.businessPartners
            .filter(({ businessPartner }) => businessPartner.status === 'ACTIVE')
            .map(({ businessPartner }) => (
              <option key={businessPartner.id} value={businessPartner.id}>
                {businessPartner.companyName}
              </option>
            ))}
        </select>
      </label>
      <label>
        Ansprechpartner <span className="optional">optional</span>
        <select
          onChange={(event) => {
            setValue('contactId', event.target.value);
            onContactManualChange();
          }}
          value={draft.contactId}
        >
          <option value="">Keiner</option>
          {contactOptions.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contactLabel(contact)}
            </option>
          ))}
        </select>
      </label>
      {automaticContact ? (
        <p className="form-span auto-prefill-note">Automatisch aus dem Artistprofil übernommen</p>
      ) : null}
      {selectedContact &&
      (selectedContact.email || selectedContact.mobile || selectedContact.phone) ? (
        <p className="form-span selected-contact-preview">
          {selectedContact.email ? (
            <a href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a>
          ) : null}
          {selectedContact.mobile ? (
            <a href={`tel:${selectedContact.mobile}`}>Mobil {selectedContact.mobile}</a>
          ) : null}
          {selectedContact.phone ? (
            <a href={`tel:${selectedContact.phone}`}>Telefon {selectedContact.phone}</a>
          ) : null}
        </p>
      ) : null}
      <label className="form-span">
        Interne Bookingnotiz <span className="optional">optional</span>
        <textarea
          maxLength={5000}
          onChange={(event) => setValue('internalNote', event.target.value)}
          rows={3}
          value={draft.internalNote}
        />
      </label>
      {canFinance ? (
        <div className="form-span money-fields">
          <label>
            Vereinbarte Gage <span className="optional">optional / keine Gage</span>
            <input
              inputMode="decimal"
              onChange={(event) => setValue('agreedFeeAmount', event.target.value)}
              placeholder="200,00"
              value={draft.agreedFeeAmount}
            />
          </label>
          <label>
            Währung
            <span className="currency-fixed">EUR (€)</span>
          </label>
          <label>
            Reisekosten <span className="optional">optional</span>
            <input
              inputMode="decimal"
              onChange={(event) => setValue('travelCostAmount', event.target.value)}
              placeholder="25,00"
              value={draft.travelCostAmount}
            />
          </label>
          <label>
            Währung
            <span className="currency-fixed">EUR (€)</span>
          </label>
        </div>
      ) : null}
      <label className="form-span">
        Reisevereinbarung <span className="optional">optional</span>
        <textarea
          maxLength={5000}
          onChange={(event) => setValue('travelArrangement', event.target.value)}
          rows={2}
          value={draft.travelArrangement}
        />
      </label>
      <label>
        Hotelregelung
        <select
          onChange={(event) => setValue('hotelArrangement', event.target.value as HotelArrangement)}
          value={draft.hotelArrangement}
        >
          <option value="NONE">Kein Hotel</option>
          <option value="REQUIRED">Hotel erforderlich</option>
          <option value="BUYOUT">Hotel-Buy-out</option>
        </select>
      </label>
      {draft.hotelArrangement === 'BUYOUT' && canFinance ? (
        <div className="form-span money-fields hotel-buyout-fields">
          <label>
            Buy-out-Betrag <span className="optional">optional</span>
            <input
              inputMode="decimal"
              onChange={(event) => setValue('hotelBuyoutAmount', event.target.value)}
              placeholder="100,00"
              value={draft.hotelBuyoutAmount}
            />
          </label>
          <label>
            Währung
            <span className="currency-fixed">EUR (€)</span>
          </label>
        </div>
      ) : null}
      <label className="form-span">
        Hotelnotiz <span className="optional">optional</span>
        <input
          maxLength={2000}
          onChange={(event) => setValue('hotelNote', event.target.value)}
          value={draft.hotelNote}
        />
      </label>
    </>
  );
}

function BookingContactBlock({
  booking,
  canEditArtist,
  organizationId,
}: {
  booking: Booking;
  canEditArtist: boolean;
  organizationId: string;
}) {
  const directContact = !booking.businessPartnerId && !booking.hasActiveRepresentation;
  const hasDirectChannels = Boolean(booking.artistEmail || booking.artistPhone);
  const hasContactData = Boolean(
    booking.businessPartnerName || booking.contactName || (directContact && hasDirectChannels),
  );
  const compactEmail = directContact ? booking.artistEmail : booking.contactEmail;
  const compactPhone = directContact
    ? booking.artistPhone
    : (booking.contactMobile ?? booking.contactPhone);
  return (
    <details className="booking-contact-block">
      <summary>
        <span>
          <strong>
            {directContact
              ? 'Eigenvertretung · Direktkontakt'
              : (booking.businessPartnerName ?? 'Keine Vertretung ausgewählt')}
          </strong>
          {!directContact ? <span>{booking.contactName ?? 'Kein Ansprechpartner'}</span> : null}
        </span>
        <span className="booking-contact-channels">
          {compactEmail ? (
            <a href={`mailto:${compactEmail}`} onClick={(event) => event.stopPropagation()}>
              {compactEmail}
            </a>
          ) : null}
          {compactPhone ? (
            <a href={`tel:${compactPhone}`} onClick={(event) => event.stopPropagation()}>
              {compactPhone}
            </a>
          ) : null}
        </span>
        <span className="booking-contact-toggle">Kontakte aufklappen</span>
      </summary>
      <div className="booking-contact-expanded">
        {directContact && !hasDirectChannels ? (
          <p>
            Keine Direktkontaktdaten im Artistprofil hinterlegt.
            {canEditArtist ? (
              <>
                {' '}
                <Link href={`/o/${organizationId}/artists/${booking.artistId}`}>
                  Direktkontakt im Artistprofil ergänzen
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {!directContact && !hasContactData ? <p>Keine Kontaktdaten zugeordnet.</p> : null}
        {directContact && hasDirectChannels ? (
          <p className="booking-contact-line">
            {booking.artistEmail ? (
              <a href={`mailto:${booking.artistEmail}`}>{booking.artistEmail}</a>
            ) : null}
            {booking.artistPhone ? (
              <a href={`tel:${booking.artistPhone}`}>Telefon {booking.artistPhone}</a>
            ) : null}
          </p>
        ) : null}
        {booking.businessPartnerId ? (
          <p>
            Firma:{' '}
            <Link href={`/o/${organizationId}/business-partners/${booking.businessPartnerId}`}>
              {booking.businessPartnerName}
            </Link>
            {booking.businessPartnerRoleNames?.length
              ? ` · ${booking.businessPartnerRoleNames.join(', ')}`
              : ''}
            {booking.businessPartnerStatus === 'ARCHIVED' ? ' · Archiviert' : ''}
          </p>
        ) : null}
        {booking.contactId ? (
          <ContactDetails
            contact={{
              id: booking.contactId,
              name: booking.contactName ?? 'Kontakt',
              functionLabel: booking.contactFunctionLabel ?? null,
              status: booking.contactStatus ?? 'ACTIVE',
              email: booking.contactEmail ?? null,
              phone: booking.contactPhone ?? null,
              mobile: booking.contactMobile ?? null,
              roleNames: booking.contactRoleNames ?? [],
              isPrimary: booking.contactIsPrimary ?? false,
            }}
            organizationId={organizationId}
            primary={booking.contactIsPrimary ?? false}
          />
        ) : null}
        {booking.additionalContacts?.length ? (
          <div className="additional-contacts">
            <strong>Weitere Ansprechpartner</strong>
            {booking.additionalContacts.map((contact) => (
              <ContactDetails contact={contact} key={contact.id} organizationId={organizationId} />
            ))}
          </div>
        ) : null}
        <Link href={`/o/${organizationId}/artists/${booking.artistId}`}>Artistprofil öffnen</Link>
      </div>
    </details>
  );
}

function ContactDetails({
  contact,
  organizationId,
  primary = false,
}: {
  contact: components['schemas']['BookingContactDto'];
  organizationId: string;
  primary?: boolean;
}) {
  return (
    <div className="booking-contact-person">
      <p>
        <Link href={`/o/${organizationId}/contacts/${contact.id}`}>{contact.name}</Link>
        {contact.functionLabel ? ` · ${contact.functionLabel}` : ''}
        {primary || contact.isPrimary ? ' · Primärer Ansprechpartner' : ''}
        {contact.roleNames.length ? ` · ${contact.roleNames.join(', ')}` : ''}
        {contact.status === 'ARCHIVED' ? ' · Archiviert' : ''}
      </p>
      <p className="booking-contact-line">
        {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
        {contact.mobile ? <a href={`tel:${contact.mobile}`}>Mobil {contact.mobile}</a> : null}
        {contact.phone ? <a href={`tel:${contact.phone}`}>Telefon {contact.phone}</a> : null}
      </p>
    </div>
  );
}

function StatusConfirmationDialog({
  change,
  onCancel,
  onConfirm,
}: {
  change: StatusConfirmation;
  onCancel: () => void;
  onConfirm: (note: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  useEffect(() => dialog.current?.showModal(), []);
  const reactivation = !isActive(change.booking.status) && isActive(change.status);
  return (
    <dialog
      aria-labelledby="booking-status-confirm-heading"
      className="confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialog}
    >
      <form
        className="confirmation-dialog__content"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(note.trim() || null);
        }}
      >
        <div>
          <p className="eyebrow">Bookingstatus</p>
          <h2 id="booking-status-confirm-heading">
            {reactivation
              ? 'Booking reaktivieren?'
              : `Status auf „${statusLabel(change.status)}“ setzen?`}
          </h2>
        </div>
        <p>
          {change.booking.artistName}: {statusLabel(change.booking.status)} →{' '}
          {statusLabel(change.status)}
        </p>
        <label>
          Statusnotiz <span className="optional">optional</span>
          <textarea
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            value={note}
          />
        </label>
        <div className="button-row confirmation-dialog__actions">
          <button className="button" type="submit">
            Änderung bestätigen
          </button>
          <button className="button button--ghost" onClick={onCancel} type="button">
            Abbrechen
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DuplicateBookingDialog({
  conflict,
  onAddPerformance,
  onCancel,
  onCreateSeparate,
  pending,
}: {
  conflict: DuplicateBooking;
  onAddPerformance: () => void;
  onCancel: () => void;
  onCreateSeparate: () => void;
  pending: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      aria-labelledby="duplicate-booking-heading"
      className="confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialog}
    >
      <div className="confirmation-dialog__content">
        <div>
          <p className="eyebrow">Bestehendes Booking</p>
          <h2 id="duplicate-booking-heading">
            Dieser Artist ist für diese Veranstaltung bereits gebucht.
          </h2>
        </div>
        <p>
          Bestehendes Booking: {roleLabel(conflict.existing)} ·{' '}
          {statusLabel(conflict.existing.status)}
        </p>
        <div className="duplicate-booking-actions">
          <button className="button" disabled={pending} onClick={onAddPerformance} type="button">
            Weiteren Auftritt zum bestehenden Booking hinzufügen
            <span>Empfohlen</span>
          </button>
          <button
            className="button button--secondary"
            disabled={pending}
            onClick={onCreateSeparate}
            type="button"
          >
            Trotzdem separates Booking anlegen
          </button>
          <button
            className="button button--ghost"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </dialog>
  );
}

function bookingBody(
  draft: BookingDraft,
  canFinance: boolean,
): components['schemas']['CreateBookingDto'] {
  return {
    artistId: draft.artistId,
    role: draft.role,
    ...(draft.role === 'OTHER' ? { customRoleLabel: draft.customRoleLabel.trim() } : {}),
    status: draft.status,
    internalNote: draft.internalNote.trim() || null,
    businessPartnerId: draft.businessPartnerId || null,
    contactId: draft.contactId || null,
    ...(canFinance
      ? draft.agreedFeeAmount
        ? {
            agreedFeeMinor: majorAmountToMinor(draft.agreedFeeAmount, 'EUR'),
            agreedFeeCurrency: 'EUR',
          }
        : { agreedFeeMinor: null, agreedFeeCurrency: null }
      : {}),
    travelArrangement: draft.travelArrangement.trim() || null,
    ...(canFinance
      ? draft.travelCostAmount
        ? {
            travelCostMinor: majorAmountToMinor(draft.travelCostAmount, 'EUR'),
            travelCostCurrency: 'EUR',
          }
        : { travelCostMinor: null, travelCostCurrency: null }
      : {}),
    hotelArrangement: draft.hotelArrangement,
    hotelRequired: draft.hotelArrangement === 'REQUIRED',
    ...(canFinance
      ? draft.hotelArrangement === 'BUYOUT' && draft.hotelBuyoutAmount
        ? {
            hotelBuyoutMinor: majorAmountToMinor(draft.hotelBuyoutAmount, 'EUR'),
            hotelBuyoutCurrency: 'EUR',
          }
        : { hotelBuyoutMinor: null, hotelBuyoutCurrency: null }
      : {}),
    hotelNote: draft.hotelNote.trim() || null,
    confirmDuplicateArtist: false,
  };
}

function bookingUpdateBody(
  draft: BookingDraft,
  canFinance: boolean,
): Omit<components['schemas']['UpdateBookingDto'], 'version'> {
  const values = bookingBody(draft, canFinance);
  return {
    role: values.role,
    ...(values.customRoleLabel !== undefined ? { customRoleLabel: values.customRoleLabel } : {}),
    internalNote: values.internalNote ?? null,
    businessPartnerId: values.businessPartnerId ?? null,
    contactId: values.contactId ?? null,
    ...(values.agreedFeeMinor !== undefined
      ? {
          agreedFeeMinor: values.agreedFeeMinor,
          agreedFeeCurrency: values.agreedFeeCurrency ?? null,
        }
      : {}),
    travelArrangement: values.travelArrangement ?? null,
    ...(values.travelCostMinor !== undefined
      ? {
          travelCostMinor: values.travelCostMinor,
          travelCostCurrency: values.travelCostCurrency ?? null,
        }
      : {}),
    hotelArrangement: draft.hotelArrangement,
    hotelRequired: draft.hotelArrangement === 'REQUIRED',
    ...(values.hotelBuyoutMinor !== undefined
      ? {
          hotelBuyoutMinor: values.hotelBuyoutMinor,
          hotelBuyoutCurrency: values.hotelBuyoutCurrency ?? null,
        }
      : {}),
    hotelNote: values.hotelNote ?? null,
  };
}

function emptyDraft(): BookingDraft {
  return {
    artistId: '',
    role: 'ARTIST',
    customRoleLabel: '',
    status: 'SHORTLISTED',
    internalNote: '',
    businessPartnerId: '',
    contactId: '',
    agreedFeeAmount: '',
    agreedFeeCurrency: 'EUR',
    travelArrangement: '',
    travelCostAmount: '',
    travelCostCurrency: 'EUR',
    hotelArrangement: 'NONE',
    hotelBuyoutAmount: '',
    hotelBuyoutCurrency: 'EUR',
    hotelNote: '',
  };
}

function fromBooking(booking: Booking): BookingDraft {
  return {
    artistId: booking.artistId,
    role: booking.role,
    customRoleLabel: booking.customRoleLabel ?? '',
    status: booking.status,
    internalNote: booking.internalNote ?? '',
    businessPartnerId: booking.businessPartnerId ?? '',
    contactId: booking.contactId ?? '',
    agreedFeeAmount: minorAmountToInput(booking.agreedFeeMinor, booking.agreedFeeCurrency ?? 'EUR'),
    agreedFeeCurrency: booking.agreedFeeCurrency ?? 'EUR',
    travelArrangement: booking.travelArrangement ?? '',
    travelCostAmount: minorAmountToInput(
      booking.travelCostMinor,
      booking.travelCostCurrency ?? 'EUR',
    ),
    travelCostCurrency: booking.travelCostCurrency ?? 'EUR',
    hotelArrangement: booking.hotelArrangement,
    hotelBuyoutAmount: minorAmountToInput(
      booking.hotelBuyoutMinor,
      booking.hotelBuyoutCurrency ?? 'EUR',
    ),
    hotelBuyoutCurrency: booking.hotelBuyoutCurrency ?? 'EUR',
    hotelNote: booking.hotelNote ?? '',
  };
}

function uniqueCustomRequirements(requirements: Requirement[]) {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    if (requirement.role !== 'OTHER' || !requirement.customRoleLabel) return false;
    const key = normalizeRoleLabel(requirement.customRoleLabel);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleSelectValue(draft: BookingDraft, requirements: Requirement[]) {
  if (draft.role !== 'OTHER') return draft.role;
  const requirement = requirements.find(
    ({ customRoleLabel }) =>
      normalizeRoleLabel(customRoleLabel ?? '') === normalizeRoleLabel(draft.customRoleLabel),
  );
  return requirement ? `requirement:${requirement.id}` : 'CUSTOM';
}

function normalizeRoleLabel(value: string) {
  return value.trim().toLocaleLowerCase('de-DE');
}
function isActive(status: BookingStatus) {
  return status !== 'DECLINED' && status !== 'CANCELLED';
}
function statusLabel(status: BookingStatus) {
  return {
    SHORTLISTED: 'Vorgemerkt',
    REQUESTED: 'Angefragt',
    OPTION: 'Option',
    CONFIRMED: 'Bestätigt',
    DECLINED: 'Abgelehnt',
    CANCELLED: 'Storniert',
  }[status];
}
function roleLabel(booking: Pick<Booking, 'role' | 'customRoleLabel'>) {
  if (booking.role === 'ARTIST') return 'Artist';
  if (booking.role === 'MODERATOR') return 'Moderator';
  return booking.customRoleLabel ?? 'Weitere Rolle';
}
function hotelArrangementLabel(arrangement: HotelArrangement) {
  if (arrangement === 'REQUIRED') return 'Hotel erforderlich';
  if (arrangement === 'BUYOUT') return 'Hotel-Buy-out';
  return 'Kein Hotel';
}
function duplicateBookingDetails(error: unknown): DuplicateBooking['existing'] | undefined {
  if (!error || typeof error !== 'object' || !('code' in error) || !('details' in error)) {
    return undefined;
  }
  if ((error as { code?: unknown }).code !== 'BOOKING_ACTIVE_ARTIST_CONFLICT') return undefined;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || !('existingBooking' in details)) return undefined;
  const existing = (details as { existingBooking?: unknown }).existingBooking;
  if (!existing || typeof existing !== 'object') return undefined;
  const value = existing as Partial<DuplicateBooking['existing']>;
  if (
    typeof value.id !== 'string' ||
    !value.role ||
    !value.status ||
    (value.customRoleLabel !== null && typeof value.customRoleLabel !== 'string')
  ) {
    return undefined;
  }
  return value as DuplicateBooking['existing'];
}
function contactLabel(contact: {
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
  email?: string | null;
}) {
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.label || 'Kontakt';
  return contact.email ? `${name} · ${contact.email}` : name;
}
