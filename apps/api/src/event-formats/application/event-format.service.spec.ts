import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '../../security/access.types.js';
import { EventFormatNameConflictError } from '../domain/event-format.rules.js';
import type { EventFormatRecord } from './event-format.models.js';
import type { EventFormatRepository, EventFormatTransaction } from './event-format.repository.js';
import { EventFormatService } from './event-format.service.js';

const access: AccessContext = {
  user: { id: '10000000-0000-4000-8000-000000000001', name: 'Admin', email: 'admin@example.test' },
  membershipId: '10000000-0000-4000-8000-000000000002',
  organizationId: '10000000-0000-4000-8000-000000000003',
  membershipVersion: 1,
  permissions: ['event_formats.write'],
  locationScope: 'ALL',
  locationIds: [],
};

describe('EventFormatService', () => {
  it('owns the transaction, converts local times and audits only technical metadata', async () => {
    const created = record();
    const transaction: EventFormatTransaction = {
      create: vi.fn(async () => created),
      update: vi.fn(),
      setStatus: vi.fn(),
      audit: vi.fn(async () => undefined),
    };
    const repository = fakeRepository(transaction);
    const service = new EventFormatService(repository);

    await expect(
      service.create(access, {
        name: '  Mix   Show ',
        eventKind: 'OWN_PRODUCTION',
        defaultStartTime: '20:00',
        defaultEndTime: '01:30',
        defaultEndNextDay: true,
      }),
    ).resolves.toEqual(created);

    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.create).toHaveBeenCalledWith(
      access.organizationId,
      expect.objectContaining({
        name: 'Mix Show',
        normalizedName: 'mix show',
        startMinutes: 1200,
        endMinutes: 1530,
      }),
    );
    expect(transaction.audit).toHaveBeenCalledWith(access, 'event_format.created', created.id, {
      newVersion: 1,
    });
  });

  it('maps a race-safe repository name conflict to the stable HTTP contract', async () => {
    const transaction: EventFormatTransaction = {
      create: vi.fn(async () => {
        throw new EventFormatNameConflictError();
      }),
      update: vi.fn(),
      setStatus: vi.fn(),
      audit: vi.fn(),
    };
    const service = new EventFormatService(fakeRepository(transaction));

    let thrown: unknown;
    try {
      await service.create(access, { name: 'Mix Show', eventKind: 'OWN_PRODUCTION' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getResponse()).toMatchObject({
      code: 'EVENT_FORMAT_NAME_CONFLICT',
    });
  });
});

function fakeRepository(transaction: EventFormatTransaction): EventFormatRepository {
  return {
    list: vi.fn(),
    find: vi.fn(),
    transaction: vi.fn((operation) => operation(transaction)),
  };
}

function record(): EventFormatRecord {
  return {
    id: '10000000-0000-4000-8000-000000000004',
    organizationId: access.organizationId,
    name: 'Mix Show',
    normalizedName: 'mix show',
    description: null,
    eventKind: 'OWN_PRODUCTION',
    defaultTechnicalGetInTime: null,
    defaultArtistGetInTime: null,
    defaultDoorsTime: null,
    defaultStartTime: '20:00',
    defaultEndTime: '01:30',
    defaultEndNextDay: true,
    recordingDefault: 'UNSPECIFIED',
    status: 'ACTIVE',
    archivedAt: null,
    version: 1,
    createdAt: '2026-08-22T08:00:00.000Z',
    updatedAt: '2026-08-22T08:00:00.000Z',
  };
}
