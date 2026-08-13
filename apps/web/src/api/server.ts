import 'server-only';

import { createVenueApiClient, type components } from '@venue/api-client';
import { headers } from 'next/headers';

import { webEnvironment } from '../config';

export type SessionContext = components['schemas']['SessionContextDto'];
export type Organization = components['schemas']['OrganizationDto'];
export type Location = components['schemas']['LocationDto'];
export type Membership = components['schemas']['MembershipDto'];
export type Role = components['schemas']['RoleDto'];
export type Invitation = components['schemas']['InvitationDto'];

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

export async function serverApiClient() {
  const cookie = (await headers()).get('cookie');
  return createVenueApiClient({
    baseUrl: webEnvironment.API_BASE_URL,
    fetch: async (input, init) => {
      const forwardedHeaders = new Headers(init?.headers);
      if (cookie) forwardedHeaders.set('cookie', cookie);
      return fetch(input, { ...init, headers: forwardedHeaders, cache: 'no-store' });
    },
  });
}

export async function getSessionContext(): Promise<SessionContext> {
  const client = await serverApiClient();
  const result = await client.GET('/api/v1/session');
  return unwrap(result);
}

export function activeMembership(context: SessionContext, organizationId: string) {
  return context.memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status === 'ACTIVE',
  );
}

export function hasPermission(membership: Membership, permission: string): boolean {
  return membership.roles.some((role) =>
    role.permissions.some((assigned) => assigned.key === permission),
  );
}

export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const error = result.error;
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'REQUEST_FAILED';
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Die Anfrage konnte nicht verarbeitet werden.';
  throw new ApiResponseError(result.response.status, code, message);
}
