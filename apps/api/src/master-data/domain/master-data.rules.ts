export function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function artistHasIdentity(input: {
  stageName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return hasText(input.stageName) || hasText(input.firstName) || hasText(input.lastName);
}

export function contactHasName(input: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return hasText(input.firstName) || hasText(input.lastName);
}

export function contactIsIncomplete(input: {
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
}): boolean {
  return !hasText(input.email) && !hasText(input.phone) && !hasText(input.mobile);
}

export function artistIsIncomplete(
  input: {
    email?: string | null;
    phone?: string | null;
    instagram?: string | null;
  },
  linkedContacts: ReadonlyArray<{
    status: 'ACTIVE' | 'ARCHIVED';
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
  }>,
): boolean {
  const direct = hasText(input.email) || hasText(input.phone) || hasText(input.instagram);
  const reachableContact = linkedContacts.some(
    (contact) => contact.status === 'ACTIVE' && !contactIsIncomplete(contact),
  );
  return !direct && !reachableContact;
}

export function trimNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
