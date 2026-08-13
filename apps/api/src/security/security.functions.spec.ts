import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from './security.constants.js';
import {
  assertVersionUpdated,
  bootstrapAllowed,
  evaluatePermissions,
  generateOpaqueToken,
  hashToken,
  hasLocationAccess,
  invitationState,
  isActiveMembership,
} from './security.functions.js';

describe('phase 1 security rules', () => {
  it('evaluates concrete permissions instead of role names', () => {
    expect(
      evaluatePermissions([PERMISSIONS.ORGANIZATION_READ], PERMISSIONS.ORGANIZATION_READ),
    ).toBe(true);
    expect(evaluatePermissions([], PERMISSIONS.ORGANIZATION_EDIT)).toBe(false);
  });

  it('distinguishes all locations from an explicit selected scope', () => {
    expect(hasLocationAccess('ALL', [], 'location-a')).toBe(true);
    expect(hasLocationAccess('SELECTED', ['location-a'], 'location-a')).toBe(true);
    expect(hasLocationAccess('SELECTED', [], 'location-a')).toBe(false);
  });

  it('denies a suspended membership immediately', () => {
    expect(isActiveMembership('ACTIVE')).toBe(true);
    expect(isActiveMembership('SUSPENDED')).toBe(false);
  });

  it('rejects expired, revoked and consumed invitations', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    expect(
      invitationState({ status: 'PENDING', expiresAt: new Date('2026-08-13T11:59:59Z') }, now),
    ).toBe('EXPIRED');
    expect(
      invitationState({ status: 'REVOKED', expiresAt: new Date('2026-08-14T00:00:00Z') }, now),
    ).toBe('REVOKED');
    expect(
      invitationState({ status: 'ACCEPTED', expiresAt: new Date('2026-08-14T00:00:00Z') }, now),
    ).toBe('ACCEPTED');
  });

  it('hashes random tokens deterministically without storing the raw value', () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();
    expect(first).not.toBe(second);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).toBe(hashToken(first));
    expect(hashToken(first)).not.toContain(first);
  });

  it('detects optimistic concurrency conflicts', () => {
    expect(() => assertVersionUpdated(1)).not.toThrow();
    expect(() => assertVersionUpdated(0)).toThrowError('VERSION_CONFLICT');
  });

  it('allows bootstrap only before an active administrator exists', () => {
    expect(bootstrapAllowed(0)).toBe(true);
    expect(bootstrapAllowed(1)).toBe(false);
  });
});
