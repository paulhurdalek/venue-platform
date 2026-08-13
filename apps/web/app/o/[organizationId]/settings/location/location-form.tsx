'use client';

import type { components } from '@venue/api-client';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiErrorMessage, createBrowserApiClient } from '../../../../../src/api/browser';
import { FormMessage } from '../../../../components/form-message';

type Location = components['schemas']['LocationDto'];

export function LocationForm({ location }: { location: Location }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) ?? '').trim() || null;
    const capacity = nullable('capacity');
    const client = createBrowserApiClient();
    const { data, error } = await client.PATCH(
      '/api/v1/organizations/{organizationId}/locations/{locationId}',
      {
        credentials: 'include',
        params: {
          path: { organizationId: location.organizationId, locationId: location.id },
        },
        body: {
          version: location.version,
          name: String(form.get('name') ?? '').trim(),
          timezone: String(form.get('timezone') ?? '').trim(),
          capacity: capacity ? Number(capacity) : null,
          addressLine1: nullable('addressLine1'),
          addressLine2: nullable('addressLine2'),
          postalCode: nullable('postalCode'),
          city: nullable('city'),
          state: nullable('state'),
          countryCode: nullable('countryCode'),
          contactEmail: nullable('contactEmail'),
          contactPhone: nullable('contactPhone'),
        },
      },
    );
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Locationdaten konnten nicht gespeichert werden.'));
      setPending(false);
      return;
    }
    setMessage('Die Locationdaten wurden gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Name
        <input defaultValue={location.name} maxLength={160} name="name" required />
      </label>
      <label>
        IANA-Zeitzone
        <input defaultValue={location.timezone} maxLength={100} name="timezone" required />
      </label>
      <label>
        Kapazität <span className="optional">optional</span>
        <input
          defaultValue={location.capacity ?? ''}
          min={1}
          name="capacity"
          step={1}
          type="number"
        />
      </label>
      <label>
        Kontakt-E-Mail <span className="optional">optional</span>
        <input defaultValue={location.contactEmail ?? ''} name="contactEmail" type="email" />
      </label>
      <label>
        Adresszeile 1 <span className="optional">optional</span>
        <input defaultValue={location.addressLine1 ?? ''} maxLength={200} name="addressLine1" />
      </label>
      <label>
        Adresszeile 2 <span className="optional">optional</span>
        <input defaultValue={location.addressLine2 ?? ''} maxLength={200} name="addressLine2" />
      </label>
      <label>
        Postleitzahl <span className="optional">optional</span>
        <input defaultValue={location.postalCode ?? ''} maxLength={30} name="postalCode" />
      </label>
      <label>
        Ort <span className="optional">optional</span>
        <input defaultValue={location.city ?? ''} maxLength={120} name="city" />
      </label>
      <label>
        Bundesland/Region <span className="optional">optional</span>
        <input defaultValue={location.state ?? ''} maxLength={120} name="state" />
      </label>
      <label>
        Ländercode <span className="optional">optional</span>
        <input
          defaultValue={location.countryCode ?? ''}
          maxLength={2}
          minLength={2}
          name="countryCode"
          placeholder="DE"
        />
      </label>
      <label>
        Kontakt-Telefon <span className="optional">optional</span>
        <input
          defaultValue={location.contactPhone ?? ''}
          maxLength={80}
          name="contactPhone"
          type="tel"
        />
      </label>
      <div className="form-span">
        <FormMessage message={message} />
        <button className="button" disabled={pending} type="submit">
          {pending ? 'Speichern …' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  );
}
