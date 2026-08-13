import 'server-only';

import { redirect } from 'next/navigation';

import { ApiResponseError, getSessionContext, type Membership } from './server';

export async function activePageMembership(
  organizationId: string,
  returnPath: string,
): Promise<Membership | undefined> {
  try {
    const context = await getSessionContext();
    return context.memberships.find(
      (membership) =>
        membership.organizationId === organizationId && membership.status === 'ACTIVE',
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 401) {
      redirect(`/sign-in?next=${encodeURIComponent(returnPath)}`);
    }
    throw error;
  }
}
