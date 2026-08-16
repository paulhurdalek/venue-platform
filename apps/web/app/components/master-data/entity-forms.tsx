'use client';

import type { components } from '@venue/api-client';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';

type Artist = components['schemas']['ArtistDto'];
type Contact = components['schemas']['ContactDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type Role = components['schemas']['MasterDataRoleDto'];
type AddressValue = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingCountryCode?: string | null;
};

const nullable = (form: FormData, name: string) => String(form.get(name) ?? '').trim() || null;

export function ArtistForm({
  organizationId,
  artist,
}: {
  organizationId: string;
  artist?: Artist;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const body = {
      stageName: nullable(form, 'stageName'),
      firstName: nullable(form, 'firstName'),
      lastName: nullable(form, 'lastName'),
      addressLine1: nullable(form, 'addressLine1'),
      addressLine2: nullable(form, 'addressLine2'),
      postalCode: nullable(form, 'postalCode'),
      city: nullable(form, 'city'),
      state: nullable(form, 'state'),
      countryCode: nullable(form, 'countryCode')?.toUpperCase() ?? null,
      email: nullable(form, 'email'),
      phone: nullable(form, 'phone'),
      instagram: nullable(form, 'instagram'),
      website: nullable(form, 'website'),
      notes: nullable(form, 'notes'),
    };
    const client = createBrowserApiClient();
    const result = artist
      ? await client.PATCH('/api/v1/organizations/{organizationId}/artists/{artistId}', {
          credentials: 'include',
          params: { path: { organizationId, artistId: artist.id } },
          body: { ...body, version: artist.version },
        })
      : await client.POST('/api/v1/organizations/{organizationId}/artists', {
          credentials: 'include',
          params: { path: { organizationId } },
          body,
        });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Artist konnte nicht gespeichert werden.'));
      setPending(false);
      return;
    }
    if (!artist) {
      router.push(`/o/${organizationId}/artists/${result.data.id}`);
      return;
    }
    setMessage('Die Artist-Stammdaten wurden gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Künstlername <span className="optional">optional bei Personenname</span>
        <input defaultValue={artist?.stageName ?? ''} maxLength={200} name="stageName" />
      </label>
      <div className="form-grid form-span nested-grid">
        <label>
          Vorname <span className="optional">optional</span>
          <input defaultValue={artist?.firstName ?? ''} maxLength={120} name="firstName" />
        </label>
        <label>
          Nachname <span className="optional">optional</span>
          <input defaultValue={artist?.lastName ?? ''} maxLength={120} name="lastName" />
        </label>
      </div>
      <label>
        E-Mail <span className="optional">optional</span>
        <input defaultValue={artist?.email ?? ''} name="email" type="email" />
      </label>
      <label>
        Telefon <span className="optional">optional</span>
        <input defaultValue={artist?.phone ?? ''} maxLength={80} name="phone" type="tel" />
      </label>
      <label>
        Instagram <span className="optional">optional</span>
        <input defaultValue={artist?.instagram ?? ''} maxLength={160} name="instagram" />
      </label>
      <label>
        Website <span className="optional">optional</span>
        <input defaultValue={artist?.website ?? ''} maxLength={500} name="website" type="url" />
      </label>
      <AddressFields value={artist} />
      <label className="form-span">
        Interne Notizen <span className="optional">optional</span>
        <textarea defaultValue={artist?.notes ?? ''} maxLength={5000} name="notes" rows={5} />
      </label>
      <div className="form-span">
        <FormMessage message={message} success={message?.includes('gespeichert')} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Speichern …' : artist ? 'Änderungen speichern' : 'Artist anlegen'}
          </button>
          <a className="button button--secondary" href={`/o/${organizationId}/artists`}>
            Abbrechen
          </a>
        </div>
      </div>
    </form>
  );
}

