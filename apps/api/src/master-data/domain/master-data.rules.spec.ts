import { describe, expect, it } from 'vitest';

import {
  artistHasIdentity,
  artistIsIncomplete,
  contactHasName,
  contactIsIncomplete,
  contactMatchReasons,
  hasAtMostOnePrimaryRepresentative,
  hasUniqueRepresentativeContacts,
} from './master-data.rules.js';

describe('Phase 3 master-data rules', () => {
  it('accepts an artist with only a stage name', () => {
    expect(artistHasIdentity({ stageName: 'Nordlicht' })).toBe(true);
    expect(artistHasIdentity({ stageName: ' ', firstName: null, lastName: null })).toBe(false);
  });

  it('requires at least one contact name', () => {
    expect(contactHasName({ firstName: 'Mira' })).toBe(true);
    expect(contactHasName({ firstName: null, lastName: ' ' })).toBe(false);
  });

  it('derives contact completeness from communication fields', () => {
    expect(contactIsIncomplete({ email: null, phone: null, mobile: null })).toBe(true);
    expect(contactIsIncomplete({ email: 'contact@example.test' })).toBe(false);
  });

  it('derives artist completeness from direct or active linked contacts', () => {
    expect(artistIsIncomplete({}, [])).toBe(true);
    expect(artistIsIncomplete({ instagram: '@stage' }, [])).toBe(false);
    expect(artistIsIncomplete({}, [{ status: 'ACTIVE', email: 'contact@example.test' }])).toBe(
      false,
    );
    expect(artistIsIncomplete({}, [{ status: 'ARCHIVED', email: 'contact@example.test' }])).toBe(
      true,
    );
  });

  it('requires unique source contacts within one company representation', () => {
    expect(
      hasUniqueRepresentativeContacts([
        { businessPartnerContactId: 'first' },
        { businessPartnerContactId: 'second' },
      ]),
    ).toBe(true);
    expect(
      hasUniqueRepresentativeContacts([
        { businessPartnerContactId: 'same' },
        { businessPartnerContactId: 'same' },
      ]),
    ).toBe(false);
  });

  it('allows at most one primary representative per company', () => {
    expect(hasAtMostOnePrimaryRepresentative([{ isPrimary: true }, { isPrimary: false }])).toBe(
      true,
    );
    expect(hasAtMostOnePrimaryRepresentative([{ isPrimary: true }, { isPrimary: true }])).toBe(
      false,
    );
  });

  it('matches normalized e-mail addresses and phone numbers across phone fields', () => {
    expect(
      contactMatchReasons(
        { email: 'booking@example.test', mobile: '+49 (170) 123-45' },
        { email: ' BOOKING@EXAMPLE.TEST ', phone: '0049 170 12345' },
      ),
    ).toEqual(['EMAIL', 'PHONE']);
  });

  it('treats equal complete names as a weak match but not partial names', () => {
    expect(
      contactMatchReasons(
        { firstName: ' Anna ', lastName: 'von  Berg' },
        { firstName: 'anna', lastName: 'VON BERG' },
      ),
    ).toEqual(['NAME']);
    expect(contactMatchReasons({ firstName: 'Anna' }, { firstName: 'anna' })).toEqual([]);
  });
});
