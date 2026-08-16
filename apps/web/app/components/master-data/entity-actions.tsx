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
type Association = components['schemas']['ContactAssociationDto'];
type Role = components['schemas']['MasterDataRoleDto'];

export function LifecycleAction({
  organizationId,
  kind,
  entityId,
  version,
  status,
}: {
  organizationId: string;
  kind: 'artist' | 'contact' | 'business-partner';
  entityId: string;
  version: number;
  status: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const archive = status === 'ACTIVE';

  async function changeStatus() {
    const confirmed = window.confirm(
      archive
        ? 'Diesen Datensatz archivieren? Bestehende Verknüpfungen bleiben erhalten.'
        : 'Diesen Datensatz reaktivieren?',
    );
    if (!confirmed) return;
    setPending(true);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const body = { version, status: archive ? ('ARCHIVED' as const) : ('ACTIVE' as const) };
    const result =
      kind === 'artist'
        ? await client.PATCH('/api/v1/organizations/{organizationId}/artists/{artistId}/status', {
            credentials: 'include',
            params: { path: { organizationId, artistId: entityId } },
            body,
          })
        : kind === 'contact'
          ? await client.PATCH(
              '/api/v1/organizations/{organizationId}/contacts/{contactId}/status',
              {
                credentials: 'include',
                params: { path: { organizationId, contactId: entityId } },
                body,
              },
            )
          : await client.PATCH(
              '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/status',
              {
                credentials: 'include',
                params: { path: { organizationId, businessPartnerId: entityId } },
                body,
              },
            );
    if (!result.data || result.error) {
      setMessage(apiErrorMessage(result.error, 'Der Status konnte nicht geändert werden.'));
      setPending(false);
      return;
    }
    setPending(false);
    router.refresh();
  }

  return (
    <div className="lifecycle-action">
      <FormMessage message={message} />
      <button
        className={archive ? 'button button--danger' : 'button button--secondary'}
        disabled={pending}
        onClick={changeStatus}
        type="button"
      >
        {pending ? 'Status wird geändert …' : archive ? 'Archivieren' : 'Reaktivieren'}
      </button>
    </div>
  );
}

export function ContactAssociationManager({
  organizationId,
  owner,
  associations,
  contacts,
  roles,
  canWrite,
  contactSearch,
}: {
  organizationId: string;
  owner: { kind: 'artist'; value: Artist } | { kind: 'business-partner'; value: Partner };
  associations: Association[];
  contacts: Contact[];
  roles: Role[];
  canWrite: boolean;
  contactSearch?: string | undefined;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const availableContacts = contacts.filter(
    (contact) => !associations.some((association) => association.contact.id === contact.id),
  );

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingId('new');
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const contactId = String(form.get('contactId') ?? '');
    const roleIds = form.getAll('roleIds').map(String);
    if (!contactId || roleIds.length === 0) {
      setMessage('Wählen Sie einen Kontakt und mindestens eine Rolle.');
      setPendingId(undefined);
      return;
    }
    const client = createBrowserApiClient();
    const result =
      owner.kind === 'artist'
        ? await client.POST('/api/v1/organizations/{organizationId}/artists/{artistId}/contacts', {
            credentials: 'include',
            params: { path: { organizationId, artistId: owner.value.id } },
            body: { contactId, roleIds },
          })
        : await client.POST(
            '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/contacts',
            {
              credentials: 'include',
              params: {
                path: { organizationId, businessPartnerId: owner.value.id },
              },
              body: { contactId, roleIds },
            },
          );
    finish(result.data, result.error, 'Der Kontakt konnte nicht verknüpft werden.');
  }

  async function updateRoles(event: FormEvent<HTMLFormElement>, association: Association) {
    event.preventDefault();
    setPendingId(association.id);
    setMessage(undefined);
    const roleIds = new FormData(event.currentTarget).getAll('roleIds').map(String);
    if (roleIds.length === 0) {
      setMessage('Mindestens eine Rolle ist erforderlich.');
      setPendingId(undefined);
      return;
    }
    const client = createBrowserApiClient();
    const result =
      owner.kind === 'artist'
        ? await client.PUT(
            '/api/v1/organizations/{organizationId}/artists/{artistId}/contacts/{associationId}/roles',
            {
              credentials: 'include',
              params: {
                path: {
                  organizationId,
                  artistId: owner.value.id,
                  associationId: association.id,
                },
              },
              body: { version: association.version, roleIds },
            },
          )
        : await client.PUT(
            '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/contacts/{associationId}/roles',
            {
              credentials: 'include',
              params: {
                path: {
                  organizationId,
                  businessPartnerId: owner.value.id,
                  associationId: association.id,
                },
              },
              body: { version: association.version, roleIds },
            },
          );
    finish(result.data, result.error, 'Die Rollen konnten nicht gespeichert werden.');
  }

  async function unlink(association: Association) {
    if (
      !window.confirm('Diese Kontaktzuordnung wirklich lösen? Der Kontakt selbst bleibt erhalten.')
    ) {
      return;
    }
    setPendingId(association.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result =
      owner.kind === 'artist'
        ? await client.DELETE(
            '/api/v1/organizations/{organizationId}/artists/{artistId}/contacts/{associationId}',
            {
              credentials: 'include',
              params: {
                path: {
                  organizationId,
                  artistId: owner.value.id,
                  associationId: association.id,
                },
                query: { version: association.version },
              },
            },
          )
        : await client.DELETE(
            '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/contacts/{associationId}',
            {
              credentials: 'include',
              params: {
                path: {
                  organizationId,
                  businessPartnerId: owner.value.id,
                  associationId: association.id,
                },
                query: { version: association.version },
              },
            },
          );
    finish(result.data, result.error, 'Die Kontaktzuordnung konnte nicht gelöst werden.');
  }

  function finish(data: unknown, error: unknown, fallback: string) {
    if (!data || error) {
      setMessage(apiErrorMessage(error, fallback));
      setPendingId(undefined);
      return;
    }
    setPendingId(undefined);
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <h2>Verknüpfte Kontakte</h2>
          <p>Zentrale Kontakte können an mehreren Stammdatensätzen verwendet werden.</p>
        </div>
      </div>
      <FormMessage message={message} />
      {canWrite && owner.value.status === 'ACTIVE' ? (
        <div className="association-create">
          <form className="association-search" method="get">
            <label>
              Kontakte durchsuchen
              <input
                defaultValue={contactSearch}
                name="contactQ"
                placeholder="Name oder Kontaktdaten"
                type="search"
              />
            </label>
            <button className="button button--secondary" type="submit">
              Suchen
            </button>
          </form>
          {availableContacts.length > 0 ? (
            <form className="form-stack" onSubmit={link}>
              <label>
                Kontakt auswählen
                <select name="contactId" required>
                  <option value="">Bitte auswählen</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contactName(contact)}
                    </option>
                  ))}
                </select>
              </label>
              <RoleChoices name="roleIds" roles={roles} />
              <button className="button" disabled={pendingId === 'new'} type="submit">
                Kontakt verknüpfen
              </button>
            </form>
          ) : (
            <p className="muted">
              {contactSearch
                ? 'Kein noch nicht verknüpfter Kontakt passt zur Suche.'
                : 'Kein weiterer aktiver Kontakt verfügbar. Legen Sie zuerst einen zentralen Kontakt an.'}
            </p>
          )}
        </div>
      ) : null}
      <div className="association-list">
        {associations.map((association) => (
          <article className="association-card" key={association.id}>
            <header>
              <div>
                <h3>{contactName(association.contact)}</h3>
                <p>{association.contact.label ?? 'Keine Funktionsbezeichnung'}</p>
              </div>
              <span
                className={`status-badge status-badge--${association.contact.status.toLowerCase()}`}
              >
                {association.contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
              </span>
            </header>
            {canWrite ? (
              <form onSubmit={(event) => updateRoles(event, association)}>
                <RoleChoices
                  checkedIds={association.roles.map((role) => role.id)}
                  name="roleIds"
                  roles={roles}
                />
                <div className="button-row">
                  <button
                    className="button button--small button--secondary"
                    disabled={pendingId === association.id}
                    type="submit"
                  >
                    Rollen speichern
                  </button>
                  <button
                    className="text-button text-button--danger"
                    disabled={pendingId === association.id}
                    onClick={() => unlink(association)}
                    type="button"
                  >
                    Zuordnung lösen
                  </button>
                </div>
              </form>
            ) : (
              <p>{association.roles.map((role) => role.name).join(', ')}</p>
            )}
          </article>
        ))}
        {associations.length === 0 ? (
          <p className="empty-state">Noch keine Kontakte verknüpft.</p>
        ) : null}
      </div>
    </section>
  );
}

