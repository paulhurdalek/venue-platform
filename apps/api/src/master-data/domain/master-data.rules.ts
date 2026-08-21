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

export function hasUniqueRepresentativeContacts(
  representatives: ReadonlyArray<{ businessPartnerContactId: string }>,
): boolean {
  const ids = representatives.map(({ businessPartnerContactId }) => businessPartnerContactId);
  return new Set(ids).size === ids.length;
}

export function hasAtMostOnePrimaryRepresentative(
  representatives: ReadonlyArray<{ isPrimary: boolean }>,
): boolean {
  return representatives.filter(({ isPrimary }) => isPrimary).length <= 1;
}

export function trimNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeContactEmail(value: string | null | undefined): string | null {
  return trimNullable(value)?.toLocaleLowerCase('de-DE') ?? null;
}

export function normalizeContactPhone(value: string | null | undefined): string | null {
  const trimmed = trimNullable(value);
  if (!trimmed) return null;
  const international = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
  const digits = international.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function normalizeContactName(value: string | null | undefined): string | null {
  const trimmed = trimNullable(value);
  return trimmed?.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') ?? null;
}

export function contactMatchReasons(
  candidate: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
  },
  input: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
  },
): Array<'EMAIL' | 'PHONE' | 'NAME'> {
  const reasons: Array<'EMAIL' | 'PHONE' | 'NAME'> = [];
  const inputEmail = normalizeContactEmail(input.email);
  if (inputEmail && inputEmail === normalizeContactEmail(candidate.email)) reasons.push('EMAIL');

  const inputPhones = new Set(
    [normalizeContactPhone(input.phone), normalizeContactPhone(input.mobile)].filter(Boolean),
  );
  const candidatePhones = [
    normalizeContactPhone(candidate.phone),
    normalizeContactPhone(candidate.mobile),
  ].filter(Boolean);
  if (candidatePhones.some((phone) => inputPhones.has(phone))) reasons.push('PHONE');

  const firstName = normalizeContactName(input.firstName);
  const lastName = normalizeContactName(input.lastName);
  if (
    firstName &&
    lastName &&
    firstName === normalizeContactName(candidate.firstName) &&
    lastName === normalizeContactName(candidate.lastName)
  ) {
    reasons.push('NAME');
  }
  return reasons;
}
