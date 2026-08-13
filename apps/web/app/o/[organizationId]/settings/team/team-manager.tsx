'use client';

import type { components } from '@venue/api-client';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiErrorMessage, createBrowserApiClient } from '../../../../../src/api/browser';
import { FormMessage } from '../../../../components/form-message';

type Invitation = components['schemas']['InvitationDto'];
type Location = components['schemas']['LocationDto'];
type Membership = components['schemas']['MembershipDto'];
type Role = components['schemas']['RoleDto'];

type PermissionFlags = {
  canInvite: boolean;
  canRevoke: boolean;
  canChangeStatus: boolean;
  canAssignRoles: boolean;
  canAssignLocations: boolean;
};

export function InvitationManager({
  organizationId,
  invitations,
  roles,
  locations,
  permissions,
}: {
  organizationId: string;
  invitations: Invitation[];
  roles: Role[];
  locations: Location[];
  permissions: PermissionFlags;
}) {
  const [message, setMessage] = useState<string>();
  const [invitationLink, setInvitationLink] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setInvitationLink(undefined);
    const form = new FormData(event.currentTarget);
    const roleIds = form.getAll('roleIds').map(String);
    const locationScope = form.get('locationScope') === 'SELECTED' ? 'SELECTED' : 'ALL';
    const locationIds = locationScope === 'SELECTED' ? form.getAll('locationIds').map(String) : [];
    if (roleIds.length === 0 || (locationScope === 'SELECTED' && locationIds.length === 0)) {
      setMessage('Wählen Sie mindestens eine Rolle und bei ausgewähltem Zugriff eine Location.');
      setPending(false);
      return;
    }
    const client = createBrowserApiClient();
    const { data, error } = await client.POST(
      '/api/v1/organizations/{organizationId}/invitations',
      {
        credentials: 'include',
        params: { path: { organizationId } },
        body: {
          email: String(form.get('email') ?? '')
            .trim()
            .toLowerCase(),
          roleIds,
          locationScope,
          locationIds,
        },
      },
    );
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Einladung konnte nicht erstellt werden.'));
      setPending(false);
      return;
    }
    setInvitationLink(data.invitationLink);
    setMessage('Die Einladung wurde erstellt. Der Link wird nur jetzt vollständig angezeigt.');
    setPending(false);
  }

  async function revoke(invitationId: string) {
    setPending(true);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const { data, error } = await client.DELETE(
      '/api/v1/organizations/{organizationId}/invitations/{invitationId}',
      {
        credentials: 'include',
        params: { path: { organizationId, invitationId } },
      },
    );
    if (!data || error) {
      setMessage(apiErrorMessage(error, 'Die Einladung konnte nicht widerrufen werden.'));
      setPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <h2>Einladungen</h2>
          <p>Links werden manuell übertragen; es wird keine E-Mail versendet.</p>
        </div>
      </div>
      {permissions.canInvite ? (
        <form className="form-stack invitation-form" onSubmit={submit}>
          <label>
            E-Mail-Adresse
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <fieldset>
            <legend>Rollen</legend>
            <div className="choice-grid">
              {roles.map((role) => (
                <label className="choice" key={role.id}>
                  <input name="roleIds" type="checkbox" value={role.id} />
                  <span>
                    <strong>{role.name}</strong>
                    <small>{role.permissions.map((item) => item.description).join(', ')}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Location-Zugriff</legend>
            <label className="inline-choice">
              <input defaultChecked name="locationScope" type="radio" value="ALL" /> Alle Locations
            </label>
            <label className="inline-choice">
              <input name="locationScope" type="radio" value="SELECTED" /> Ausgewählte Locations
            </label>
            <div className="choice-grid choice-grid--locations">
              {locations.map((location) => (
                <label className="choice" key={location.id}>
                  <input name="locationIds" type="checkbox" value={location.id} />
                  <span>
                    <strong>{location.name}</strong>
                    <small>{location.timezone}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormMessage message={message} />
          {invitationLink ? (
            <div className="copy-box">
              <label htmlFor="invitation-link">Einladungslink</label>
              <div>
                <input id="invitation-link" readOnly value={invitationLink} />
                <button
                  className="button button--secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invitationLink);
                    setMessage('Der Einladungslink wurde kopiert.');
                  }}
                  type="button"
                >
                  Link kopieren
                </button>
              </div>
            </div>
          ) : null}
          <button className="button" disabled={pending} type="submit">
            {pending ? 'Einladung wird erstellt …' : 'Einladungslink erstellen'}
          </button>
        </form>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Rollen</th>
              <th>Status</th>
              <th>Gültig bis</th>
              <th>
                <span className="visually-hidden">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>{invitation.email}</td>
                <td>{invitation.roles.map((role) => role.name).join(', ')}</td>
                <td>
                  <span className="status-badge">{invitationStatus(invitation.status)}</span>
                </td>
                <td>{new Date(invitation.expiresAt).toLocaleString('de-DE')}</td>
                <td>
                  {permissions.canRevoke && invitation.status === 'PENDING' ? (
                    <button
                      className="text-button text-button--danger"
                      disabled={pending}
                      onClick={() => revoke(invitation.id)}
                      type="button"
                    >
                      Widerrufen
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={5}>Noch keine Einladungen.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MemberManager({
  organizationId,
  members,
  roles,
  locations,
  permissions,
}: {
  organizationId: string;
  members: Membership[];
  roles: Role[];
  locations: Location[];
  permissions: PermissionFlags;
}) {
  const [message, setMessage] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();

  async function changeStatus(member: Membership) {
    setPendingId(member.id);
    setMessage(undefined);
    const client = createBrowserApiClient();
    const { data, error } = await client.PATCH(
      '/api/v1/organizations/{organizationId}/members/{membershipId}/status',
      {
        credentials: 'include',
        params: { path: { organizationId, membershipId: member.id } },
        body: {
          status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
          version: member.version,
        },
      },
    );
    finishMutation(data, error, 'Der Mitgliedsstatus konnte nicht geändert werden.');
  }

  async function assignRoles(event: FormEvent<HTMLFormElement>, member: Membership) {
    event.preventDefault();
    setPendingId(member.id);
    setMessage(undefined);
    const roleIds = new FormData(event.currentTarget).getAll('roleIds').map(String);
    if (roleIds.length === 0) {
      setMessage('Eine Mitgliedschaft benötigt mindestens eine Rolle.');
      setPendingId(undefined);
      return;
    }
    const client = createBrowserApiClient();
    const { data, error } = await client.PUT(
      '/api/v1/organizations/{organizationId}/members/{membershipId}/roles',
      {
        credentials: 'include',
        params: { path: { organizationId, membershipId: member.id } },
        body: { roleIds, version: member.version },
      },
    );
    finishMutation(data, error, 'Die Rollen konnten nicht gespeichert werden.');
  }

  async function assignLocations(event: FormEvent<HTMLFormElement>, member: Membership) {
    event.preventDefault();
    setPendingId(member.id);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const scope = form.get('scope') === 'SELECTED' ? 'SELECTED' : 'ALL';
    const locationIds = scope === 'SELECTED' ? form.getAll('locationIds').map(String) : [];
    if (scope === 'SELECTED' && locationIds.length === 0) {
      setMessage('Wählen Sie für den eingeschränkten Zugriff mindestens eine Location.');
      setPendingId(undefined);
      return;
    }
    const client = createBrowserApiClient();
    const { data, error } = await client.PUT(
      '/api/v1/organizations/{organizationId}/members/{membershipId}/location-scope',
      {
        credentials: 'include',
        params: { path: { organizationId, membershipId: member.id } },
        body: { scope, locationIds, version: member.version },
      },
    );
    finishMutation(data, error, 'Der Location-Zugriff konnte nicht gespeichert werden.');
  }

  function finishMutation(data: unknown, error: unknown, fallback: string) {
    if (!data || error) {
      setMessage(apiErrorMessage(error, fallback));
      setPendingId(undefined);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <h2>Mitglieder</h2>
          <p>Rollen und Location-Zugriff gelten nur innerhalb dieser Organisation.</p>
        </div>
      </div>
      <FormMessage message={message} />
      <div className="member-list">
        {members.map((member) => (
          <article className="member-card" key={member.id}>
            <header>
              <div>
                <h3>{member.name}</h3>
                <p>{member.email}</p>
              </div>
              <span className={`status-badge status-badge--${member.status.toLowerCase()}`}>
                {member.status === 'ACTIVE' ? 'Aktiv' : 'Gesperrt'}
              </span>
            </header>
            <div className="member-card__columns">
              <form onSubmit={(event) => assignRoles(event, member)}>
                <fieldset disabled={!permissions.canAssignRoles || pendingId === member.id}>
                  <legend>Rollen</legend>
                  {roles.map((role) => (
                    <label className="inline-choice" key={role.id}>
                      <input
                        defaultChecked={member.roles.some((item) => item.id === role.id)}
                        name="roleIds"
                        type="checkbox"
                        value={role.id}
                      />{' '}
                      {role.name}
                    </label>
                  ))}
                </fieldset>
                {permissions.canAssignRoles ? (
                  <button className="button button--small button--secondary" type="submit">
                    Rollen speichern
                  </button>
                ) : null}
              </form>
              <form onSubmit={(event) => assignLocations(event, member)}>
                <fieldset disabled={!permissions.canAssignLocations || pendingId === member.id}>
                  <legend>Location-Zugriff</legend>
                  <label className="inline-choice">
                    <input
                      defaultChecked={member.locationScope === 'ALL'}
                      name="scope"
                      type="radio"
                      value="ALL"
                    />{' '}
                    Alle Locations
                  </label>
                  <label className="inline-choice">
                    <input
                      defaultChecked={member.locationScope === 'SELECTED'}
                      name="scope"
                      type="radio"
                      value="SELECTED"
                    />{' '}
                    Ausgewählt
                  </label>
                  {locations.map((location) => (
                    <label className="inline-choice inline-choice--nested" key={location.id}>
                      <input
                        defaultChecked={member.locationIds.includes(location.id)}
                        name="locationIds"
                        type="checkbox"
                        value={location.id}
                      />{' '}
                      {location.name}
                    </label>
                  ))}
                </fieldset>
                {permissions.canAssignLocations ? (
                  <button className="button button--small button--secondary" type="submit">
                    Zugriff speichern
                  </button>
                ) : null}
              </form>
            </div>
            {permissions.canChangeStatus ? (
              <footer>
                <button
                  className="text-button text-button--danger"
                  disabled={pendingId === member.id}
                  onClick={() => changeStatus(member)}
                  type="button"
                >
                  {member.status === 'ACTIVE'
                    ? 'Mitgliedschaft sperren'
                    : 'Mitgliedschaft reaktivieren'}
                </button>
              </footer>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function invitationStatus(status: string) {
  return (
    (
      {
        PENDING: 'Offen',
        ACCEPTED: 'Angenommen',
        REVOKED: 'Widerrufen',
        EXPIRED: 'Abgelaufen',
      } as Record<string, string>
    )[status] ?? status
  );
}
