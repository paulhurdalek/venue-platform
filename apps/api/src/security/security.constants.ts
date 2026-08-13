export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_EDIT: 'organization.edit',
  LOCATION_READ: 'location.read',
  LOCATION_EDIT: 'location.edit',
  MEMBERSHIPS_READ: 'memberships.read',
  INVITATIONS_CREATE: 'invitations.create',
  INVITATIONS_REVOKE: 'invitations.revoke',
  MEMBERSHIPS_STATUS: 'memberships.status',
  MEMBERSHIPS_ROLES: 'memberships.roles',
  MEMBERSHIPS_LOCATION_ACCESS: 'memberships.location_access',
  ROLES_READ: 'roles.read',
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{
  key: PermissionKey;
  description: string;
}> = [
  { key: PERMISSIONS.ORGANIZATION_READ, description: 'Organisation ansehen' },
  { key: PERMISSIONS.ORGANIZATION_EDIT, description: 'Organisation bearbeiten' },
  { key: PERMISSIONS.LOCATION_READ, description: 'Location ansehen' },
  { key: PERMISSIONS.LOCATION_EDIT, description: 'Location bearbeiten' },
  { key: PERMISSIONS.MEMBERSHIPS_READ, description: 'Mitgliedschaften ansehen' },
  { key: PERMISSIONS.INVITATIONS_CREATE, description: 'Benutzer einladen' },
  { key: PERMISSIONS.INVITATIONS_REVOKE, description: 'Einladungen widerrufen' },
  {
    key: PERMISSIONS.MEMBERSHIPS_STATUS,
    description: 'Mitgliedschaften sperren oder reaktivieren',
  },
  { key: PERMISSIONS.MEMBERSHIPS_ROLES, description: 'Rollen zuweisen' },
  {
    key: PERMISSIONS.MEMBERSHIPS_LOCATION_ACCESS,
    description: 'Location-Zugriff verwalten',
  },
  { key: PERMISSIONS.ROLES_READ, description: 'Rollen ansehen' },
  { key: PERMISSIONS.AUDIT_READ, description: 'Audit-Protokoll ansehen' },
];

export const STANDARD_ROLES = [
  { key: 'administrator', name: 'Administrator', allPermissions: true },
  { key: 'management_finance', name: 'Management & Finanzen', allPermissions: false },
  { key: 'booking', name: 'Booking', allPermissions: false },
  { key: 'production', name: 'Produktion', allPermissions: false },
  { key: 'read_only', name: 'Lesend', allPermissions: false },
] as const;

export const READ_ONLY_PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.ORGANIZATION_READ,
  PERMISSIONS.LOCATION_READ,
];
