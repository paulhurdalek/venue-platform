'use client';

import type { components } from '@venue/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../src/api/browser';
import { FormMessage } from '../form-message';
import { ContactChannels, phoneHref } from './detail-display';
import {
  ContactFields,
  ContactMatches,
  contactDraft,
  contactName,
  type ContactDraft,
  type ContactMatch,
} from './inline-contact';

type Artist = components['schemas']['ArtistDto'];
type Association = components['schemas']['ArtistBusinessPartnerAssociationDto'];
type Partner = components['schemas']['BusinessPartnerDto'];
type Representative = components['schemas']['ArtistRepresentativeDto'];
type Role = components['schemas']['MasterDataRoleDto'];
type InlineContactFlow = {
  kind: 'association' | 'representative';
  draft: ContactDraft;
  businessPartnerId: string;
  associationId?: string;
  businessPartnerRoleIds?: string[];
  contactRoleIds: string[];
  isPrimary: boolean;
};

export function ArtistRepresentationManager({
  organizationId,
  artist,
  partners,
  businessPartnerRoles,
  contactRoles,
  canWrite,
  canCreateContacts,
  canManagePartnerContacts,
}: {
  organizationId: string;
  artist: Artist;
  partners: Partner[];
  businessPartnerRoles: Role[];
  contactRoles: Role[];
  canWrite: boolean;
  canCreateContacts: boolean;
  canManagePartnerContacts: boolean;
}) {
  const router = useRouter();
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [message, setMessage] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [associationMode, setAssociationMode] = useState<'existing' | 'new'>('existing');
  const [representativeModes, setRepresentativeModes] = useState<
    Record<string, 'existing' | 'new'>
  >({});
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [contactFlow, setContactFlow] = useState<InlineContactFlow>();
  const canManage = canWrite && artist.status === 'ACTIVE';
  const directContactIds = new Set(artist.contacts.map(({ contact }) => contact.id));
  const sortedAssociations = [...artist.businessPartners].sort((left, right) => {
    const primaryDifference =
      Number(right.representatives.some(({ isPrimary }) => isPrimary)) -
      Number(left.representatives.some(({ isPrimary }) => isPrimary));
    return (
      primaryDifference ||
      left.businessPartner.companyName.localeCompare(right.businessPartner.companyName, 'de')
    );
  });
  const availablePartners = partners.filter(
    (partner) =>
      partner.status === 'ACTIVE' &&
      !artist.businessPartners.some(({ businessPartner }) => businessPartner.id === partner.id),
  );
  const selectedPartner = availablePartners.find(({ id }) => id === selectedPartnerId);

  async function createAssociation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const businessPartnerId = String(form.get('businessPartnerId') ?? '');
    const roleIds = form.getAll('businessPartnerRoleIds').map(String);
    const contactRoleIds = form.getAll('contactRoleIds').map(String);
    if (!businessPartnerId || !roleIds.length || !contactRoleIds.length) {
      setMessage('Wählen Sie die Agentur/Firma und jeweils mindestens eine Rolle.');
      return;
    }
    if (associationMode === 'new') {
      const draft = contactDraft(form);
      if (!draft.firstName && !draft.lastName) {
        setMessage('Geben Sie für den neuen Ansprechpartner Vor- oder Nachname an.');
        return;
      }
      await checkInlineContact({
        kind: 'association',
        draft,
        businessPartnerId,
        businessPartnerRoleIds: roleIds,
        contactRoleIds,
        isPrimary: form.get('isPrimary') === 'on',
      });
      return;
    }
    const businessPartnerContactId = String(form.get('businessPartnerContactId') ?? '');
    if (!businessPartnerContactId) {
      setMessage('Wählen Sie einen Ansprechpartner dieser Agentur.');
      return;
    }
    setPendingId('new');
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners',
      {
        credentials: 'include',
        params: { path: { organizationId, artistId: artist.id } },
        body: {
          businessPartnerId,
          roleIds,
          representatives: [
            {
              businessPartnerContactId,
              roleIds: contactRoleIds,
              isPrimary: form.get('isPrimary') === 'on',
            },
          ],
        },
      },
    );
    finish(result.data, result.error, 'Die Unternehmensvertretung konnte nicht angelegt werden.');
    if (result.data) setSelectedPartnerId('');
  }

  async function updateAssociationRoles(
    event: FormEvent<HTMLFormElement>,
    association: Association,
  ) {
    event.preventDefault();
    const roleIds = new FormData(event.currentTarget).getAll('roleIds').map(String);
    if (!roleIds.length) {
      setMessage('Mindestens eine Unternehmensrolle ist erforderlich.');
      return;
    }
    setPendingId(association.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.PUT(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}/roles',
      {
        credentials: 'include',
        params: {
          path: { organizationId, artistId: artist.id, associationId: association.id },
        },
        body: { version: association.version, roleIds },
      },
    );
    finish(result.data, result.error, 'Die Unternehmensrollen konnten nicht gespeichert werden.');
  }

  async function unlinkAssociation(association: Association) {
    if (
      !window.confirm(
        'Diese Unternehmensvertretung samt Ansprechpartnern vom Artist lösen? Die Stammdaten bleiben erhalten.',
      )
    ) {
      return;
    }
    setPendingId(association.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.DELETE(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}',
      {
        credentials: 'include',
        params: {
          path: { organizationId, artistId: artist.id, associationId: association.id },
          query: { version: association.version },
        },
      },
    );
    finish(result.data, result.error, 'Die Unternehmensvertretung konnte nicht gelöst werden.');
  }

  async function addRepresentative(event: FormEvent<HTMLFormElement>, association: Association) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const businessPartnerContactId = String(form.get('businessPartnerContactId') ?? '');
    const roleIds = form.getAll('roleIds').map(String);
    if (!businessPartnerContactId || !roleIds.length) {
      setMessage('Wählen Sie einen Ansprechpartner und mindestens eine Kontaktrolle.');
      return;
    }
    setPendingId(`${association.id}:new`);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.POST(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}/contacts',
      {
        credentials: 'include',
        params: {
          path: { organizationId, artistId: artist.id, associationId: association.id },
        },
        body: {
          businessPartnerContactId,
          roleIds,
          isPrimary: form.get('isPrimary') === 'on',
        },
      },
    );
    finish(result.data, result.error, 'Der Ansprechpartner konnte nicht ergänzt werden.');
  }

  async function createRepresentative(event: FormEvent<HTMLFormElement>, association: Association) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft = contactDraft(form);
    const contactRoleIds = form.getAll('roleIds').map(String);
    if ((!draft.firstName && !draft.lastName) || contactRoleIds.length === 0) {
      setMessage('Geben Sie Vor- oder Nachname an und wählen Sie mindestens eine Zuständigkeit.');
      return;
    }
    await checkInlineContact({
      kind: 'representative',
      draft,
      businessPartnerId: association.businessPartner.id,
      associationId: association.id,
      contactRoleIds,
      isPrimary: form.get('isPrimary') === 'on',
    });
  }

  async function checkInlineContact(flow: InlineContactFlow) {
    setPendingId('inline-contact');
    setMessage(undefined);
    setMatches([]);
    setContactFlow(flow);
    const client = createBrowserApiClient();
    const result = await client.POST('/api/v1/organizations/{organizationId}/contacts/matches', {
      credentials: 'include',
      params: { path: { organizationId } },
      body: flow.draft,
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
    const strongDirectConflict = result.data.some(
      ({ contact, strength }) => strength === 'STRONG' && directContactIds.has(contact.id),
    );
    if (strongDirectConflict) {
      setMessage(
        'Der gefundene Kontakt ist bei diesem Artist bereits als direkter Kontakt hinterlegt und kann nicht zusätzlich Firmenvertreter sein.',
      );
      setMatches(result.data);
      setPendingId(undefined);
      return;
    }
    if (result.data.length > 0) {
      setMatches(result.data);
      setPendingId(undefined);
      return;
    }
    await persistInlineContact(flow, false);
  }

  async function persistInlineContact(
    flow: InlineContactFlow,
    allowNameDuplicate: boolean,
    contactId?: string,
  ) {
    if (contactId && directContactIds.has(contactId)) {
      setMessage(
        'Dieser Kontakt ist bei diesem Artist bereits direkt zugeordnet. Lösen Sie diese Zuordnung zuerst.',
      );
      return;
    }
    setPendingId('inline-contact');
    const client = createBrowserApiClient();
    const contactReference = contactId
      ? { contactId }
      : { contact: { ...flow.draft, allowNameDuplicate } };
    const result =
      flow.kind === 'association'
        ? await client.POST(
            '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/inline-contact',
            {
              credentials: 'include',
              params: { path: { organizationId, artistId: artist.id } },
              body: {
                businessPartnerId: flow.businessPartnerId,
                businessPartnerRoleIds: flow.businessPartnerRoleIds ?? [],
                ...contactReference,
                roleIds: flow.contactRoleIds,
                isPrimary: flow.isPrimary,
              },
            },
          )
        : await client.POST(
            '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}/contacts/inline',
            {
              credentials: 'include',
              params: {
                path: {
                  organizationId,
                  artistId: artist.id,
                  associationId: flow.associationId!,
                },
              },
              body: {
                ...contactReference,
                roleIds: flow.contactRoleIds,
                isPrimary: flow.isPrimary,
              },
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
    setContactFlow(undefined);
    setSelectedPartnerId('');
    setEditing(false);
    setPendingId(undefined);
    router.refresh();
  }

  async function updateRepresentative(
    event: FormEvent<HTMLFormElement>,
    association: Association,
    representative: Representative,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roleIds = form.getAll('roleIds').map(String);
    if (!roleIds.length) {
      setMessage('Mindestens eine Kontaktrolle ist erforderlich.');
      return;
    }
    setPendingId(representative.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.PUT(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}/contacts/{representativeId}',
      {
        credentials: 'include',
        params: {
          path: {
            organizationId,
            artistId: artist.id,
            associationId: association.id,
            representativeId: representative.id,
          },
        },
        body: {
          version: representative.version,
          roleIds,
          isPrimary: form.get('isPrimary') === 'on',
        },
      },
    );
    finish(result.data, result.error, 'Der Ansprechpartner konnte nicht gespeichert werden.');
  }

  async function unlinkRepresentative(association: Association, representative: Representative) {
    if (!window.confirm('Diesen Ansprechpartner aus der Unternehmensvertretung lösen?')) return;
    setPendingId(representative.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const result = await client.DELETE(
      '/api/v1/organizations/{organizationId}/artists/{artistId}/business-partners/{associationId}/contacts/{representativeId}',
      {
        credentials: 'include',
        params: {
          path: {
            organizationId,
            artistId: artist.id,
            associationId: association.id,
            representativeId: representative.id,
          },
          query: { version: representative.version },
        },
      },
    );
    finish(result.data, result.error, 'Der Ansprechpartner konnte nicht gelöst werden.');
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
    <section className="panel detail-panel representation-workspace">
      <div className="panel__heading panel__heading--compact">
        <div>
          <h2>Agenturen &amp; Firmenvertretungen</h2>
          <p>Firmen, die den Artist vertreten, einschließlich ihrer zuständigen Ansprechpartner.</p>
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
            {editing ? 'Bearbeitung schließen' : 'Vertretungen bearbeiten'}
          </button>
        ) : null}
      </div>
      <FormMessage message={message} />
      {editing && canManage && availablePartners.length > 0 ? (
        <form
          className="representation-create form-stack"
          onChange={() => setMatches([])}
          onSubmit={createAssociation}
        >
          <h3>Agentur/Firma verknüpfen</h3>
          <label>
            Agentur/Firma auswählen
            <select
              name="businessPartnerId"
              onChange={(event) => setSelectedPartnerId(event.currentTarget.value)}
              required
              value={selectedPartnerId}
            >
              <option value="">Bitte auswählen</option>
              {availablePartners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.companyName}
                </option>
              ))}
            </select>
          </label>
          {selectedPartner ? (
            <>
              <RoleChoices
                legend="Rollen der Agentur/Firma für diesen Artist"
                name="businessPartnerRoleIds"
                roles={businessPartnerRoles}
              />
              <div className="mode-switch" role="group" aria-label="Ansprechpartner auswählen">
                <button
                  aria-pressed={associationMode === 'existing'}
                  className="button button--small button--secondary"
                  onClick={() => {
                    setAssociationMode('existing');
                    setMatches([]);
                  }}
                  type="button"
                >
                  Vorhandenen Firmenkontakt auswählen
                </button>
                {canManagePartnerContacts ? (
                  <button
                    aria-pressed={associationMode === 'new'}
                    className="button button--small button--secondary"
                    onClick={() => {
                      setAssociationMode('new');
                      setMatches([]);
                    }}
                    type="button"
                  >
                    Neuen Ansprechpartner für diese Firma anlegen
                  </button>
                ) : null}
              </div>
              {associationMode === 'existing' ? (
                selectedPartner.contacts.some(
                  ({ contact }) => contact.status === 'ACTIVE' && !directContactIds.has(contact.id),
                ) ? (
                  <label>
                    Ansprechpartner dieser Agentur
                    <select name="businessPartnerContactId" required>
                      <option value="">Bitte auswählen</option>
                      {selectedPartner.contacts
                        .filter(
                          ({ contact }) =>
                            contact.status === 'ACTIVE' && !directContactIds.has(contact.id),
                        )
                        .map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contactName(contact.contact)}
                            {contact.contact.label ? ` · ${contact.contact.label}` : ''}
                            {contact.contact.email
                              ? ` · ${contact.contact.email}`
                              : contact.contact.mobile
                                ? ` · ${contact.contact.mobile}`
                                : contact.contact.phone
                                  ? ` · ${contact.contact.phone}`
                                  : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <p className="muted">Für diese Firma ist noch kein Ansprechpartner hinterlegt.</p>
                )
              ) : canManagePartnerContacts ? (
                <ContactFields />
              ) : null}
              <RoleChoices
                legend="Zuständigkeit für diesen Artist"
                name="contactRoleIds"
                roles={contactRoles}
              />
              <label className="inline-choice">
                <input name="isPrimary" type="checkbox" />
                <span>Hauptansprechpartner</span>
              </label>
              {contactFlow?.kind === 'association' ? (
                <ContactMatches
                  matches={matches}
                  onCreateAnyway={() => persistInlineContact(contactFlow, true)}
                  onReuse={(contactId) => persistInlineContact(contactFlow, false, contactId)}
                  pending={Boolean(pendingId)}
                />
              ) : null}
              <button
                className="button"
                disabled={Boolean(pendingId) || matches.length > 0}
                type="submit"
              >
                {pendingId ? 'Vertretung wird angelegt …' : 'Vertretung verknüpfen'}
              </button>
            </>
          ) : null}
        </form>
      ) : null}
      {editing && canManage && partners.filter(({ status }) => status === 'ACTIVE').length === 0 ? (
        <div className="association-create compact-empty-action">
          <p>Es ist noch keine aktive Agentur oder Firma vorhanden.</p>
          <Link
            className="button button--secondary"
            href={`/o/${organizationId}/business-partners/new?returnTo=${encodeURIComponent(`/o/${organizationId}/artists/${artist.id}`)}`}
          >
            Agentur/Firma anlegen
          </Link>
        </div>
      ) : null}
      {editing &&
      canManage &&
      partners.some(({ status }) => status === 'ACTIVE') &&
      availablePartners.length === 0 ? (
        <p className="empty-state">
          Alle verfügbaren Agenturen und Firmen sind bereits mit diesem Artist verknüpft.
        </p>
      ) : null}
      <div className="representation-list">
        {sortedAssociations.map((association) => {
          const partner = partners.find(({ id }) => id === association.businessPartner.id);
          const availableContacts =
            partner?.contacts.filter(
              ({ id, contact }) =>
                contact.status === 'ACTIVE' &&
                !directContactIds.has(contact.id) &&
                !association.representatives.some(
                  ({ businessPartnerContactId }) => businessPartnerContactId === id,
                ),
            ) ?? [];
          const hasPrimary = association.representatives.some(({ isPrimary }) => isPrimary);
          const editable =
            editing &&
            canWrite &&
            artist.status === 'ACTIVE' &&
            association.businessPartner.status === 'ACTIVE';
          return (
            <article
              className={
                hasPrimary
                  ? 'representation-card representation-card--primary'
                  : 'representation-card'
              }
              key={association.id}
            >
              <header className="representation-card__header">
                <div>
                  <p className="eyebrow">Unternehmen</p>
                  <h3>
                    <Link
                      href={`/o/${organizationId}/business-partners/${association.businessPartner.id}`}
                    >
                      {association.businessPartner.companyName}
                    </Link>
                  </h3>
                  <p>{association.roles.map(({ name }) => name).join(', ')}</p>
                </div>
                <span
                  className={`status-badge status-badge--${association.businessPartner.status.toLowerCase()}`}
                >
                  {association.businessPartner.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                </span>
              </header>
              <CompanyChannels association={association} />
              {editable ? (
                <form
                  className="representation-role-form"
                  onSubmit={(event) => updateAssociationRoles(event, association)}
                >
                  <RoleChoices
                    checkedIds={association.roles.map(({ id }) => id)}
                    legend="Unternehmensrollen beim Artist bearbeiten"
                    name="roleIds"
                    roles={businessPartnerRoles}
                  />
                  <div className="button-row">
                    <button
                      className="button button--small button--secondary"
                      disabled={pendingId === association.id}
                      type="submit"
                    >
                      Unternehmensrollen speichern
                    </button>
                    <button
                      className="text-button text-button--danger"
                      disabled={pendingId === association.id}
                      onClick={() => unlinkAssociation(association)}
                      type="button"
                    >
                      Vertretung lösen
                    </button>
                  </div>
                </form>
              ) : null}
              <div className="representative-list">
                {association.representatives.map((representative) => (
                  <article className="representative-card" key={representative.id}>
                    <header>
                      <div>
                        <h4>
                          <Link href={`/o/${organizationId}/contacts/${representative.contact.id}`}>
                            {contactName(representative.contact)}
                          </Link>
                        </h4>
                        {representative.contact.label ? (
                          <p>{representative.contact.label}</p>
                        ) : null}
                      </div>
                      <div className="heading-badges">
                        {representative.isPrimary ? (
                          <span className="status-badge status-badge--primary">
                            Hauptansprechpartner
                          </span>
                        ) : null}
                        <span
                          className={`status-badge status-badge--${representative.contact.status.toLowerCase()}`}
                        >
                          {representative.contact.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                        </span>
                      </div>
                    </header>
                    <p className="role-summary">
                      {representative.roles.map(({ name }) => name).join(', ')}
                    </p>
                    {directContactIds.has(representative.contact.id) ? (
                      <div className="conflict-warning" role="status">
                        <span className="status-badge status-badge--warning">
                          Zuordnungskonflikt
                        </span>
                        <p>
                          Dieser Kontakt ist zusätzlich direkt mit dem Artist verknüpft. Lösen Sie
                          eine der beiden Zuordnungen manuell.
                        </p>
                      </div>
                    ) : null}
                    <ContactChannels contact={representative.contact} />
                    {editable ? (
                      <form
                        className="representative-edit"
                        onSubmit={(event) =>
                          updateRepresentative(event, association, representative)
                        }
                      >
                        <RoleChoices
                          checkedIds={representative.roles.map(({ id }) => id)}
                          legend={`Kontaktrollen von ${contactName(representative.contact)}`}
                          name="roleIds"
                          roles={contactRoles}
                        />
                        <label className="inline-choice">
                          <input
                            defaultChecked={representative.isPrimary}
                            disabled={!representative.isPrimary && hasPrimary}
                            name="isPrimary"
                            type="checkbox"
                          />
                          <span>Hauptansprechpartner</span>
                        </label>
                        {!representative.isPrimary && hasPrimary ? (
                          <p className="permission-note">
                            Entfernen Sie zuerst die bestehende Hauptkennzeichnung.
                          </p>
                        ) : null}
                        <div className="button-row">
                          <button
                            className="button button--small button--secondary"
                            disabled={pendingId === representative.id}
                            type="submit"
                          >
                            Ansprechpartner speichern
                          </button>
                          {association.representatives.length > 1 ? (
                            <button
                              className="text-button text-button--danger"
                              disabled={pendingId === representative.id}
                              onClick={() => unlinkRepresentative(association, representative)}
                              type="button"
                            >
                              Ansprechpartner lösen
                            </button>
                          ) : null}
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
              {editable ? (
                <div className="representative-add form-stack">
                  <h4>Weiteren Ansprechpartner ergänzen</h4>
                  <div className="mode-switch" role="group" aria-label="Ansprechpartner ergänzen">
                    <button
                      aria-pressed={
                        (representativeModes[association.id] ?? 'existing') === 'existing'
                      }
                      className="button button--small button--secondary"
                      onClick={() => {
                        setRepresentativeModes((current) => ({
                          ...current,
                          [association.id]: 'existing',
                        }));
                        setMatches([]);
                      }}
                      type="button"
                    >
                      Vorhandenen Firmenkontakt auswählen
                    </button>
                    {canManagePartnerContacts && canCreateContacts ? (
                      <button
                        aria-pressed={representativeModes[association.id] === 'new'}
                        className="button button--small button--secondary"
                        onClick={() => {
                          setRepresentativeModes((current) => ({
                            ...current,
                            [association.id]: 'new',
                          }));
                          setMatches([]);
                        }}
                        type="button"
                      >
                        Neuen Ansprechpartner anlegen
                      </button>
                    ) : null}
                  </div>
                  {(representativeModes[association.id] ?? 'existing') === 'existing' ? (
                    availableContacts.length > 0 ? (
                      <form
                        className="form-stack"
                        onSubmit={(event) => addRepresentative(event, association)}
                      >
                        <label>
                          Ansprechpartner dieser Agentur
                          <select name="businessPartnerContactId" required>
                            <option value="">Bitte auswählen</option>
                            {availableContacts.map((contact) => (
                              <option key={contact.id} value={contact.id}>
                                {contactName(contact.contact)}
                                {contact.contact.label ? ` · ${contact.contact.label}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <RepresentativeRoleFields
                          contactRoles={contactRoles}
                          hasPrimary={hasPrimary}
                        />
                        <button
                          className="button button--small"
                          disabled={pendingId === `${association.id}:new`}
                          type="submit"
                        >
                          Ansprechpartner ergänzen
                        </button>
                      </form>
                    ) : (
                      <>
                        <p className="muted">
                          Für diese Firma ist noch kein weiterer Ansprechpartner verfügbar.
                        </p>
                        {partner?.contacts.some(({ contact }) =>
                          directContactIds.has(contact.id),
                        ) ? (
                          <p className="permission-note">
                            Direkte Artistkontakte werden nicht als Firmenvertreter angeboten.
                          </p>
                        ) : null}
                      </>
                    )
                  ) : (
                    <form
                      className="form-stack"
                      onChange={() => setMatches([])}
                      onSubmit={(event) => createRepresentative(event, association)}
                    >
                      <ContactFields />
                      <RepresentativeRoleFields
                        contactRoles={contactRoles}
                        hasPrimary={hasPrimary}
                      />
                      {contactFlow?.kind === 'representative' &&
                      contactFlow.associationId === association.id ? (
                        <ContactMatches
                          matches={matches}
                          onCreateAnyway={() => persistInlineContact(contactFlow, true)}
                          onReuse={(contactId) =>
                            persistInlineContact(contactFlow, false, contactId)
                          }
                          pending={Boolean(pendingId)}
                        />
                      ) : null}
                      <div className="button-row">
                        <button
                          className="button button--small"
                          disabled={pendingId === 'inline-contact' || matches.length > 0}
                          type="submit"
                        >
                          {pendingId === 'inline-contact'
                            ? 'Ansprechpartner wird angelegt …'
                            : 'Ansprechpartner anlegen'}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            setRepresentativeModes((current) => ({
                              ...current,
                              [association.id]: 'existing',
                            }))
                          }
                          type="button"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
        {sortedAssociations.length === 0 ? (
          <p className="empty-state">Keine Agentur oder Firmenvertretung hinterlegt.</p>
        ) : null}
      </div>
    </section>
  );
}

function CompanyChannels({ association }: { association: Association }) {
  const partner = association.businessPartner;
  if (!partner.email && !partner.phone) return null;
  return (
    <dl className="contact-channels contact-channels--company">
      {partner.email ? (
        <div>
          <dt>Unternehmens-E-Mail</dt>
          <dd>
            <a href={`mailto:${partner.email}`}>{partner.email}</a>
          </dd>
        </div>
      ) : null}
      {partner.phone ? (
        <div>
          <dt>Unternehmens-Telefon</dt>
          <dd>
            <a href={`tel:${phoneHref(partner.phone)}`}>{partner.phone}</a>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function RoleChoices({
  roles,
  name,
  legend,
  checkedIds = [],
}: {
  roles: Role[];
  name: string;
  legend: string;
  checkedIds?: string[];
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
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

function RepresentativeRoleFields({
  contactRoles,
  hasPrimary,
}: {
  contactRoles: Role[];
  hasPrimary: boolean;
}) {
  return (
    <>
      <RoleChoices legend="Zuständigkeit für diesen Artist" name="roleIds" roles={contactRoles} />
      <label className="inline-choice">
        <input disabled={hasPrimary} name="isPrimary" type="checkbox" />
        <span>Hauptansprechpartner</span>
      </label>
    </>
  );
}
