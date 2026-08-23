'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { EditCancelAction, useDetailEdit } from '../master-data/editable-detail';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

type Event = components['schemas']['EventDto'];
type EventFormat = components['schemas']['EventFormatDto'];
type Location = components['schemas']['LocationDto'];
type CreateEvent = components['schemas']['CreateEventDto'];

type Draft = {
  name: string;
  description: string;
  technicalGetInTime: string;
  artistGetInTime: string;
  doorsTime: string;
  startTime: string;
  endTime: string;
  endDay: 'SAME' | 'NEXT';
  recordingSetting: CreateEvent['recordingSetting'];
  eventKind: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
};

const nullable = (value: string) => value.trim() || null;

export function EventForm({
  organizationId,
  event,
  eventFormats = [],
  locations,
  initialDate,
}: {
  organizationId: string;
  event?: Event;
  eventFormats?: EventFormat[];
  locations: Location[];
  initialDate?: string | undefined;
}) {
  const router = useRouter();
  const detailEdit = useDetailEdit();
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);
  const [creationMode, setCreationMode] = useState<'TEMPLATE' | 'FREE'>(
    eventFormats.length > 0 ? 'TEMPLATE' : 'FREE',
  );
  const [selectedFormatId, setSelectedFormatId] = useState(
    eventFormats.length === 1 ? eventFormats[0]!.id : '',
  );
  const selectedFormat = useMemo(
    () => eventFormats.find((format) => format.id === selectedFormatId),
    [eventFormats, selectedFormatId],
  );
  const [draft, setDraft] = useState<Draft>(() =>
    event ? eventDraft(event) : selectedFormat ? formatDraft(selectedFormat) : emptyDraft(),
  );

  function chooseFormat(eventFormatId: string) {
    setSelectedFormatId(eventFormatId);
    const format = eventFormats.find((candidate) => candidate.id === eventFormatId);
    setDraft(format ? formatDraft(format) : emptyDraft());
    setMessage(undefined);
    setConflicts([]);
  }

  function chooseCreationMode(mode: 'TEMPLATE' | 'FREE') {
    setCreationMode(mode);
    setMessage(undefined);
    setConflicts([]);
    if (mode === 'FREE') {
      setSelectedFormatId('');
      setDraft(emptyDraft());
      return;
    }
    const format = eventFormats.length === 1 ? eventFormats[0] : undefined;
    setSelectedFormatId(format?.id ?? '');
    setDraft(format ? formatDraft(format) : emptyDraft());
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setPending(true);
    setMessage(undefined);
    setConflicts([]);
    const form = new FormData(submitEvent.currentTarget);
    const values = {
      name: draft.name.trim(),
      description: nullable(draft.description),
      locationId: String(form.get('locationId') ?? ''),
      eventDate: String(form.get('eventDate') ?? ''),
      technicalGetInTime: nullable(draft.technicalGetInTime),
      artistGetInTime: nullable(draft.artistGetInTime),
      doorsTime: nullable(draft.doorsTime),
      startTime: nullable(draft.startTime),
      endTime: nullable(draft.endTime),
      endNextDay: Boolean(draft.endTime) && draft.endDay === 'NEXT',
      recordingSetting: draft.recordingSetting ?? 'UNSPECIFIED',
    };
    const client = createBrowserApiClient();
    const result = event
      ? await client.PATCH('/api/v1/organizations/{organizationId}/events/{eventId}', {
          credentials: 'include',
          params: { path: { organizationId, eventId: event.id } },
          body: { ...values, version: event.version },
        })
      : await client.POST('/api/v1/organizations/{organizationId}/events', {
          credentials: 'include',
          params: { path: { organizationId } },
          body: {
            ...values,
            ...(creationMode === 'TEMPLATE'
              ? { sourceEventFormatId: selectedFormatId }
              : { eventKind: draft.eventKind }),
          },
        });
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(
        apiErrorMessage(result.error, 'Die Veranstaltung konnte nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    if (!event) {
      router.push(`/o/${organizationId}/events/${result.data.id}`);
      return;
    }
    const success = 'Die Veranstaltung wurde gespeichert.';
    if (detailEdit) detailEdit.complete(success);
    else setMessage(success);
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      {!event ? (
        <fieldset className="form-span choice-fieldset">
          <legend>Anlageart</legend>
          <div className="choice-row">
            <label>
              <input
                checked={creationMode === 'TEMPLATE'}
                disabled={eventFormats.length === 0}
                name="creationMode"
                onChange={() => chooseCreationMode('TEMPLATE')}
                type="radio"
              />
              Mit Vorlage
            </label>
            <label>
              <input
                checked={creationMode === 'FREE'}
                name="creationMode"
                onChange={() => chooseCreationMode('FREE')}
                type="radio"
              />
              Ohne Vorlage
            </label>
          </div>
          {creationMode === 'TEMPLATE' ? (
            <label>
              Veranstaltungsformat
              <select
                aria-describedby="event-format-help"
                name="sourceEventFormatId"
                onChange={(changeEvent) => chooseFormat(changeEvent.target.value)}
                required
                value={selectedFormatId}
              >
                <option value="">Format auswählen</option>
                {eventFormats.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.name}
                  </option>
                ))}
              </select>
              <span className="field-hint" id="event-format-help">
                Die aktuellen Formatwerte werden beim Speichern als unabhängiger Snapshot
                übernommen.
              </span>
            </label>
          ) : (
            <label>
              Veranstaltungsart
              <select
                onChange={(changeEvent) =>
                  set('eventKind', changeEvent.target.value as Draft['eventKind'])
                }
                value={draft.eventKind}
              >
                <option value="OWN_PRODUCTION">Eigenproduktion</option>
                <option value="THIRD_PARTY_EVENT">Fremdveranstaltung / Vermietung</option>
              </select>
            </label>
          )}
        </fieldset>
      ) : (
        <div className="form-span snapshot-note">
          <strong>
            {event.formatNameSnapshot
              ? `Format-Snapshot: ${event.formatNameSnapshot}`
              : 'Ohne Vorlage'}
          </strong>
          {event.sourceEventFormatVersion ? (
            <span>
              Quelle Version {event.sourceEventFormatVersion}; das Quellformat wird nicht verändert.
            </span>
          ) : (
            <span>
              Diese Veranstaltung besitzt keine Formatquelle und wird nicht synchronisiert.
            </span>
          )}
        </div>
      )}
      <label>
        Veranstaltungsname
        <input
          autoComplete="off"
          disabled={!event && creationMode === 'TEMPLATE' && !selectedFormat}
          maxLength={200}
          name="name"
          onChange={(changeEvent) => set('name', changeEvent.target.value)}
          required
          value={draft.name}
        />
      </label>
      <label>
        Datum
        <input
          defaultValue={event?.eventDate ?? initialDate ?? ''}
          name="eventDate"
          required
          type="date"
        />
      </label>
      <label>
        Location
        <select
          defaultValue={event?.locationId ?? (locations.length === 1 ? locations[0]!.id : '')}
          name="locationId"
          required
        >
          {locations.length > 1 ? <option value="">Location auswählen</option> : null}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="form-span">
        Beschreibung <span className="optional">optional</span>
        <textarea
          disabled={!event && creationMode === 'TEMPLATE' && !selectedFormat}
          maxLength={5000}
          name="description"
          onChange={(changeEvent) => set('description', changeEvent.target.value)}
          rows={3}
          value={draft.description}
        />
      </label>
      <fieldset
        className="form-span"
        disabled={!event && creationMode === 'TEMPLATE' && !selectedFormat}
      >
        <legend>Lokale Zeiten</legend>
        <p className="field-hint">
          Leere optionale Zeiten bleiben frei; Ende kann am Folgetag liegen.
        </p>
        <div className="form-grid nested-grid event-time-grid">
          <TimeField draft={draft} field="technicalGetInTime" label="Get-in Technik" set={set} />
          <TimeField draft={draft} field="artistGetInTime" label="Get-in Artists" set={set} />
          <TimeField draft={draft} field="doorsTime" label="Einlass" set={set} />
          <TimeField draft={draft} field="startTime" label="Beginn" set={set} />
          <TimeField draft={draft} field="endTime" label="Ende" set={set} />
          <label>
            Tag des Endes
            <select
              disabled={!draft.endTime}
              onChange={(changeEvent) => set('endDay', changeEvent.target.value as Draft['endDay'])}
              value={draft.endDay}
            >
              <option value="SAME">Am Veranstaltungstag</option>
              <option value="NEXT">Am Folgetag (+1 Tag)</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset
        className="form-span"
        disabled={!event && creationMode === 'TEMPLATE' && !selectedFormat}
      >
        <legend>Aufzeichnung</legend>
        <label>
          Einstellung
          <select
            onChange={(changeEvent) =>
              set('recordingSetting', changeEvent.target.value as Draft['recordingSetting'])
            }
            value={draft.recordingSetting}
          >
            <option value="UNSPECIFIED">Nicht vorgegeben</option>
            <option value="ENABLED">Aktiv</option>
            <option value="DISABLED">Inaktiv</option>
          </select>
        </label>
      </fieldset>
      <div className="form-span">
        <FormMessage message={message} />
        <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
        <div className="button-row form-actions">
          <button
            className="button"
            disabled={pending || (!event && creationMode === 'TEMPLATE' && !selectedFormat)}
            type="submit"
          >
            {pending ? 'Speichern …' : event ? 'Änderungen speichern' : 'Veranstaltung anlegen'}
          </button>
          <EditCancelAction fallbackHref={`/o/${organizationId}/events`} />
        </div>
      </div>
    </form>
  );
}

