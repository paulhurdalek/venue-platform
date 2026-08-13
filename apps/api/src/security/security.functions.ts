import { createHash, randomBytes } from 'node:crypto';

import type { PermissionKey } from './security.constants.js';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function evaluatePermissions(
  assignedPermissions: Iterable<string>,
  requiredPermission: PermissionKey,
): boolean {
  return new Set(assignedPermissions).has(requiredPermission);
}

export function hasLocationAccess(
  scope: 'ALL' | 'SELECTED',
  selectedLocationIds: Iterable<string>,
  locationId: string,
): boolean {
  return scope === 'ALL' || new Set(selectedLocationIds).has(locationId);
}

export function isActiveMembership(status: 'ACTIVE' | 'SUSPENDED'): boolean {
  return status === 'ACTIVE';
}

export function invitationState(
  invitation: {
    status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
    expiresAt: Date;
  },
  now = new Date(),
): 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' {
  if (invitation.status !== 'PENDING') return invitation.status;
  return invitation.expiresAt <= now ? 'EXPIRED' : 'PENDING';
}

export function assertVersionUpdated(updatedRows: number): void {
  if (updatedRows !== 1) {
    const error = new Error('VERSION_CONFLICT');
    error.name = 'VersionConflictError';
    throw error;
  }
}

export function bootstrapAllowed(activeAdministratorCount: number): boolean {
  return activeAdministratorCount === 0;
}

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
