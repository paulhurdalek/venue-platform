import type { PermissionKey } from './security.constants.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AccessContext {
  user: AuthenticatedUser;
  membershipId: string;
  organizationId: string;
  membershipVersion: number;
  permissions: PermissionKey[];
  locationScope: 'ALL' | 'SELECTED';
  locationIds: string[];
}

export interface PermissionRequirement {
  permission: PermissionKey;
  locationParameter?: string;
}