export function ContactForm({
  organizationId,
  contact,
}: {
  organizationId: string;
  contact?: Contact;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const body = {
      firstName: nullable(form, 'firstName'),
      lastName: nullable(form, 'lastName'),
      label: nullable(form, 'label'),
      email: nullable(form, 'email'),
      phone: nullable(form, 'phone'),
      mobile: nullable(form, 'mobile'),
      notes: nullable(form, 'notes'),
    };
    const client = createBrowserApiClient();
    const result = contact
      ? await client.PATCH('/api/v1/organizations/{organizationId}/contacts/{contactId}', {
          credentials: 'include',
          params: { path: { organizationId, contactId: contact.id } },
          body: { ...body, version: contact.version },
        })
      : await client.POST('/api/v1/organizations/{organizationId}/contacts', {
          credentials: 'include',
          params: { path: { organizationId } },
          body,
        });
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Kontakt konnte nicht gespeichert werden.'));
      setPending(false);
      return;
    }
    if (!contact) {
      router.push(`/o/${organizationId}/contacts/${result.data.id}`);
      return;
    }
    setMessage('Die Kontakt-Stammdaten wurden gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label>
        Vorname <span className="optional">optional bei Nachname</span>
        <input defaultValue={contact?.firstName ?? ''} maxLength={120} name="firstName" />
      </label>
      <label>
        Nachname <span className="optional">optional bei Vorname</span>
        <input defaultValue={contact?.lastName ?? ''} maxLength={120} name="lastName" />
      </label>
      <label className="form-span">
        Funktion oder Bezeichnung <span className="optional">optional</span>
        <input defaultValue={contact?.label ?? ''} maxLength={160} name="label" />
      </label>
      <label>
        E-Mail <span className="optional">optional</span>
        <input defaultValue={contact?.email ?? ''} name="email" type="email" />
      </label>
      <label>
        Telefon <span className="optional">optional</span>
        <input defaultValue={contact?.phone ?? ''} maxLength={80} name="phone" type="tel" />
      </label>
      <label>
        Mobiltelefon <span className="optional">optional</span>
        <input defaultValue={contact?.mobile ?? ''} maxLength={80} name="mobile" type="tel" />
      </label>
      <label className="form-span">
        Notizen <span className="optional">optional</span>
        <textarea defaultValue={contact?.notes ?? ''} maxLength={5000} name="notes" rows={5} />
      </label>
      <div className="form-span">
        <FormMessage message={message} success={message?.includes('gespeichert')} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Speichern …' : contact ? 'Änderungen speichern' : 'Kontakt anlegen'}
          </button>
          <a className="button button--secondary" href={`/o/${organizationId}/contacts`}>
            Abbrechen
          </a>
        </div>
      </div>
    </form>
  );
}

