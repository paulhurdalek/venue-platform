import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import { InvitationManager, MemberManager } from './team-manager';

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/o/${organizationId}/settings/team`;
  const membership = await activePageMembership(organizationId, returnPath);
  if (!membership) return null;
  if (!hasPermission(membership, 'memberships.read')) {
    return (
      <section className="state-card">
        <p className="eyebrow">Nicht berechtigt</p>
        <h1>Sie dürfen die Teamverwaltung nicht öffnen.</h1>
        <p>Ihre aktive Mitgliedschaft besitzt die erforderliche Berechtigung nicht.</p>
      </section>
    );
  }

  const client = await serverApiClient();
  const canReadRoles = hasPermission(membership, 'roles.read');
  const canReadAudit = hasPermission(membership, 'audit.read');
  const [membersResult, invitationsResult, locationsResult, rolesResult, auditResult] =
    await Promise.all([
      client.GET('/api/v1/organizations/{organizationId}/members', {
        params: { path: { organizationId } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/invitations', {
        params: { path: { organizationId } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/locations', {
        params: { path: { organizationId } },
      }),
      canReadRoles
        ? client.GET('/api/v1/organizations/{organizationId}/roles', {
            params: { path: { organizationId } },
          })
        : undefined,
      canReadAudit
        ? client.GET('/api/v1/organizations/{organizationId}/audit', {
            params: { path: { organizationId }, query: { limit: 30 } },
          })
        : undefined,
    ]);

  const members = unwrap(membersResult);
  const invitations = unwrap(invitationsResult);
  const locations = unwrap(locationsResult);
  const roles = rolesResult ? unwrap(rolesResult) : [];
  const auditEntries = auditResult ? unwrap(auditResult) : [];
  const permissions = {
    canInvite: hasPermission(membership, 'invitations.create'),
    canRevoke: hasPermission(membership, 'invitations.revoke'),
    canChangeStatus: hasPermission(membership, 'memberships.status'),
    canAssignRoles: hasPermission(membership, 'memberships.roles'),
    canAssignLocations: hasPermission(membership, 'memberships.location_access'),
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Einstellungen</p>
          <h1>Team und Zugriffe</h1>
          <p>Mitgliedschaften, Einladungen, Rollen und Location-Geltungsbereiche.</p>
        </div>
      </header>
      <MemberManager
        locations={locations}
        members={members}
        organizationId={organizationId}
        permissions={permissions}
        roles={roles}
      />
      <InvitationManager
        invitations={invitations}
        locations={locations}
        organizationId={organizationId}
        permissions={permissions}
        roles={roles}
      />
      {canReadAudit ? (
        <section className="panel">
          <div className="panel__heading">
            <div>
              <h2>Audit-Protokoll</h2>
              <p>Die letzten sicherheitsrelevanten Änderungen dieser Organisation.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Aktion</th>
                  <th>Akteur</th>
                  <th>Ziel</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString('de-DE')}</td>
                    <td>
                      <code>{entry.action}</code>
                    </td>
                    <td>{entry.actorName ?? 'System'}</td>
                    <td>{entry.targetType}</td>
                  </tr>
                ))}
                {auditEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Noch keine Audit-Einträge.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
