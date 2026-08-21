import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '../../security/access.types.js';
import type { ArtistRecord, ContactRecord } from './master-data.models.js';
import type { MasterDataRepository } from './master-data.repository.js';
import { MasterDataService } from './master-data.service.js';

const role = { id: '10000000-0000-4000-8000-000000000001', key: 'booking', name: 'Booking' };
const access: AccessContext = {
  user: { id: '20000000-0000-4000-8000-000000000001', name: 'Test', email: 'test@example.test' },
  membershipId: '30000000-0000-4000-8000-000000000001',
  organizationId: '40000000-0000-4000-8000-000000000001',
  membershipVersion: 1,
  permissions: ['artists.write', 'contacts.write', 'business_partners.write'],
  locationScope: 'ALL',
  locationIds: [],
};

describe('MasterDataService contact workflows', () => {
  let repository: MasterDataRepository;
  let service: MasterDataService;

  beforeEach(() => {
    repository = {
      contactRoles: vi.fn().mockResolvedValue([role]),
      businessPartnerRoles: vi.fn().mockResolvedValue([role]),
      findContactMatches: vi.fn().mockResolvedValue([]),
      createContact: vi.fn(),
      createArtistContact: vi.fn(),
      linkArtistContact: vi.fn(),
      artist: vi.fn(),
      contact: vi.fn(),
    } as unknown as MasterDataRepository;
    service = new MasterDataService(repository);
  });

  it('blocks strong normalized duplicates before a contact is created', async () => {
    vi.mocked(repository.findContactMatches).mockResolvedValue([
      {
        contact: contactSummary('50000000-0000-4000-8000-000000000001'),
        reasons: ['EMAIL'],
        strength: 'STRONG',
      },
    ]);

    await expect(
      service.createContact(access, { firstName: 'Mara', email: 'mara@example.test' }),
    ).rejects.toMatchObject({
      response: { code: 'CONTACT_DUPLICATE_MATCH' },
    });
    expect(repository.createContact).not.toHaveBeenCalled();
  });

  it('allows a consciously confirmed name-only duplicate', async () => {
    const created = contactRecord('60000000-0000-4000-8000-000000000001');
    vi.mocked(repository.findContactMatches).mockResolvedValue([
      {
        contact: contactSummary('50000000-0000-4000-8000-000000000001'),
        reasons: ['NAME'],
        strength: 'WEAK',
      },
    ]);
    vi.mocked(repository.createContact).mockResolvedValue(created);

    await expect(service.createContact(access, { firstName: 'Mara' }, true)).resolves.toBe(created);
  });

  it('rejects a direct contact that is already a company representative for the artist', async () => {
    vi.mocked(repository.artist).mockResolvedValue(artistRecord());
    vi.mocked(repository.contact).mockResolvedValue(
      contactRecord('50000000-0000-4000-8000-000000000001'),
    );

    await expect(
      service.linkArtistContact(
        access,
        '70000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
        [role.id],
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { code: string }).code === 'ARTIST_CONTACT_ASSIGNMENT_CONFLICT',
    );
    expect(repository.linkArtistContact).not.toHaveBeenCalled();
  });

  it('requires contact write permission for atomic inline creation', async () => {
    vi.mocked(repository.artist).mockResolvedValue(artistRecord());
    await expect(
      service.createArtistContact(
        { ...access, permissions: ['artists.write'] },
        '70000000-0000-4000-8000-000000000001',
        { firstName: 'Mara' },
        [role.id],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function contactSummary(id: string) {
  return {
    id,
    firstName: 'Mara',
    lastName: 'Muster',
    label: null,
    email: 'mara@example.test',
    phone: null,
    mobile: null,
    status: 'ACTIVE' as const,
    incomplete: false,
  };
}

function contactRecord(id: string): ContactRecord {
  return {
    ...contactSummary(id),
    organizationId: access.organizationId,
    notes: null,
    version: 1,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    artistLinks: [],
    businessPartnerLinks: [],
  };
}

function artistRecord(): ArtistRecord {
  return {
    id: '70000000-0000-4000-8000-000000000001',
    organizationId: access.organizationId,
    stageName: 'Test Artist',
    firstName: null,
    lastName: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    state: null,
    countryCode: null,
    email: null,
    phone: null,
    instagram: null,
    website: null,
    notes: null,
    status: 'ACTIVE',
    version: 1,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    incomplete: false,
    contacts: [],
    businessPartners: [
      {
        id: '80000000-0000-4000-8000-000000000001',
        version: 1,
        businessPartner: {
          id: '90000000-0000-4000-8000-000000000001',
          companyName: 'Agency',
          email: null,
          phone: null,
          status: 'ACTIVE',
        },
        roles: [role],
        representatives: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            version: 1,
            businessPartnerContactId: 'b0000000-0000-4000-8000-000000000001',
            isPrimary: true,
            contact: contactSummary('50000000-0000-4000-8000-000000000001'),
            roles: [role],
          },
        ],
      },
    ],
  };
}
