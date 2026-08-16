import { describe, expect, it } from 'vitest';

import {
  artistHasIdentity,
  artistIsIncomplete,
  contactHasName,
  contactIsIncomplete,
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
});
