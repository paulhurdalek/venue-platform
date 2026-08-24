import { describe, expect, it } from 'vitest';

import {
  formatMinorAmount,
  majorAmountToMinor,
  minorAmountToInput,
  prefillArtistContacts,
} from './booking-utils';

describe('booking money', () => {
  it.each([
    ['200', '20000'],
    ['200,00', '20000'],
    ['200.00', '20000'],
    ['100,00', '10000'],
    ['0,01', '1'],
    ['999999999999999999,99', '99999999999999999999'],
  ])('converts %s EUR exactly to minor units', (input, expected) => {
    expect(majorAmountToMinor(input, 'EUR')).toBe(expected);
  });

  it('keeps no fee valid and round-trips formatted values', () => {
    expect(majorAmountToMinor('', 'EUR')).toBeNull();
    expect(minorAmountToInput(null, 'EUR')).toBe('');
    expect(minorAmountToInput('20000', 'EUR')).toBe('200,00');
    expect(formatMinorAmount('20000', 'EUR')).toBe('200,00\u00a0€');
    expect(formatMinorAmount('2500', 'EUR')).toBe('25,00\u00a0€');
  });

  it('rejects ambiguous or over-precise values instead of rounding', () => {
    expect(() => majorAmountToMinor('12,345', 'EUR')).toThrow(/höchstens 2/);
    expect(() => majorAmountToMinor('1.234,56', 'EUR')).toThrow(/gültigen/);
  });
});

describe('artist contact prefill', () => {
  const contact = (id: string, isPrimary = false, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') => ({
    id: `representative-${id}`,
    version: 1,
    businessPartnerContactId: `link-${id}`,
    isPrimary,
    contact: {
      id,
      firstName: 'Ada',
      lastName: id,
      label: null,
      email: null,
      phone: null,
      mobile: null,
      status,
      incomplete: false,
    },
    roles: [],
  });
  const association = (id: string, role: string, representatives = [contact(`contact-${id}`)]) => ({
    id: `association-${id}`,
    version: 1,
    businessPartner: {
      id,
      companyName: id,
      email: null,
      phone: null,
      status: 'ACTIVE' as const,
    },
    roles: [],
    representatives: representatives.map((representative) => ({
      ...representative,
      roles: [{ id: `role-${role}`, key: role, name: role }],
    })),
  });
  const artist = (businessPartners: ReturnType<typeof association>[]) =>
    ({ businessPartners, contacts: [] }) as never;

  it('prefers Booking over Management and Agentur', () => {
    expect(
      prefillArtistContacts(
        artist([
          association('agency', 'agency'),
          association('management', 'management'),
          association('booking', 'booking'),
        ]),
      ),
    ).toMatchObject({
      businessPartnerId: 'booking',
      contactId: 'contact-booking',
      automatic: true,
    });
  });

  it('uses the primary contact and leaves ambiguous choices open', () => {
    expect(
      prefillArtistContacts(
        artist([association('booking', 'booking', [contact('one'), contact('primary', true)])]),
      ).contactId,
    ).toBe('primary');
    expect(
      prefillArtistContacts(
        artist([association('booking', 'booking'), association('booking-2', 'booking')]),
      ),
    ).toEqual({ businessPartnerId: '', contactId: '', automatic: false });
    expect(
      prefillArtistContacts(
        artist([association('booking', 'booking', [contact('one'), contact('two')])]),
      ),
    ).toMatchObject({ businessPartnerId: 'booking', contactId: '', automatic: true });
  });

  it('does not prioritize an archived representative for a new Booking', () => {
    const archivedBooking = association('archived-booking', 'booking', [
      contact('contact-archived-booking', false, 'ARCHIVED'),
    ]);
    expect(
      prefillArtistContacts(
        artist([archivedBooking, association('active-management', 'management')]),
      ),
    ).toMatchObject({
      businessPartnerId: 'active-management',
      contactId: 'contact-active-management',
      automatic: true,
    });
  });
});