export function BusinessPartnerRoleManager({
  organizationId,
  partner,
  roles,
}: {
  organizationId: string;
  partner: Partner;
  roles: Role[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const roleIds = new FormData(event.currentTarget).getAll('roleIds').map(String);
    const client = createBrowserApiClient();
    const { data, error } = await client.PUT(
      '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/roles',
      {
        credentials: 'include',
        params: { path: { organizationId, businessPartnerId: partner.id } },
        body: { version: partner.version, roleIds },
      },
    );
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Rollen konnten nicht gespeichert werden.'));
      setPending(false);
      return;
    }
    setPending(false);
    router.refresh();
  }
  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <h2>Geschäftspartnerrollen</h2>
          <p>Ein Geschäftspartner kann mehrere Rollen gleichzeitig besitzen.</p>
        </div>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <RoleChoices
          checkedIds={partner.roles.map((role) => role.id)}
          name="roleIds"
          roles={roles}
        />
        <FormMessage message={message} />
        <button className="button" disabled={pending} type="submit">
          Rollen speichern
        </button>
      </form>
    </section>
  );
}

function RoleChoices({
  roles,
  name,
  checkedIds = [],
}: {
  roles: Role[];
  name: string;
  checkedIds?: string[];
}) {
  return (
    <fieldset>
      <legend>Rollen</legend>
      <div className="choice-grid">
        {roles.map((role) => (
          <label className="choice" key={role.id}>
            <input
              defaultChecked={checkedIds.includes(role.id)}
              name={name}
              type="checkbox"
              value={role.id}
            />
            <span>{role.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function contactName(contact: { firstName?: string | null; lastName?: string | null }): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unbenannter Kontakt';
}
