'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  apiErrorMessage,
  createBrowserApiClient,
  occupancyConflictTargets,
  type OccupancyConflictTarget,
} from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { EditCancelAction, useDetailEdit } from '../master-data/editable-detail';
import { OccupancyConflictLinks } from './occupancy-conflict-links';

type DateOption = components['schemas']['DateOptionDto'];
type Location = components['schemas']['LocationDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type Contact = components['schemas']['ContactDto'];

export function DateOptionForm({
  organizationId,
  option,
  locations,
  partners,
  contacts,
}: {
  organizationId: string;
  option?: DateOption;
  locations: Location[];
  partners: Partner[];
  contacts: Contact[];
}) {
  const router = useRouter();
  const detailEdit = useDetailEdit();
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<OccupancyConflictTarget[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setConflicts([]);
    const form = new FormData(event.currentTarget);
    const endTime = String(form.get('occupancyEndTime') ?? '');
    const validUntilLocal = String(form.get('validUntil') ?? '');
    const values = {
      locationId: String(form.get('locationId') ?? ''),
      optionDate: String(form.get('optionDate') ?? ''),
      occupancyStartTime: String(form.get('occupancyStartTime') ?? ''),
      occupancyEndTime: endTime,
      occupancyEndNextDay: form.get('occupancyEndNextDay') === 'on',
      label: String(form.get('label') ?? '').trim(),
      businessPartnerId: nullable(String(form.get('businessPartnerId') ?? '')),
      contactId: nullable(String(form.get('contactId') ?? '')),
      note: nullable(String(form.get('note') ?? '')),
      validUntil: new Date(validUntilLocal).toISOString(),
    };
    const client = createBrowserApiClient();
    const result = option
      ? await client.PATCH('/api/v1/organizations/{organizationId}/date-options/{optionId}', {
          credentials: 'include',
          params: { path: { organizationId, optionId: option.id } },
          body: { ...values, version: option.version },
        })
      : await client.POST('/api/v1/organizations/{organizationId}/date-options', {
          credentials: 'include',
          params: { path: { organizationId } },
          body: values,
        });
    if (!result.data || result.error) {
      setConflicts(occupancyConflictTargets(result.error));
      setMessage(
        apiErrorMessage(result.error, 'Die Terminoption konnte nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    if (!option) {
      router.push(`/o/${organizationId}/events/options/${result.data.id}`);
      return;
    }
    if (detailEdit) detailEdit.complete('Die Terminoption wurde gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Bezeichnung
        <input defaultValue={option?.label} maxLength={200} name="label" required />
      </label>
      <label>
        Location
        <select
          defaultValue={option?.locationId ?? (locations.length === 1 ? locations[0]!.id : '')}
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
        Datum <input defaultValue={option?.optionDate} name="optionDate" required type="date" />
      </label>
      <label>
        Belegungsbeginn{' '}
        <input
          defaultValue={option?.occupancyStartTime}
          name="occupancyStartTime"
          required
          type="time"
        />
      </label>
      <label>
        Belegungsende{' '}
        <input
          defaultValue={option?.occupancyEndTime}
          name="occupancyEndTime"
          required
          type="time"
        />
      </label>
      <label className="checkbox-label">
        <input
          defaultChecked={option?.occupancyEndNextDay}
          name="occupancyEndNextDay"
          type="checkbox"
        />{' '}
        Ende am Folgetag
      </label>
      <label>
        Gültig bis
        <input
          defaultValue={option ? localDateTime(option.validUntil) : defaultExpiry()}
          name="validUntil"
          required
          type="datetime-local"
        />
      </label>
      <label>
        Geschäftspartner <span className="optional">optional</span>
        <select defaultValue={option?.businessPartnerId ?? ''} name="businessPartnerId">
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
        <select defaultValue={option?.contactId ?? ''} name="contactId">
          <option value="">Keiner</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contactDisplayName(contact)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-span">
        Notiz <span className="optional">optional, intern</span>
        <textarea defaultValue={option?.note ?? ''} maxLength={2000} name="note" rows={3} />
      </label>
      <div className="form-span">
        <FormMessage message={message} />
        <OccupancyConflictLinks conflicts={conflicts} organizationId={organizationId} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Speichern …' : option ? 'Änderungen speichern' : 'Terminoption anlegen'}
          </button>
          <EditCancelAction fallbackHref={`/o/${organizationId}/events`} />
        </div>
      </div>
    </form>
  );
}

function nullable(value: string) {
  return value.trim() || null;
}
function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}
function defaultExpiry() {
  return localDateTime(new Date(Date.now() + 7 * 86_400_000).toISOString());
}
function contactDisplayName(contact: Contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.label || 'Kontakt'
  );
}
