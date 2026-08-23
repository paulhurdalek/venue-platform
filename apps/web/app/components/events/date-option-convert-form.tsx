'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

type DateOption = components['schemas']['DateOptionDto'];
type EventFormat = components['schemas']['EventFormatDto'];
type Recording = NonNullable<components['schemas']['ConvertDateOptionDto']['recordingSetting']>;
type Draft = {
  name: string;
  description: string;
  eventKind: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
  technicalGetInTime: string;
  artistGetInTime: string;
  doorsTime: string;
  startTime: string;
  endTime: string;
  endNextDay: boolean;
  recordingSetting: Recording;
};

export function DateOptionConvertForm({
  organizationId,
  option,
  formats,
}: {
  organizationId: string;
  option: DateOption;
  formats: EventFormat[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'TEMPLATE' | 'FREE'>(formats.length > 0 ? 'TEMPLATE' : 'FREE');
  const [formatId, setFormatId] = useState(formats.length === 1 ? formats[0]!.id : '');
  const selectedFormat = useMemo(
    () => formats.find(({ id }) => id === formatId),
    [formats, formatId],
  );
  const [draft, setDraft] = useState<Draft>(() =>
    optionDraft(option, formats.length === 1 ? formats[0] : undefined),
  );
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function chooseMode(value: 'TEMPLATE' | 'FREE') {
    setMode(value);
    setFormatId('');
    setDraft(optionDraft(option));
    setMessage(undefined);
    setConflicts([]);
  }
  function chooseFormat(value: string) {
    setFormatId(value);
    setDraft(
      optionDraft(
        option,
        formats.find(({ id }) => id === value),
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setConflicts([]);
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/date-options/{optionId}/convert',
      {
        credentials: 'include',
        params: { path: { organizationId, optionId: option.id } },
        body: {
          version: option.version,
          locationId: option.locationId,
          eventDate: option.optionDate,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          technicalGetInTime: draft.technicalGetInTime || null,
          artistGetInTime: draft.artistGetInTime || null,
          doorsTime: draft.doorsTime || null,
          startTime: draft.startTime || null,
          endTime: draft.endTime || null,
          endNextDay: Boolean(draft.endTime) && draft.endNextDay,
          recordingSetting: draft.recordingSetting,
          ...(mode === 'TEMPLATE'
            ? { sourceEventFormatId: formatId }
            : { eventKind: draft.eventKind }),
        },
      },
    );
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(apiErrorMessage(result.error, 'Die Option konnte nicht umgewandelt werden.'));
      setPending(false);
      return;
    }
    router.push(`/o/${organizationId}/events/${result.data.id}`);
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <fieldset className="form-span choice-fieldset">
        <legend>Anlageart</legend>
        <div className="choice-row">
          <label>
            <input
              checked={mode === 'TEMPLATE'}
              disabled={formats.length === 0}
              onChange={() => chooseMode('TEMPLATE')}
              type="radio"
            />{' '}
            Mit Vorlage
          </label>
          <label>
            <input checked={mode === 'FREE'} onChange={() => chooseMode('FREE')} type="radio" />{' '}
            Ohne Vorlage
          </label>
        </div>
        {mode === 'TEMPLATE' ? (
          <label>
            Veranstaltungsformat
            <select
              onChange={(event) => chooseFormat(event.target.value)}
              required
              value={formatId}
            >
              <option value="">Format auswählen</option>
              {formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Veranstaltungsart
            <select
              onChange={(event) => set('eventKind', event.target.value as Draft['eventKind'])}
              value={draft.eventKind}
            >
              <option value="OWN_PRODUCTION">Eigenproduktion</option>
              <option value="THIRD_PARTY_EVENT">Fremdveranstaltung / Vermietung</option>
            </select>
          </label>
        )}
      </fieldset>
      <div className="form-span snapshot-note">
        <strong>
          {option.rank === 'FIRST' ? '1. Option' : '2. Option'} · {option.locationName}
        </strong>
        <span>
          {formatDate(option.optionDate)} · {option.occupancyStartTime}–{option.occupancyEndTime}
          {option.occupancyEndNextDay ? ' (+1 Tag)' : ''}
        </span>
      </div>
      <label>
        Veranstaltungsname
        <input
          disabled={mode === 'TEMPLATE' && !selectedFormat}
          maxLength={200}
          onChange={(event) => set('name', event.target.value)}
          required
          value={draft.name}
        />
      </label>
      <label>
        Datum
        <input disabled type="date" value={option.optionDate} />
      </label>
      <label className="form-span">
        Beschreibung <span className="optional">optional</span>
        <textarea
          disabled={mode === 'TEMPLATE' && !selectedFormat}
          maxLength={5000}
          onChange={(event) => set('description', event.target.value)}
          rows={3}
          value={draft.description}
        />
      </label>
      <fieldset className="form-span" disabled={mode === 'TEMPLATE' && !selectedFormat}>
        <legend>Endgültige lokale Zeiten</legend>
        <div className="form-grid nested-grid event-time-grid">
          <Time
            label="Get-in Technik"
            value={draft.technicalGetInTime}
            onChange={(value) => set('technicalGetInTime', value)}
          />
          <Time
            label="Get-in Artists"
            value={draft.artistGetInTime}
            onChange={(value) => set('artistGetInTime', value)}
          />
          <Time
            label="Einlass"
            value={draft.doorsTime}
            onChange={(value) => set('doorsTime', value)}
          />
          <Time
            label="Beginn"
            value={draft.startTime}
            onChange={(value) => set('startTime', value)}
          />
          <Time label="Ende" value={draft.endTime} onChange={(value) => set('endTime', value)} />
          <label className="checkbox-label">
            <input
              checked={draft.endNextDay}
              disabled={!draft.endTime}
              onChange={(event) => set('endNextDay', event.target.checked)}
              type="checkbox"
            />{' '}
            Ende am Folgetag
          </label>
        </div>
      </fieldset>
      <label>
        Aufzeichnung
        <select
          onChange={(event) => set('recordingSetting', event.target.value as Recording)}
          value={draft.recordingSetting}
        >
          <option value="UNSPECIFIED">Nicht vorgegeben</option>
          <option value="ENABLED">Aktiv</option>
          <option value="DISABLED">Inaktiv</option>
        </select>
      </label>
      <div className="form-span">
        <FormMessage message={message} />
        <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
        <div className="button-row form-actions">
          <button
            className="button"
            disabled={pending || (mode === 'TEMPLATE' && !formatId)}
            type="submit"
          >
            {pending ? 'Umwandlung läuft …' : 'Verbindlich umwandeln'}
          </button>
          <a
            className="button button--secondary"
            href={`/o/${organizationId}/events/options/${option.id}`}
          >
            Abbrechen
          </a>
        </div>
      </div>
    </form>
  );
}

function Time({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label} <span className="optional">optional</span>
      <input onChange={(event) => onChange(event.target.value)} type="time" value={value} />
    </label>
  );
}
function optionDraft(option: DateOption, format?: EventFormat): Draft {
  return {
    name: option.label,
    description: format?.description ?? '',
    eventKind: format?.eventKind ?? 'THIRD_PARTY_EVENT',
    technicalGetInTime: option.occupancyStartTime,
    artistGetInTime: format?.defaultArtistGetInTime ?? '',
    doorsTime: format?.defaultDoorsTime ?? '',
    startTime: format?.defaultStartTime ?? '',
    endTime: option.occupancyEndTime,
    endNextDay: option.occupancyEndNextDay,
    recordingSetting: format?.recordingDefault ?? 'UNSPECIFIED',
  };
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