function TimeField({
  draft,
  field,
  label,
  set,
}: {
  draft: Draft;
  field: 'technicalGetInTime' | 'artistGetInTime' | 'doorsTime' | 'startTime' | 'endTime';
  label: string;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  return (
    <label>
      {label} <span className="optional">optional</span>
      <input
        name={field}
        onChange={(event) => {
          set(field, event.target.value);
          if (field === 'endTime' && !event.target.value) set('endDay', 'SAME');
        }}
        type="time"
        value={draft[field]}
      />
    </label>
  );
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    technicalGetInTime: '',
    artistGetInTime: '',
    doorsTime: '',
    startTime: '',
    endTime: '',
    endDay: 'SAME',
    recordingSetting: 'UNSPECIFIED',
    eventKind: 'OWN_PRODUCTION',
  };
}

function formatDraft(format: EventFormat): Draft {
  return {
    name: format.name,
    description: format.description ?? '',
    technicalGetInTime: format.defaultTechnicalGetInTime ?? '',
    artistGetInTime: format.defaultArtistGetInTime ?? '',
    doorsTime: format.defaultDoorsTime ?? '',
    startTime: format.defaultStartTime ?? '',
    endTime: format.defaultEndTime ?? '',
    endDay: format.defaultEndNextDay ? 'NEXT' : 'SAME',
    recordingSetting: format.recordingDefault,
    eventKind: format.eventKind,
  };
}

function eventDraft(event: Event): Draft {
  return {
    name: event.name,
    description: event.description ?? '',
    technicalGetInTime: event.technicalGetInTime ?? '',
    artistGetInTime: event.artistGetInTime ?? '',
    doorsTime: event.doorsTime ?? '',
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    endDay: event.endNextDay ? 'NEXT' : 'SAME',
    recordingSetting: event.recordingSetting,
    eventKind: event.eventKind,
  };
}
