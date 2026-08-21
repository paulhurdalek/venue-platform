'use client';

import type { components } from '@venue/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ContactChannels } from './detail-display';
import {
  ContactFields,
  ContactMatches,
  contactDraft,
  contactName,
  type ContactDraft,
  type ContactMatch,
} from './inline-contact';

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
  const triggerId = useId();
  const menuId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const archive = status === 'ACTIVE';
  const entityLabel =
    kind === 'artist' ? 'Artist' : kind === 'contact' ? 'Kontakt' : 'Geschäftspartner';
  const actionLabel = archive ? `${entityLabel} archivieren` : 'Reaktivieren';

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    function closeFromOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!confirming || !dialogRef.current || dialogRef.current.open) return;
    dialogRef.current.showModal();
  }, [confirming]);

  function openConfirmation() {
    setMenuOpen(false);
    setMessage(undefined);
    setMessageSuccess(false);
    setConfirming(true);
  }

  function closeConfirmation() {
    dialogRef.current?.close();
    setConfirming(false);
    setMessage(undefined);
    setMessageSuccess(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  async function changeStatus() {
    setPending(true);
    setMessage(undefined);
    setMessageSuccess(false);
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
    dialogRef.current?.close();
    setConfirming(false);
    setPending(false);
    setMessageSuccess(true);
    setMessage(
      archive ? `Der ${entityLabel} wurde archiviert.` : `Der ${entityLabel} wurde reaktiviert.`,
    );
    router.refresh();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="detail-actions-menu">
      <button
        aria-controls={menuId}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="button button--quiet detail-actions-menu__trigger"
        id={triggerId}
        onClick={() => {
          setMessage(undefined);
          setMessageSuccess(false);
          setMenuOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setMenuOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        Weitere Aktionen
      </button>
      {menuOpen ? (
        <div
          aria-labelledby={triggerId}
          className="detail-actions-menu__popover"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          <button
            className={archive ? 'detail-actions-menu__danger' : undefined}
            onClick={openConfirmation}
            role="menuitem"
            type="button"
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
      {message && !confirming ? (
        <div className="detail-actions-menu__message">
          <FormMessage message={message} success={messageSuccess} />
        </div>
      ) : null}
      {confirming ? (
        <dialog
          aria-describedby={dialogDescriptionId}
          aria-labelledby={dialogTitleId}
          className="confirmation-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeConfirmation();
          }}
          ref={dialogRef}
        >
          <div className="confirmation-dialog__content">
            <div>
              <p className="eyebrow">Lebenszyklus</p>
              <h2 id={dialogTitleId}>
                {archive ? `${entityLabel} archivieren?` : `${entityLabel} reaktivieren?`}
              </h2>
            </div>
            <div className="confirmation-dialog__description" id={dialogDescriptionId}>
              {archive ? (
                <>
                  <p>Der {entityLabel} wird archiviert.</p>
                  <ul>
                    <li>Bestehende Verknüpfungen bleiben erhalten.</li>
                    <li>Der Datensatz steht für neue Zuordnungen nicht mehr zur Verfügung.</li>
                    <li>Er kann später wieder reaktiviert werden.</li>
                  </ul>
                </>
              ) : (
                <p>
                  Der {entityLabel} wird reaktiviert und steht anschließend wieder für neue
                  Zuordnungen zur Verfügung.
                </p>
              )}
            </div>
            <FormMessage message={message} />
            <div className="button-row confirmation-dialog__actions">
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={closeConfirmation}
                type="button"
              >
                Abbrechen
              </button>
              <button
                className={archive ? 'button button--danger' : 'button'}
                disabled={pending}
                onClick={changeStatus}
                type="button"
              >
                {pending ? 'Status wird geändert …' : archive ? 'Archivieren' : 'Reaktivieren'}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
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
  canCreateContacts,
  contactSearch,
  blockedContactIds = [],
}: {
  organizationId: string;
  owner: { kind: 'artist'; value: Artist } | { kind: 'business-partner'; value: Partner };
  associations: Association[];
  contacts: Contact[];
  roles: Role[];
  canWrite: boolean;
  canCreateContacts: boolean;
  contactSearch?: string | undefined;
  blockedContactIds?: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [pendingDraft, setPendingDraft] = useState<ContactDraft>();
  const [pendingRoles, setPendingRoles] = useState<string[]>([]);
  const canManage = canWrite && owner.value.status === 'ACTIVE';
  const blocked = new Set(blockedContactIds);
  const availableContacts = contacts.filter(
    (contact) =>
      !blocked.has(contact.id) &&
      !associations.some((association) => association.contact.id === contact.id),
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
    await linkContact(contactId, roleIds);
  }

  async function linkContact(contactId: string, roleIds: string[]) {
    if (blocked.has(contactId)) {
      setMessage(
        'Dieser Kontakt ist beim Artist bereits als Ansprechpartner einer Firmenvertretung hinterlegt.',
      );
      setPendingId(undefined);
      return;
    }
    setPendingId('new');
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

  async function createNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft = contactDraft(form);
    const roleIds = form.getAll('roleIds').map(String);
    if ((!draft.firstName && !draft.lastName) || roleIds.length === 0) {
      setMessage('Geben Sie Vor- oder Nachname an und wählen Sie mindestens eine Rolle.');
      return;
    }
    setPendingId('new-contact');
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.POST('/api/v1/organizations/{organizationId}/contacts/matches', {
      credentials: 'include',
      params: { path: { organizationId } },
      body: draft,
    });
    if (!result.data) {
      setMessage(
        apiErrorMessage(
          (result as { error?: unknown }).error,
          'Der Kontaktabgleich ist fehlgeschlagen.',
        ),
      );
      setPendingId(undefined);
      return;
    }
    if (result.data.length > 0) {
      setMatches(result.data);
      setPendingDraft(draft);
      setPendingRoles(roleIds);
      setPendingId(undefined);
      return;
    }
    await persistNew(draft, roleIds, false);
  }

  async function persistNew(draft: ContactDraft, roleIds: string[], allowNameDuplicate: boolean) {
    setPendingId('new-contact');
    const client = createBrowserApiClient();
    const result =
      owner.kind === 'artist'
        ? await client.POST(
            '/api/v1/organizations/{organizationId}/artists/{artistId}/contacts/inline',
            {
              credentials: 'include',
              params: { path: { organizationId, artistId: owner.value.id } },
              body: { contact: { ...draft, allowNameDuplicate }, roleIds },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/business-partners/{businessPartnerId}/contacts/inline',
            {
              credentials: 'include',
              params: {
                path: { organizationId, businessPartnerId: owner.value.id },
              },
              body: { contact: { ...draft, allowNameDuplicate }, roleIds },
            },
          );
    if (!result.data || result.error) {
      setMessage(
        apiErrorMessage(result.error, 'Der Ansprechpartner konnte nicht angelegt werden.'),
      );
      setPendingId(undefined);
      return;
    }
    setMatches([]);
    setPendingDraft(undefined);
    setPendingRoles([]);
    setPendingId(undefined);
    setEditing(false);
    router.refresh();
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
    <section className="panel detail-panel">
      <div className="panel__heading panel__heading--compact">
        <div>
          <h2>
            {owner.kind === 'artist'
              ? 'Direkte Kontakte ohne Firmenvertretung'
              : 'Ansprechpartner der Firma'}
          </h2>
          <p>
            {owner.kind === 'artist'
              ? 'Personen, die für diesen Artist direkt zuständig sind. Diese Zuordnung erfolgt ohne Agentur oder Firma.'
              : 'Zentrale Kontakte, die für diese Firma tätig oder zuständig sind.'}
          </p>
        </div>
        {canManage ? (
          <button
            aria-expanded={editing}
            className="button button--small button--secondary"
            onClick={() => {
              setMessage(undefined);
              setEditing((current) => !current);
            }}
            type="button"
          >
            {editing
              ? 'Bearbeitung schließen'
              : owner.kind === 'artist'
                ? 'Direkte Kontakte bearbeiten'
                : associations.length > 0
                  ? 'Ansprechpartner bearbeiten'
                  : 'Ansprechpartner hinzufügen'}
          </button>
        ) : null}
      </div>
      <FormMessage message={message} />
      {editing && canManage ? (
        <div className="association-create">
          <div className="mode-switch" role="group" aria-label="Art des Ansprechpartners">
            <button
              aria-pressed={mode === 'existing'}
              className="button button--small button--secondary"
              onClick={() => {
                setMode('existing');
                setMatches([]);
              }}
              type="button"
            >
              Vorhandenen Kontakt auswählen
            </button>
            {canCreateContacts ? (
              <button
                aria-pressed={mode === 'new'}
                className="button button--small button--secondary"
                onClick={() => {
                  setMode('new');
                  setMatches([]);
                }}
                type="button"
              >
                Neuen Ansprechpartner anlegen
              </button>
            ) : null}
          </div>
          {mode === 'existing' ? (
            <>
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
                    : 'Kein weiterer aktiver Kontakt verfügbar.'}
                </p>
              )}
              {owner.kind === 'artist' && blocked.size > 0 ? (
                <p className="permission-note">
                  Kontakte aus Firmenvertretungen werden hier nicht erneut angeboten.
                </p>
              ) : null}
            </>
          ) : canCreateContacts ? (
            <form className="form-stack" onChange={() => setMatches([])} onSubmit={createNew}>
              <ContactFields />
              <RoleChoices name="roleIds" roles={roles} />
              <ContactMatches
                matches={matches}
                onCreateAnyway={
                  pendingDraft ? () => persistNew(pendingDraft, pendingRoles, true) : undefined
                }
                onReuse={(contactId) => linkContact(contactId, pendingRoles)}
                pending={Boolean(pendingId)}
              />
              <div className="button-row">
                <button
                  className="button"
                  disabled={pendingId === 'new-contact' || matches.length > 0}
                  type="submit"
                >
                  {pendingId === 'new-contact'
                    ? 'Ansprechpartner wird angelegt …'
                    : 'Ansprechpartner anlegen'}
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setMode('existing');
                    setMatches([]);
                  }}
                  type="button"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      <div className="association-list">
        {associations.map((association) => (
          <article className="association-card" key={association.id}>
            <header>
              <div>
                <h3>
                  <Link href={`/o/${organizationId}/contacts/${association.contact.id}`}>
                    {contactName(association.contact)}
                  </Link>
                </h3>
                {association.contact.label ? <p>{association.contact.label}</p> : null}
              </div>
              <span
                className={`status-badge status-badge--${association.contact.status.toLowerCase()}`}
              >
                {association.contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
              </span>
            </header>
            <p className="role-summary">{association.roles.map((role) => role.name).join(', ')}</p>
            {blocked.has(association.contact.id) ? (
              <div className="conflict-warning" role="status">
                <span className="status-badge status-badge--warning">Zuordnungskonflikt</span>
                <p>
                  Dieser Kontakt ist zusätzlich über eine Firmenvertretung zugeordnet. Lösen Sie
                  eine der beiden Zuordnungen manuell.
                </p>
              </div>
            ) : null}
            <ContactChannels contact={association.contact} />
            {editing && canWrite ? (
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
            ) : null}
          </article>
        ))}
        {associations.length === 0 ? (
          <p className="empty-state">
            {owner.kind === 'artist'
              ? 'Keine direkten Kontakte hinterlegt.'
              : 'Keine Ansprechpartner der Firma hinterlegt.'}
          </p>
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
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
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
      setSaved(false);
      setPending(false);
      return;
    }
    setMessage('Die Geschäftspartnerrollen wurden gespeichert.');
    setSaved(true);
    setEditing(false);
    setPending(false);
    router.refresh();
  }
  return (
    <section className="panel detail-panel">
      <div className="panel__heading panel__heading--compact">
        <div>
          <h2>Geschäftspartnerrollen</h2>
          <p>Ein Geschäftspartner kann mehrere Rollen gleichzeitig besitzen.</p>
        </div>
        <button
          aria-expanded={editing}
          className="button button--small button--secondary"
          onClick={() => {
            setMessage(undefined);
            setSaved(false);
            setEditing((current) => !current);
          }}
          type="button"
        >
          {editing ? 'Abbrechen' : 'Rollen bearbeiten'}
        </button>
      </div>
      <FormMessage message={message} success={saved} />
      {editing ? (
        <form className="form-stack" onSubmit={submit}>
          <RoleChoices
            checkedIds={partner.roles.map((role) => role.id)}
            name="roleIds"
            roles={roles}
          />
          <button className="button" disabled={pending} type="submit">
            Rollen speichern
          </button>
        </form>
      ) : (
        <div className="role-chips" aria-label="Zugewiesene Geschäftspartnerrollen">
          {partner.roles.map((role) => (
            <span className="status-badge" key={role.id}>
              {role.name}
            </span>
          ))}
          {partner.roles.length === 0 ? <span className="compact-empty">Keine Rollen</span> : null}
        </div>
      )}
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
