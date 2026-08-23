'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { EditCancelAction, useDetailEdit } from '../master-data/editable-detail';

type EventFormat = components['schemas']['EventFormatDto'];
type CreateEventFormat = components['schemas']['CreateEventFormatDto'];

const nullable = (form: FormData, name: string) => String(form.get(name) ?? '').trim() || null;

export function EventFormatForm({
  organizationId,
  eventFormat,
}: {
  organizationId: string;
  eventFormat?: EventFormat;
}) {
  const router = useRouter();
  const detailEdit = useDetailEdit();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [endTime, setEndTime] = useState(eventFormat?.defaultEndTime ?? '');
  const [endDay, setEndDay] = useState(eventFormat?.defaultEndNextDay ? 'NEXT' : 'SAME');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const body: CreateEventFormat = {
      name: String(form.get('name') ?? '').trim(),
      description: nullable(form, 'description'),
      eventKind: String(form.get('eventKind')) as CreateEventFormat['eventKind'],
      defaultTechnicalGetInTime: nullable(form, 'defaultTechnicalGetInTime'),
      defaultArtistGetInTime: nullable(form, 'defaultArtistGetInTime'),
      defaultDoorsTime: nullable(form, 'defaultDoorsTime'),
      defaultStartTime: nullable(form, 'defaultStartTime'),
      defaultEndTime: endTime || null,
      defaultEndNextDay: Boolean(endTime) && endDay === 'NEXT',
      recordingDefault: String(
        form.get('recordingDefault'),
      ) as CreateEventFormat['recordingDefault'],
    };
    const client = createBrowserApiClient();
    const result = eventFormat
      ? await client.PATCH('/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}', {
          credentials: 'include',
          params: { path: { organizationId, eventFormatId: eventFormat.id } },
          body: { ...body, version: eventFormat.version },
        })
      : await client.POST('/api/v1/organizations/{organizationId}/event-formats', {
          credentials: 'include',
          params: { path: { organizationId } },
          body,
        });
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Das Veranstaltungsformat konnte nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    if (!eventFormat) {
      router.push(`/o/${organizationId}/event-formats/${result.data.id}`);
      return;
    }
    const success = 'Das Veranstaltungsformat wurde gespeichert.';
    if (detailEdit) detailEdit.complete(success);
    else setMessage(success);
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Name
        <input
          autoComplete="off"
          defaultValue={eventFormat?.name ?? ''}
          maxLength={200}
          name="name"
          required
        />
      </label>
      <label>
        Veranstaltungsart
        <select defaultValue={eventFormat?.eventKind ?? 'OWN_PRODUCTION'} name="eventKind">
          <option value="OWN_PRODUCTION">Eigenproduktion</option>
          <option value="THIRD_PARTY_EVENT">Fremdveranstaltung / Vermietung</option>
        </select>
      </label>
      <label className="form-span">
        Beschreibung <span className="optional">optional</span>
        <textarea
          defaultValue={eventFormat?.description ?? ''}
          maxLength={5000}
          name="description"
          rows={4}
        />
      </label>
      <fieldset className="form-span">
        <legend>Standardzeiten</legend>
        <p className="field-hint">
          Lokale Uhrzeiten; leere Felder bleiben in späteren Veranstaltungen frei.
        </p>
        <div className="form-grid nested-grid event-time-grid">
          <TimeField
            defaultValue={eventFormat?.defaultTechnicalGetInTime}
            label="Get-in Technik"
            name="defaultTechnicalGetInTime"
          />
          <TimeField
            defaultValue={eventFormat?.defaultArtistGetInTime}
            label="Get-in Artists"
            name="defaultArtistGetInTime"
          />
          <TimeField
            defaultValue={eventFormat?.defaultDoorsTime}
            label="Einlass"
            name="defaultDoorsTime"
          />
          <TimeField
            defaultValue={eventFormat?.defaultStartTime}
            label="Beginn"
            name="defaultStartTime"
          />
          <label>
            Ende <span className="optional">optional</span>
            <input
              name="defaultEndTime"
              onChange={(event) => {
                setEndTime(event.target.value);
                if (!event.target.value) setEndDay('SAME');
              }}
              type="time"
              value={endTime}
            />
          </label>
          <label>
            Tag des Endes
            <select
              disabled={!endTime}
              onChange={(event) => setEndDay(event.target.value)}
              value={endDay}
            >
              <option value="SAME">Am Veranstaltungstag</option>
              <option value="NEXT">Am Folgetag (+1 Tag)</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="form-span">
        <legend>Standardoptionen</legend>
        <label>
          Aufzeichnung
          <select
            defaultValue={eventFormat?.recordingDefault ?? 'UNSPECIFIED'}
            name="recordingDefault"
          >
            <option value="UNSPECIFIED">Nicht vorgegeben</option>
            <option value="ENABLED">Standardmäßig aktiv</option>
            <option value="DISABLED">Standardmäßig inaktiv</option>
          </select>
        </label>
      </fieldset>
      <div className="form-span">
        <FormMessage message={message} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending
              ? 'Speichern …'
              : eventFormat
                ? 'Änderungen speichern'
                : 'Veranstaltungsformat anlegen'}
          </button>
          <EditCancelAction fallbackHref={`/o/${organizationId}/event-formats`} />
        </div>
      </div>
    </form>
  );
}

function TimeField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null | undefined;
}) {
  return (
    <label>
      {label} <span className="optional">optional</span>
      <input defaultValue={defaultValue ?? ''} name={name} type="time" />
    </label>
  );
}