export function BusinessPartnerForm({
  organizationId,
  partner,
  roles,
}: {
  organizationId: string;
  partner?: Partner;
  roles: Role[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const body = {
      companyName: String(form.get('companyName') ?? '').trim(),
      addressLine1: nullable(form, 'addressLine1'),
      addressLine2: nullable(form, 'addressLine2'),
      postalCode: nullable(form, 'postalCode'),
      city: nullable(form, 'city'),
      state: nullable(form, 'state'),
      countryCode: nullable(form, 'countryCode')?.toUpperCase() ?? null,
      billingAddressLine1: nullable(form, 'billingAddressLine1'),
      billingAddressLine2: nullable(form, 'billingAddressLine2'),
      billingPostalCode: nullable(form, 'billingPostalCode'),
      billingCity: nullable(form, 'billingCity'),
      billingState: nullable(form, 'billingState'),
      billingCountryCode: nullable(form, 'billingCountryCode')?.toUpperCase() ?? null,
      vatId: nullable(form, 'vatId'),
      email: nullable(form, 'email'),
      phone: nullable(form, 'phone'),
      website: nullable(form, 'website'),
      notes: nullable(form, 'notes'),
    };
    const client = createBrowserApiClient();
    const result = partner
      ? await client.PATCH(
          '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}',
          {
            credentials: 'include',
            params: { path: { organizationId, businessPartnerId: partner.id } },
            body: { ...body, version: partner.version },
          },
        )
      : await client.POST('/api/v1/organizations/{organizationId}/business-partners', {
          credentials: 'include',
          params: { path: { organizationId } },
          body: { ...body, roleIds: form.getAll('roleIds').map(String) },
        });
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Der Geschäftspartner konnte nicht gespeichert werden.'),
      );
      setPending(false);
      return;
    }
    if (!partner) {
      router.push(`/o/${organizationId}/business-partners/${result.data.id}`);
      return;
    }
    setMessage('Die Geschäftspartner-Stammdaten wurden gespeichert.');
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form-stack form-grid" onSubmit={submit}>
      <label className="form-span">
        Firmenname
        <input
          defaultValue={partner?.companyName ?? ''}
          maxLength={240}
          name="companyName"
          required
        />
      </label>
      <label>
        Allgemeine E-Mail <span className="optional">optional</span>
        <input defaultValue={partner?.email ?? ''} name="email" type="email" />
      </label>
      <label>
        Telefon <span className="optional">optional</span>
        <input defaultValue={partner?.phone ?? ''} maxLength={80} name="phone" type="tel" />
      </label>
      <label>
        Website <span className="optional">optional</span>
        <input defaultValue={partner?.website ?? ''} maxLength={500} name="website" type="url" />
      </label>
      <label>
        USt-ID <span className="optional">optional</span>
        <input defaultValue={partner?.vatId ?? ''} maxLength={80} name="vatId" />
      </label>
      <fieldset className="form-span address-fieldset">
        <legend>Anschrift</legend>
        <div className="form-grid">
          <AddressFields value={partner} />
        </div>
      </fieldset>
      <fieldset className="form-span address-fieldset">
        <legend>Abweichende Rechnungsanschrift</legend>
        <div className="form-grid">
          <AddressFields billing value={partner} />
        </div>
      </fieldset>
      {!partner ? (
        <fieldset className="form-span">
          <legend>Geschäftspartnerrollen</legend>
          <div className="choice-grid">
            {roles.map((role) => (
              <label className="choice" key={role.id}>
                <input name="roleIds" type="checkbox" value={role.id} />
                <span>{role.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="form-span">
        Notizen <span className="optional">optional</span>
        <textarea defaultValue={partner?.notes ?? ''} maxLength={5000} name="notes" rows={5} />
      </label>
      <div className="form-span">
        <FormMessage message={message} success={message?.includes('gespeichert')} />
        <div className="button-row form-actions">
          <button className="button" disabled={pending} type="submit">
            {pending
              ? 'Speichern …'
              : partner
                ? 'Änderungen speichern'
                : 'Geschäftspartner anlegen'}
          </button>
          <a className="button button--secondary" href={`/o/${organizationId}/business-partners`}>
            Abbrechen
          </a>
        </div>
      </div>
    </form>
  );
}

function AddressFields({
  value,
  billing = false,
}: {
  value?: AddressValue | undefined;
  billing?: boolean;
}) {
  const prefix = billing ? 'billing' : '';
  const field = (name: string) =>
    prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name;
  const read = (name: string) => value?.[field(name) as keyof AddressValue];
  return (
    <>
      <label>
        Adresszeile 1 <span className="optional">optional</span>
        <input
          defaultValue={read('addressLine1') ?? ''}
          maxLength={200}
          name={field('addressLine1')}
        />
      </label>
      <label>
        Adresszeile 2 <span className="optional">optional</span>
        <input
          defaultValue={read('addressLine2') ?? ''}
          maxLength={200}
          name={field('addressLine2')}
        />
      </label>
      <label>
        Postleitzahl <span className="optional">optional</span>
        <input defaultValue={read('postalCode') ?? ''} maxLength={30} name={field('postalCode')} />
      </label>
      <label>
        Ort <span className="optional">optional</span>
        <input defaultValue={read('city') ?? ''} maxLength={120} name={field('city')} />
      </label>
      <label>
        Bundesland/Region <span className="optional">optional</span>
        <input defaultValue={read('state') ?? ''} maxLength={120} name={field('state')} />
      </label>
      <label>
        Ländercode <span className="optional">optional</span>
        <input
          defaultValue={read('countryCode') ?? ''}
          maxLength={2}
          minLength={2}
          name={field('countryCode')}
          pattern="[A-Za-z]{2}"
          placeholder="DE"
        />
      </label>
    </>
  );
}
