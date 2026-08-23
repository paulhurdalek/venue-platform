'use client';

import type { components } from '@venue/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

type Location = components['schemas']['LocationDto'];
type Result = components['schemas']['AvailabilityResultDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type Contact = components['schemas']['ContactDto'];
type DateOption = components['schemas']['DateOptionDto'];
type Rank = DateOption['rank'];

type SearchQuery = {
  locationId: string;
  fromDate: string;
  toDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay: boolean;
  weekdays?: string;
  resultFilter: 'FREE_ONLY' | 'FREE_AND_SECOND_OPTION';
};

type BatchDraft = {
  key: string;
  locationId: string;
  optionDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay: boolean;
  rank: Rank;
  suggestedFrom: Result['state'] | undefined;
};

export function FreeDatesPanel({
  organizationId,
  locations,
  partners,
  contacts,
  canWriteOptions,
}: {
  organizationId: string;
  locations: Location[];
  partners: Partner[];
  contacts: Contact[];
  canWriteOptions: boolean;
}) {
  const router = useRouter();
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastQuery, setLastQuery] = useState<SearchQuery>();
  const [message, setMessage] = useState<string>();
  const [searchPending, setSearchPending] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<BatchDraft[]>([]);
  const [defaultStart, setDefaultStart] = useState('16:00');
  const [defaultEnd, setDefaultEnd] = useState('23:00');
  const [defaultEndNextDay, setDefaultEndNextDay] = useState(false);
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [createdOptions, setCreatedOptions] = useState<DateOption[]>([]);
  const today = new Date();
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + 30);
  const selectableKeys = results.filter(({ selectable }) => selectable).map(({ date }) => date);

  async function runSearch(query: SearchQuery, announce = true) {
    setSearchPending(true);
    if (announce) {
      setMessage(undefined);
      setCreatedOptions([]);
    }
    const client = createBrowserApiClient();
    const result = await client.GET('/api/v1/organizations/{organizationId}/availability', {
      credentials: 'include',
      params: {
        path: { organizationId },
        query: {
          locationId: query.locationId,
          fromDate: query.fromDate,
          toDate: query.toDate,
          occupancyStartTime: query.occupancyStartTime,
          occupancyEndTime: query.occupancyEndTime,
          occupancyEndNextDay: query.occupancyEndNextDay,
          ...(query.weekdays ? { weekdays: query.weekdays } : {}),
          resultFilter: query.resultFilter,
        },
      },
    });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Die Freitermine konnten nicht berechnet werden.'));
      setSearchPending(false);
      return;
    }
    setResults(result.data);
    if (announce) {
      setSelected([]);
      setBatchOpen(false);
      setMessage(
        result.data.length === 0
          ? 'Für den gewählten Zeitraum wurden keine Tage gefunden.'
          : `${result.data.length} Tage wurden geprüft.`,
      );
    }
    setSearchPending(false);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weekdays = form.getAll('weekdays').map(String).join(',');
    const query: SearchQuery = {
      locationId: String(form.get('locationId') ?? ''),
      fromDate: String(form.get('fromDate') ?? ''),
      toDate: String(form.get('toDate') ?? ''),
      occupancyStartTime: String(form.get('occupancyStartTime') ?? ''),
      occupancyEndTime: String(form.get('occupancyEndTime') ?? ''),
      occupancyEndNextDay: form.get('occupancyEndNextDay') === 'on',
      ...(weekdays ? { weekdays } : {}),
      resultFilter: String(form.get('resultFilter')) as SearchQuery['resultFilter'],
    };
    setLastQuery(query);
    void runSearch(query);
  }

  async function copySelection() {
    const selectedResults = results.filter((result) => selected.includes(result.date));
    if (selectedResults.length === 0) {
      setMessage('Wählen Sie mindestens einen verfügbaren Termin aus.');
      return;
    }
    const lines = selectedResults.map(
      (result) =>
        `${formatLongDate(result.date)} | ${result.occupancyStartTime}–${result.occupancyEndTime}${result.occupancyEndNextDay ? ' (+1 Tag)' : ''}`,
    );
    const text = [
      'Folgende Termine können wir Ihnen derzeit unverbindlich anbieten:',
      '',
      ...lines,
      '',
      'Die Verfügbarkeit kann sich bis zur ausdrücklichen Optionierung ändern.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage(
        selectedResults.length === 1
          ? '1 Termin wurde in die Zwischenablage kopiert.'
          : `${selectedResults.length} Termine wurden in die Zwischenablage kopiert.`,
      );
    } catch {
      setMessage('Der Text konnte nicht in die Zwischenablage kopiert werden.');
    }
  }

  function openBatchForm() {
    if (!lastQuery || selected.length === 0) return;
    const selectedResults = results.filter((result) => selected.includes(result.date));
    const first = selectedResults[0]!;
    setDefaultStart(first.occupancyStartTime);
    setDefaultEnd(first.occupancyEndTime);
    setDefaultEndNextDay(first.occupancyEndNextDay);
    setBatchDrafts(
      selectedResults.map((result) => ({
        key: `${lastQuery.locationId}:${result.date}`,
        locationId: lastQuery.locationId,
        optionDate: result.date,
        occupancyStartTime: result.occupancyStartTime,
        occupancyEndTime: result.occupancyEndTime,
        occupancyEndNextDay: result.occupancyEndNextDay,
        rank: suggestedRank(result.state),
        suggestedFrom: result.state,
      })),
    );
    setConflicts([]);
    setBatchOpen(true);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#batch-options-heading')?.focus(),
    );
  }

  function updateDraft(key: string, update: Partial<BatchDraft>, keepSuggestion = false) {
    setBatchDrafts((current) =>
      current.map((draft) =>
        draft.key === key
          ? { ...draft, ...update, ...(keepSuggestion ? {} : { suggestedFrom: undefined }) }
          : draft,
      ),
    );
  }

  function applyDefaultStart(value: string) {
    setDefaultStart(value);
    setBatchDrafts((current) =>
      current.map((draft) => ({
        ...draft,
        occupancyStartTime: value,
        suggestedFrom: undefined,
      })),
    );
  }

  function applyDefaultEnd(value: string) {
    setDefaultEnd(value);
    setBatchDrafts((current) =>
      current.map((draft) => ({ ...draft, occupancyEndTime: value, suggestedFrom: undefined })),
    );
  }

  function applyDefaultEndNextDay(value: boolean) {
    setDefaultEndNextDay(value);
    setBatchDrafts((current) =>
      current.map((draft) => ({
        ...draft,
        occupancyEndNextDay: value,
        suggestedFrom: undefined,
      })),
    );
  }

  async function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBatchPending(true);
    setMessage(undefined);
    setConflicts([]);
    const form = new FormData(event.currentTarget);
    const client = createBrowserApiClient();
    const result = await client.POST('/api/v1/organizations/{organizationId}/date-options/batch', {
      credentials: 'include',
      params: { path: { organizationId } },
      body: {
        label: String(form.get('label') ?? '').trim(),
        businessPartnerId: nullable(String(form.get('businessPartnerId') ?? '')),
        contactId: nullable(String(form.get('contactId') ?? '')),
        note: nullable(String(form.get('note') ?? '')),
        validUntil: new Date(String(form.get('validUntil') ?? '')).toISOString(),
        options: batchDrafts.map((draft) => ({
          locationId: draft.locationId,
          optionDate: draft.optionDate,
          occupancyStartTime: draft.occupancyStartTime,
          occupancyEndTime: draft.occupancyEndTime,
          occupancyEndNextDay: draft.occupancyEndNextDay,
          rank: draft.rank,
        })),
      },
    });
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(
        apiErrorMessage(result.error, 'Die Terminoptionen konnten nicht angelegt werden.'),
      );
      setBatchPending(false);
      return;
    }
    setCreatedOptions(result.data.items);
    setSelected([]);
    setBatchDrafts([]);
    setBatchOpen(false);
    setMessage(
      result.data.count === 1
        ? '1 Terminoption wurde angelegt.'
        : `${result.data.count} Terminoptionen wurden angelegt.`,
    );
    setBatchPending(false);
    if (lastQuery) await runSearch(lastQuery, false);
    router.refresh();
  }

  return (
    <div className="free-dates">
      <form className="form-stack form-grid availability-form" onSubmit={search}>
        <label>
          Location
          <select
            defaultValue={locations.length === 1 ? locations[0]!.id : ''}
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
        <label>
          Von <input defaultValue={isoDate(today)} name="fromDate" required type="date" />
        </label>
        <label>
          Bis <input defaultValue={isoDate(until)} name="toDate" required type="date" />
        </label>
        <label>
          Belegungsbeginn{' '}
          <input defaultValue="16:00" name="occupancyStartTime" required type="time" />
        </label>
        <label>
          Belegungsende <input defaultValue="23:00" name="occupancyEndTime" required type="time" />
        </label>
        <label className="checkbox-label">
          <input name="occupancyEndNextDay" type="checkbox" /> Ende am Folgetag
        </label>
        <fieldset className="form-span weekday-filter">
          <legend>Wochentage (optional)</legend>
          {[
            ['1', 'Mo'],
            ['2', 'Di'],
            ['3', 'Mi'],
            ['4', 'Do'],
            ['5', 'Fr'],
            ['6', 'Sa'],
            ['0', 'So'],
          ].map(([value, label]) => (
            <label className="checkbox-label" key={value}>
              <input name="weekdays" type="checkbox" value={value} /> {label}
            </label>
          ))}
        </fieldset>
        <label>
          Ergebnisfilter
          <select defaultValue="FREE_ONLY" name="resultFilter">
            <option value="FREE_ONLY">Nur vollständig freie Termine</option>
            <option value="FREE_AND_SECOND_OPTION">Frei und 2. Option möglich</option>
          </select>
        </label>
        <div className="form-span button-row">
          <button
            className="button"
            disabled={searchPending || locations.length === 0}
            type="submit"
          >
            {searchPending ? 'Prüfung läuft …' : 'Freitermine prüfen'}
          </button>
          <button
            className="button button--secondary"
            disabled={selected.length === 0}
            onClick={() => void copySelection()}
            type="button"
          >
            Auswahl kopieren
          </button>
        </div>
      </form>
      <FormMessage message={message} />
      <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
      {createdOptions.length > 0 ? (
        <section aria-label="Neu angelegte Terminoptionen" className="batch-created-options">
          <strong>Neu angelegte Optionen</strong>
          <ul>
            {createdOptions.map((option) => (
              <li key={option.id}>
                <Link href={`/o/${organizationId}/events/options/${option.id}`}>
                  {formatLongDate(option.optionDate)} · {option.locationName} ·{' '}
                  {option.rank === 'FIRST' ? '1. Option' : '2. Option'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {results.length > 0 ? (
        <>
          <div className="availability-selection-bar" aria-live="polite">
            <strong>
              {selected.length} {selected.length === 1 ? 'Termin ausgewählt' : 'Termine ausgewählt'}
            </strong>
            <div className="button-row">
              <button
                className="button button--small button--secondary"
                disabled={selectableKeys.length === 0 || selected.length === selectableKeys.length}
                onClick={() => setSelected(selectableKeys)}
                type="button"
              >
                Alle auf dieser Seite auswählen
              </button>
              <button
                className="button button--small button--secondary"
                disabled={selected.length === 0}
                onClick={() => setSelected([])}
                type="button"
              >
                Auswahl aufheben
              </button>
              {canWriteOptions ? (
                <button
                  className="button button--small"
                  disabled={selected.length === 0}
                  onClick={openBatchForm}
                  type="button"
                >
                  Optionen anlegen
                </button>
              ) : null}
            </div>
          </div>
          <div className="availability-results" aria-label="Ergebnisse der Freiterminsuche">
            {results.map((result) => (
              <label
                className={`availability-result availability-result--${result.state.toLowerCase()}${selected.includes(result.date) ? ' availability-result--selected' : ''}`}
                key={result.date}
              >
                <input
                  aria-label={`${formatLongDate(result.date)} auswählen`}
                  checked={selected.includes(result.date)}
                  disabled={!result.selectable}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...new Set([...current, result.date])]
                        : current.filter((date) => date !== result.date),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{formatLongDate(result.date)}</strong>
                  <small>
                    {result.occupancyStartTime}–{result.occupancyEndTime}
                    {result.occupancyEndNextDay ? ' (+1 Tag)' : ''}
                  </small>
                </span>
                <span className="availability-state">{stateLabel(result.state)}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
      {batchOpen ? (
        <form className="batch-option-form form-stack" onSubmit={submitBatch}>
          <header>
            <p className="eyebrow">Gemeinsame Anfrage</p>
            <h2 id="batch-options-heading" tabIndex={-1}>
              Mehrere Terminoptionen anlegen
            </h2>
            <p>Gemeinsame Angaben gelten für jede neu angelegte, eigenständige Terminoption.</p>
          </header>
          <div className="form-grid batch-option-common">
            <label>
              Bezeichnung beziehungsweise Anfrage
              <input maxLength={200} name="label" required />
            </label>
            <label>
              Gültig bis
              <input
                defaultValue={defaultExpiry()}
                name="validUntil"
                required
                type="datetime-local"
              />
            </label>
            <label>
              Geschäftspartner / Agentur <span className="optional">optional</span>
              <select defaultValue="" name="businessPartnerId">
                <option value="">Keiner</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.companyName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ansprechpartner <span className="optional">optional</span>
              <select defaultValue="" name="contactId">
                <option value="">Keiner</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactDisplayName(contact)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Standard-Belegungsbeginn
              <input
                onChange={(event) => applyDefaultStart(event.target.value)}
                required
                type="time"
                value={defaultStart}
              />
            </label>
            <label>
              Standard-Belegungsende
              <input
                onChange={(event) => applyDefaultEnd(event.target.value)}
                required
                type="time"
                value={defaultEnd}
              />
            </label>
            <label className="checkbox-label form-span">
              <input
                checked={defaultEndNextDay}
                onChange={(event) => applyDefaultEndNextDay(event.target.checked)}
                type="checkbox"
              />{' '}
              Standardmäßig Ende am Folgetag
            </label>
            <label className="form-span">
              Notiz <span className="optional">optional, intern</span>
              <textarea maxLength={2000} name="note" rows={3} />
            </label>
          </div>
          <div className="batch-option-items" aria-label="Ausgewählte Termine">
            {batchDrafts.map((draft, index) => (
              <fieldset className="batch-option-item" key={draft.key}>
                <legend>Termin {index + 1}</legend>
                <div className="form-grid">
                  <label>
                    Datum
                    <input
                      aria-label={`Datum Termin ${index + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { optionDate: event.target.value })
                      }
                      required
                      type="date"
                      value={draft.optionDate}
                    />
                  </label>
                  <label>
                    Location
                    <select
                      aria-label={`Location Termin ${index + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { locationId: event.target.value })
                      }
                      required
                      value={draft.locationId}
                    >
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Belegungsbeginn
                    <input
                      aria-label={`Belegungsbeginn Termin ${index + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { occupancyStartTime: event.target.value })
                      }
                      required
                      type="time"
                      value={draft.occupancyStartTime}
                    />
                  </label>
                  <label>
                    Belegungsende
                    <input
                      aria-label={`Belegungsende Termin ${index + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { occupancyEndTime: event.target.value })
                      }
                      required
                      type="time"
                      value={draft.occupancyEndTime}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      aria-label={`Ende am Folgetag Termin ${index + 1}`}
                      checked={draft.occupancyEndNextDay}
                      onChange={(event) =>
                        updateDraft(draft.key, { occupancyEndNextDay: event.target.checked })
                      }
                      type="checkbox"
                    />{' '}
                    Ende am Folgetag
                  </label>
                  <label>
                    Rang
                    <select
                      aria-label={`Rang Termin ${index + 1}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { rank: event.target.value as Rank }, true)
                      }
                      value={draft.rank}
                    >
                      <option value="FIRST">1. Option</option>
                      <option value="SECOND">2. Option</option>
                    </select>
                  </label>
                </div>
                <p className="field-hint">
                  {draft.suggestedFrom
                    ? `Rangvorschlag: ${draft.rank === 'FIRST' ? '1. Option' : '2. Option'} – ${stateLabel(draft.suggestedFrom)}`
                    : 'Datum, Location oder Zeit wurde angepasst; die Belegung wird beim Speichern erneut geprüft.'}
                </p>
              </fieldset>
            ))}
          </div>
          <div className="batch-option-summary" role="status">
            <strong>
              {batchDrafts.length}{' '}
              {batchDrafts.length === 1 ? 'Option wird angelegt.' : 'Optionen werden angelegt.'}
            </strong>
            <span>Alle Einträge werden gemeinsam geprüft und vollständig atomar gespeichert.</span>
          </div>
          <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
          <div className="button-row">
            <button className="button" disabled={batchPending} type="submit">
              {batchPending ? 'Optionen werden angelegt …' : 'Optionen verbindlich anlegen'}
            </button>
            <button
              className="button button--secondary"
              disabled={batchPending}
              onClick={() => {
                setBatchOpen(false);
                setConflicts([]);
              }}
              type="button"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function suggestedRank(state: Result['state']): Rank {
  return state === 'SECOND_OPTION_AVAILABLE' ? 'SECOND' : 'FIRST';
}

function stateLabel(state: Result['state']) {
  return {
    FREE: 'Frei',
    SECOND_OPTION_AVAILABLE: '1. Option vergeben – 2. Option möglich',
    FIRST_OPTION_AVAILABLE: '2. Option vergeben – 1. Option möglich',
    FULLY_OPTIONED: '1. und 2. Option vergeben',
    EVENT_OCCUPIED: 'Durch Veranstaltung belegt',
    MANUAL_REVIEW: 'Manuelle Prüfung erforderlich',
  }[state];
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function nullable(value: string) {
  return value.trim() || null;
}

function defaultExpiry() {
  const value = new Date(Date.now() + 7 * 86_400_000);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.valueOf() - offset).toISOString().slice(0, 16);
}

function contactDisplayName(contact: Contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.label || 'Kontakt'
  );
}
