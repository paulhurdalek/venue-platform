import type { components } from '@venue/api-client';

type Artist = components['schemas']['ArtistDto'];
type ArtistBusinessPartner = components['schemas']['ArtistBusinessPartnerAssociationDto'];

export type ArtistPrefill = {
  businessPartnerId: string;
  contactId: string;
  automatic: boolean;
};

export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function majorAmountToMinor(value: string, currency: string): string | null {
  const normalized = value.trim().replace(/\s/g, '');
  if (!normalized) return null;
  if (!/^\d+(?:[,.]\d+)?$/.test(normalized)) {
    throw new Error('Bitte einen gültigen nichtnegativen Geldbetrag eingeben.');
  }
  const fractionDigits = currencyFractionDigits(currency);
  const [whole, fraction = ''] = normalized.replace(',', '.').split('.');
  if (fraction.length > fractionDigits && /[^0]/.test(fraction.slice(fractionDigits))) {
    throw new Error(
      `Für ${currency.toUpperCase()} sind höchstens ${fractionDigits} Nachkommastellen erlaubt.`,
    );
  }
  const scale = 10n ** BigInt(fractionDigits);
  const paddedFraction = fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  return (BigInt(whole!) * scale + BigInt(paddedFraction || '0')).toString();
}

export function minorAmountToInput(value: string | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === '') return '';
  const fractionDigits = currencyFractionDigits(currency);
  if (fractionDigits === 0) return BigInt(value).toString();
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(value);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(fractionDigits, '0');
  return `${whole.toString()},${fraction}`;
}

export function formatMinorAmount(
  value: string | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (value === null || value === undefined || !currency) return null;
  const normalizedCurrency = currency.toUpperCase();
  const fractionDigits = currencyFractionDigits(normalizedCurrency);
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(value);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(fractionDigits, '0');
  const formatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter
    .formatToParts(whole)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}

export function artistDisplayLabel(artist: Pick<Artist, 'stageName' | 'firstName' | 'lastName'>) {
  const personName = [artist.firstName, artist.lastName].filter(Boolean).join(' ');
  if (artist.stageName && personName) return `${artist.stageName} · ${personName}`;
  return artist.stageName ?? (personName || 'Unbenannter Artist');
}

export function prefillArtistContacts(artist: Artist): ArtistPrefill {
  const active = artist.businessPartners.filter(
    ({ businessPartner }) => businessPartner.status === 'ACTIVE',
  );
  const ranked = [
    samePriority(active, 'booking'),
    samePriority(active, 'management'),
    samePriority(active, 'agency'),
  ].find((matches) => matches.length > 0);
  if (!ranked || ranked.length !== 1) {
    return { businessPartnerId: '', contactId: '', automatic: false };
  }
  const association = ranked[0]!;
  const representatives = association.representatives.filter(
    ({ contact }) => contact.status === 'ACTIVE',
  );
  const primary = representatives.find(({ isPrimary }) => isPrimary);
  const contact = primary ?? (representatives.length === 1 ? representatives[0] : undefined);
  return {
    businessPartnerId: association.businessPartner.id,
    contactId: contact?.contact.id ?? '',
    automatic: true,
  };
}

function samePriority(associations: ArtistBusinessPartner[], key: string) {
  return associations.filter(
    (association) =>
      association.roles.some((role) => role.key === key) ||
      association.representatives.some(
        (representative) =>
          representative.contact.status === 'ACTIVE' &&
          representative.roles.some((role) => role.key === key),
      ),
  );
}
