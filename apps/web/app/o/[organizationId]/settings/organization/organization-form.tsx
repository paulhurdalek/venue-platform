'use client';

import type { components } from '@venue/api-client';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiErrorMessage, createBrowserApiClient } from '../../../../../src/api/browser';
import { FormMessage } from '../../../../components/form-message';

type Organization = components['schemas']['OrganizationDto'];

export function OrganizationForm({ organization }: { organization: Organization }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) ?? '').trim() || null;
    const client = createBrowserApiClient();
    const { data, error } = await client.PATCH('/api/v1/organizations/{organizationId}', {
      credentials: 'include',
      params: { path: { organizationId: organization.id } },
      body: {
        version: organization.version,
        name: String(form.get('name') ?? '').trim(),
        legalName: nullable('legalName'),
        email: nullable('email'),
        phone: nullable('phone'),
      },
    });
    if (!data || error) {
      setMessage(
        apiErrorMessage(error, 'Die Organisationsdaten konnten nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    setMessage('Die Organisationsdaten wurden gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Name
        <input defaultValue={organization.name} maxLength={160} name="name" required />
      </label>
      <label>
        Rechtlicher Name <span className="optional">optional</span>
        <input defaultValue={organization.legalName ?? ''} maxLength={200} name="legalName" />
      </label>
      <label>
        Allgemeine E-Mail <span className="optional">optional</span>
        <input defaultValue={organization.email ?? ''} name="email" type="email" />
      </label>
      <label>
        Telefonnummer <span className="optional">optional</span>
        <input defaultValue={organization.phone ?? ''} maxLength={80} name="phone" type="tel" />
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
