import type { INestApplication } from '@nestjs/common';
import { cleanTestDatabase } from '@venue/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { AuthService } from '../src/auth/auth.service.js';
import { createApiApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SetupService } from '../src/setup/setup.service.js';

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe.sequential : describe.skip;
const origin = 'http://localhost:3100';
const password = 'Local-Test-Admin-55!';
const sensitiveFormatDescription = 'Phase 5 confidential snapshot description 57291';
const sensitiveEventDescription = 'Phase 5 private event description 81342';

describeWithDatabase('Phase 5 event integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let bookingAgent: ReturnType<typeof request.agent>;
  let productionAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let secondLocationId = '';
  let eventFormatId = '';
  let eventId = '';
  let eventVersion = 1;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    setup = application.get(SetupService);
    auth = application.get(AuthService);
    await cleanTestDatabase(prisma.database);

    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase Five Administrator',
        email: 'phase5-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Five Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    const secondLocation = await prisma.database.location.create({
      data: {
        organizationId,
        name: 'Studio',
        timezone: 'Europe/Berlin',
      },
    });
    secondLocationId = secondLocation.id;

    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase5-admin@example.test')).status).toBe(200);
    bookingAgent = await createRoleAgent('booking', 'phase5-booking@example.test', 'SELECTED', [
      locationId,
    ]);
    productionAgent = await createRoleAgent('production', 'phase5-production@example.test');
    readOnlyAgent = await createRoleAgent('read_only', 'phase5-read@example.test');
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('installs the Phase 5 permission matrix for a newly created organization', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    const permissions = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions
          .map(({ permission }) => permission.key)
          .filter((key) => key.startsWith('events.'))
          .sort(),
      ]),
    );
    expect(permissions).toEqual({
      administrator: ['events.read', 'events.status', 'events.write'],
      booking: ['events.read', 'events.status', 'events.write'],
      management_finance: ['events.read', 'events.status', 'events.write'],
      production: ['events.read', 'events.write'],
      read_only: ['events.read'],
    });
    const optionPermissions = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions
          .map(({ permission }) => permission.key)
          .filter((key) => key.startsWith('date_options.'))
          .sort(),
      ]),
    );
    expect(optionPermissions).toEqual({
      administrator: ['date_options.convert', 'date_options.read', 'date_options.write'],
      booking: ['date_options.convert', 'date_options.read', 'date_options.write'],
      management_finance: ['date_options.convert', 'date_options.read', 'date_options.write'],
      production: ['date_options.read'],
      read_only: ['date_options.read'],
    });
  });

  it('creates an exact server-owned snapshot from an active format', async () => {
    const format = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({
        name: 'Mix Show',
        description: sensitiveFormatDescription,
        eventKind: 'OWN_PRODUCTION',
        defaultTechnicalGetInTime: '16:00',
        defaultArtistGetInTime: '17:30',
        defaultDoorsTime: '19:00',
        defaultStartTime: '20:00',
        defaultEndTime: '01:30',
        defaultEndNextDay: true,
        recordingDefault: 'ENABLED',
      });
    expect(format.status).toBe(201);
    eventFormatId = format.body.id as string;

    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({ sourceEventFormatId: eventFormatId, locationId, eventDate: '2026-09-12' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId,
      locationId,
      locationName: 'Main Hall',
      name: 'Mix Show',
      eventDate: '2026-09-12',
      status: 'DRAFT',
      sourceEventFormatId: eventFormatId,
      sourceEventFormatVersion: 1,
      snapshotSource: 'EVENT_FORMAT',
      formatNameSnapshot: 'Mix Show',
      eventKind: 'OWN_PRODUCTION',
      description: sensitiveFormatDescription,
      technicalGetInTime: '16:00',
      artistGetInTime: '17:30',
      doorsTime: '19:00',
      startTime: '20:00',
      endTime: '01:30',
      endNextDay: true,
      recordingSetting: 'ENABLED',
      timezone: 'Europe/Berlin',
      version: 1,
    });
    eventId = created.body.id as string;
  });

  it('applies explicit allowed overrides and rejects invalid local schedules', async () => {
    const invalid = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        sourceEventFormatId: eventFormatId,
        locationId,
        eventDate: '2026-09-13',
        startTime: '20:00',
        doorsTime: '20:30',
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('INVALID_EVENT_SCHEDULE');

    const overridden = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        sourceEventFormatId: eventFormatId,
        locationId,
        eventDate: '2026-09-13',
        name: 'Individueller Mix-Abend',
        description: sensitiveEventDescription,
        startTime: '20:30',
        endTime: '02:00',
        endNextDay: true,
        recordingSetting: 'DISABLED',
      });
    expect(overridden.status).toBe(201);
    expect(overridden.body).toMatchObject({
      name: 'Individueller Mix-Abend',
      description: sensitiveEventDescription,
      formatNameSnapshot: 'Mix Show',
      eventKind: 'OWN_PRODUCTION',
      startTime: '20:30',
      endTime: '02:00',
      endNextDay: true,
      recordingSetting: 'DISABLED',
      sourceEventFormatVersion: 1,
    });
  });

  it('creates and edits free events without creating or retaining format provenance', async () => {
    const formatsBefore = await prisma.database.eventFormat.count({ where: { organizationId } });
    const missingKind = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({ name: 'Freies Event', locationId, eventDate: '2026-11-01' });
    expect(missingKind.status).toBe(422);
    expect(missingKind.body.code).toBe('EVENT_KIND_REQUIRED');

    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Freie Vermietung',
        eventKind: 'THIRD_PARTY_EVENT',
        locationId,
        eventDate: '2026-11-01',
        technicalGetInTime: '16:00',
        endTime: '23:00',
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      snapshotSource: null,
      sourceEventFormatId: null,
      sourceEventFormatVersion: null,
      formatNameSnapshot: null,
      formatDescriptionSnapshot: null,
      eventKind: 'THIRD_PARTY_EVENT',
      occupancyComplete: true,
    });
    expect(await prisma.database.eventFormat.count({ where: { organizationId } })).toBe(
      formatsBefore,
    );
    const edited = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${created.body.id as string}`)
      .send({ version: 1, name: 'Freie Vermietung aktualisiert' });
    expect(edited.status).toBe(200);
    expect(edited.body.formatNameSnapshot).toBeNull();
  });

  it('keeps existing events immutable when the source format changes or is archived', async () => {
    const changed = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`)
      .send({ version: 1, name: 'Renamed Format', defaultStartTime: '21:00' });
    expect(changed.status).toBe(200);

    const unchanged = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}`,
    );
    expect(unchanged.body).toMatchObject({
      name: 'Mix Show',
      formatNameSnapshot: 'Mix Show',
      startTime: '20:00',
      sourceEventFormatVersion: 1,
    });

    const archived = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/status`)
      .send({ version: 2, status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(
      (await administratorAgent.get(`/api/v1/organizations/${organizationId}/events/${eventId}`))
        .status,
    ).toBe(200);
    const forbiddenCreate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({ sourceEventFormatId: eventFormatId, locationId, eventDate: '2026-09-14' });
    expect(forbiddenCreate.status).toBe(422);
    expect(forbiddenCreate.body.code).toBe('EVENT_FORMAT_ARCHIVED');

    expect(
      (
        await administratorAgent
          .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/status`)
          .send({ version: 3, status: 'ACTIVE' })
      ).status,
    ).toBe(200);
  });

  it('searches and filters bounded calendar ranges with stable pagination', async () => {
    for (const input of [
      { eventDate: '2026-09-11', name: 'Alpha Abend', startTime: '20:00' },
      {
        eventDate: '2026-09-12',
        name: 'Beta Abend',
        technicalGetInTime: null,
        artistGetInTime: null,
        doorsTime: null,
        startTime: '02:00',
        endTime: '03:00',
        endNextDay: false,
      },
      { eventDate: '2026-10-01', name: 'Oktober Abend', startTime: null },
    ]) {
      const response = await administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events`)
        .send({ sourceEventFormatId: eventFormatId, locationId, ...input });
      expect(response.status, JSON.stringify({ input, body: response.body })).toBe(201);
    }

    const range = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?fromDate=2026-09-12&toDate=2026-09-13&limit=20`,
    );
    expect(range.status).toBe(200);
    expect(range.body.items.map((event: { eventDate: string }) => event.eventDate)).toEqual([
      '2026-09-12',
      '2026-09-12',
      '2026-09-13',
    ]);

    const search = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?q=alpha&eventKind=OWN_PRODUCTION`,
    );
    expect(search.body.items.map((event: { name: string }) => event.name)).toEqual(['Alpha Abend']);

    const firstPage = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?limit=2&offset=0`,
    );
    const secondPage = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?limit=2&offset=2`,
    );
    expect(firstPage.body).toMatchObject({ total: 6, limit: 2, offset: 0 });
    expect(secondPage.body).toMatchObject({ total: 6, limit: 2, offset: 2 });
    expect(
      [...firstPage.body.items, ...secondPage.body.items].map(
        (event: { eventDate: string; startTime: string | null; id: string }) => [
          event.eventDate,
          event.startTime,
          event.id,
        ],
      ),
    ).toEqual(
      [...firstPage.body.items, ...secondPage.body.items]
        .map((event: { eventDate: string; startTime: string | null; id: string }) => [
          event.eventDate,
          event.startTime,
          event.id,
        ])
        .toSorted(
          (left, right) =>
            String(left[0]).localeCompare(String(right[0])) ||
            String(left[1] ?? '99:99').localeCompare(String(right[1] ?? '99:99')) ||
            String(left[2]).localeCompare(String(right[2])),
        ),
    );
  });

  it('updates event-owned values and status with optimistic locking and controlled corrections', async () => {
    const updated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}`)
      .send({
        version: eventVersion,
        eventDate: '2026-09-14',
        startTime: '20:30',
        endTime: '02:15',
        endNextDay: true,
        recordingSetting: 'DISABLED',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      eventDate: '2026-09-14',
      startTime: '20:30',
      endTime: '02:15',
      endNextDay: true,
      formatNameSnapshot: 'Mix Show',
      version: 2,
    });
    eventVersion = 2;

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}`)
      .send({ version: 1, name: 'Stale change' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    for (const status of ['CONFIRMED', 'CANCELLED', 'PLANNED'] as const) {
      const changed = await administratorAgent
        .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/status`)
        .send({ version: eventVersion, status });
      expect(changed.status).toBe(200);
      expect(changed.body.status).toBe(status);
      eventVersion = changed.body.version as number;
    }
    const corrected = await prisma.database.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(corrected).toMatchObject({ status: 'PLANNED', cancelledAt: null, completedAt: null });
  });

  it('enforces half-open, cross-midnight and concurrent event occupancy', async () => {
    const base = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Belegungsbasis',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-11-10',
        technicalGetInTime: '18:00',
        endTime: '22:00',
      });
    expect(base.status).toBe(201);
    const overlap = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Überschneidung',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-11-10',
        startTime: '21:00',
        endTime: '23:00',
      });
    expect(overlap.status).toBe(409);
    expect(overlap.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
    expect(overlap.body.details.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'EVENT', id: base.body.id })]),
    );
    expect(
      (
        await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          name: 'Direkter Anschluss',
          eventKind: 'OWN_PRODUCTION',
          locationId,
          eventDate: '2026-11-10',
          startTime: '22:00',
          endTime: '23:00',
        })
      ).status,
    ).toBe(201);
    const otherLocationEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Andere Location',
        eventKind: 'OWN_PRODUCTION',
        locationId: secondLocationId,
        eventDate: '2026-11-10',
        startTime: '19:00',
        endTime: '21:00',
      });
    expect(otherLocationEvent.status).toBe(201);
    const conflictingMove = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/events/${otherLocationEvent.body.id as string}`,
      )
      .send({ version: otherLocationEvent.body.version, locationId });
    expect(conflictingMove.status).toBe(409);
    expect(conflictingMove.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');

    expect(
      (
        await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          name: 'Über Mitternacht',
          eventKind: 'OWN_PRODUCTION',
          locationId,
          eventDate: '2026-11-11',
          startTime: '20:00',
          endTime: '02:00',
          endNextDay: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          name: 'Folgetag-Kollision',
          eventKind: 'OWN_PRODUCTION',
          locationId,
          eventDate: '2026-11-12',
          startTime: '01:00',
          endTime: '03:00',
        })
      ).body.code,
    ).toBe('LOCATION_OCCUPANCY_CONFLICT');

    const concurrentInput = {
      eventKind: 'OWN_PRODUCTION',
      locationId,
      eventDate: '2026-11-20',
      startTime: '18:00',
      endTime: '22:00',
    };
    const concurrent = await Promise.all([
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events`)
        .send({ ...concurrentInput, name: 'Parallel A' }),
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events`)
        .send({ ...concurrentInput, name: 'Parallel B' }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);

    const eventBlocksOption = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-11-10',
        occupancyStartTime: '19:00',
        occupancyEndTime: '20:00',
        label: 'Vom Event blockiert',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(eventBlocksOption.status).toBe(409);
    expect(eventBlocksOption.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
  });

  it('unblocks cancelled events, rechecks reactivation and marks incomplete times', async () => {
    const blocker = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Stornierbarer Blocker',
        eventKind: 'THIRD_PARTY_EVENT',
        locationId,
        eventDate: '2026-11-21',
        startTime: '18:00',
        endTime: '22:00',
      });
    const cancelled = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${blocker.body.id as string}/status`)
      .send({ version: 1, status: 'CANCELLED' });
    expect(cancelled.status).toBe(200);
    const replacement = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Ersatztermin',
        eventKind: 'THIRD_PARTY_EVENT',
        locationId,
        eventDate: '2026-11-21',
        startTime: '18:00',
        endTime: '22:00',
      });
    expect(replacement.status).toBe(201);
    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${blocker.body.id as string}/status`)
      .send({ version: cancelled.body.version, status: 'PLANNED' });
    expect(reactivated.status).toBe(409);
    expect(reactivated.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');

    const incomplete = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Manuell prüfen',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-11-22',
        startTime: '20:00',
      });
    expect(incomplete.status).toBe(201);
    expect(incomplete.body.occupancyComplete).toBe(false);
  });

  it('assigns two option ranks, rejects a third, expires and promotes safely', async () => {
    const optionInput = {
      locationId,
      optionDate: '2026-12-01',
      occupancyStartTime: '16:00',
      occupancyEndTime: '23:00',
      validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
    const first = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...optionInput, label: 'Anfrage Eins' });
    const second = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...optionInput, label: 'Anfrage Zwei' });
    expect(first.body.rank).toBe('FIRST');
    expect(second.body.rank).toBe('SECOND');
    const fullyOptioned = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/availability?locationId=${locationId}&fromDate=2026-12-01&toDate=2026-12-01&occupancyStartTime=17:00&occupancyEndTime=22:00&resultFilter=FREE_AND_SECOND_OPTION`,
    );
    expect(fullyOptioned.body).toEqual([
      expect.objectContaining({ state: 'FULLY_OPTIONED', selectable: false }),
    ]);
    const third = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...optionInput, label: 'Anfrage Drei' });
    expect(third.status).toBe(409);
    expect(third.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
    const directEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Darf Optionen nicht überschreiben',
        eventKind: 'THIRD_PARTY_EVENT',
        locationId,
        eventDate: optionInput.optionDate,
        startTime: '18:00',
        endTime: '21:00',
      });
    expect(directEvent.status).toBe(409);

    const released = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/date-options/${first.body.id as string}/release`,
      )
      .send({ version: first.body.version });
    expect(released.body.status).toBe('RELEASED');
    const promotable = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/date-options/${second.body.id as string}`,
    );
    expect(promotable.body.canPromote).toBe(true);
    const promoted = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/date-options/${second.body.id as string}/promote`,
      )
      .send({ version: promotable.body.version });
    expect(promoted.body.rank).toBe('FIRST');

    const expiring = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...optionInput, optionDate: '2026-12-03', label: 'Läuft ab' });
    await prisma.database.venueDateOption.update({
      where: { id: expiring.body.id },
      data: { validUntil: new Date(Date.now() - 60_000) },
    });
    const afterExpiry = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...optionInput, optionDate: '2026-12-03', label: 'Nach Ablauf' });
    expect(afterExpiry.status).toBe(201);
    expect(afterExpiry.body.rank).toBe('FIRST');
    expect(
      (await prisma.database.venueDateOption.findUniqueOrThrow({ where: { id: expiring.body.id } }))
        .status,
    ).toBe('EXPIRED');

    const concurrentInput = {
      locationId,
      optionDate: '2027-01-05',
      occupancyStartTime: '16:00',
      occupancyEndTime: '22:00',
      validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
    const concurrent = await Promise.all([
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/date-options`)
        .send({ ...concurrentInput, label: 'Paralleloption A' }),
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/date-options`)
        .send({ ...concurrentInput, label: 'Paralleloption B' }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 201]);
    expect(concurrent.map(({ body }) => body.rank).sort()).toEqual(['FIRST', 'SECOND']);
  });

  it('creates mixed-rank option batches atomically with one audit entry per option', async () => {
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const existingFirst = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2027-02-01',
        occupancyStartTime: '16:00',
        occupancyEndTime: '23:00',
        label: 'Bestehende erste Batch-Option',
        validUntil,
      });
    expect(existingFirst.status).toBe(201);

    const batch = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
      .send({
        label: 'Gemeinsame Batch-Anfrage',
        note: 'Drei unabhängige Optionen',
        validUntil,
        options: [
          {
            locationId,
            optionDate: '2027-02-01',
            occupancyStartTime: '17:00',
            occupancyEndTime: '22:00',
            rank: 'SECOND',
          },
          {
            locationId,
            optionDate: '2027-02-02',
            occupancyStartTime: '16:00',
            occupancyEndTime: '23:00',
            rank: 'FIRST',
          },
          {
            locationId: secondLocationId,
            optionDate: '2027-02-03',
            occupancyStartTime: '18:00',
            occupancyEndTime: '01:00',
            occupancyEndNextDay: true,
            rank: 'FIRST',
          },
        ],
      });
    expect(batch.status).toBe(201);
    expect(batch.body).toMatchObject({ count: 3 });
    expect(
      batch.body.items.map((option: { optionDate: string; rank: string }) => [
        option.optionDate,
        option.rank,
      ]),
    ).toEqual([
      ['2027-02-01', 'SECOND'],
      ['2027-02-02', 'FIRST'],
      ['2027-02-03', 'FIRST'],
    ]);
    const stored = await prisma.database.venueDateOption.findMany({
      where: { organizationId, label: 'Gemeinsame Batch-Anfrage' },
      orderBy: { optionDate: 'asc' },
    });
    expect(stored).toHaveLength(3);
    expect(new Set(stored.map(({ id }) => id)).size).toBe(3);
    const audits = await prisma.database.auditLog.findMany({
      where: {
        organizationId,
        targetType: 'venue_date_option',
        targetId: { in: stored.map(({ id }) => id) },
        action: 'date_option.created',
      },
    });
    expect(audits).toHaveLength(3);
    expect(audits.every(({ metadata }) => JSON.stringify(metadata).includes('"batch":true'))).toBe(
      true,
    );
  });

  it('rejects duplicate and occupied batch entries without leaving partial options behind', async () => {
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const duplicateEntry = {
      locationId,
      optionDate: '2027-02-05',
      occupancyStartTime: '16:00',
      occupancyEndTime: '23:00',
    };
    const duplicate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
      .send({
        label: 'Doppelte Batch-Auswahl',
        validUntil,
        options: [
          { ...duplicateEntry, rank: 'FIRST' },
          { ...duplicateEntry, rank: 'SECOND' },
        ],
      });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.code).toBe('DUPLICATE_DATE_OPTION_BATCH_ENTRY');
    expect(
      await prisma.database.venueDateOption.count({
        where: { organizationId, label: 'Doppelte Batch-Auswahl' },
      }),
    ).toBe(0);

    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Batch-Veranstaltungsblocker',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2027-02-07',
        technicalGetInTime: '16:00',
        endTime: '23:00',
      });
    expect(event.status).toBe(201);
    const auditCountBefore = await prisma.database.auditLog.count({
      where: { organizationId, targetType: 'venue_date_option', action: 'date_option.created' },
    });
    const occupied = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
      .send({
        label: 'Atomarer Batch-Rollback',
        validUntil,
        options: [
          {
            locationId,
            optionDate: '2027-02-06',
            occupancyStartTime: '16:00',
            occupancyEndTime: '23:00',
            rank: 'FIRST',
          },
          {
            locationId,
            optionDate: '2027-02-07',
            occupancyStartTime: '17:00',
            occupancyEndTime: '22:00',
            rank: 'FIRST',
          },
        ],
      });
    expect(occupied.status).toBe(409);
    expect(occupied.body).toMatchObject({
      code: 'LOCATION_OCCUPANCY_CONFLICT',
      details: {
        batchEntries: [
          expect.objectContaining({ batchIndex: 1, optionDate: '2027-02-07', rank: 'FIRST' }),
        ],
        conflicts: [expect.objectContaining({ type: 'EVENT', id: event.body.id })],
      },
    });
    expect(
      await prisma.database.venueDateOption.count({
        where: { organizationId, label: 'Atomarer Batch-Rollback' },
      }),
    ).toBe(0);
    expect(
      await prisma.database.auditLog.count({
        where: { organizationId, targetType: 'venue_date_option', action: 'date_option.created' },
      }),
    ).toBe(auditCountBefore);
  });

  it('reports first- and second-rank batch conflicts and serializes competing batches', async () => {
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const occupiedInput = {
      locationId,
      optionDate: '2027-02-09',
      occupancyStartTime: '16:00',
      occupancyEndTime: '23:00',
      validUntil,
    };
    const first = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...occupiedInput, label: 'Batch-Konflikt erste Option' });
    const second = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({ ...occupiedInput, label: 'Batch-Konflikt zweite Option' });
    expect([first.body.rank, second.body.rank]).toEqual(['FIRST', 'SECOND']);

    for (const rank of ['FIRST', 'SECOND'] as const) {
      const conflict = await administratorAgent
        .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
        .send({
          label: `Batch ${rank} Konflikt`,
          validUntil,
          options: [
            {
              locationId: occupiedInput.locationId,
              optionDate: occupiedInput.optionDate,
              occupancyStartTime: occupiedInput.occupancyStartTime,
              occupancyEndTime: occupiedInput.occupancyEndTime,
              rank,
            },
          ],
        });
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
      expect(conflict.body.details.conflicts).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'DATE_OPTION', rank })]),
      );
    }

    const competingOptions = ['2027-02-11', '2027-02-12'].map((optionDate) => ({
      locationId,
      optionDate,
      occupancyStartTime: '16:00',
      occupancyEndTime: '23:00',
      rank: 'FIRST',
    }));
    const responses = await Promise.all(
      ['Parallel-Batch A', 'Parallel-Batch B'].map((label) =>
        administratorAgent
          .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
          .send({ label, validUntil, options: competingOptions }),
      ),
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const winner = responses.find(({ status }) => status === 201)!;
    const loser = responses.find(({ status }) => status === 409)!;
    expect(winner.body.count).toBe(2);
    expect(loser.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
    expect(
      await prisma.database.venueDateOption.count({
        where: {
          organizationId,
          optionDate: {
            in: ['2027-02-11', '2027-02-12'].map((date) => new Date(`${date}T00:00Z`)),
          },
        },
      }),
    ).toBe(2);
  });

  it('versions option edits and rejects occupancy changes or promotion into a first-rank conflict', async () => {
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const blocker = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Optionsänderungsblocker',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-12-05',
        startTime: '18:00',
        endTime: '22:00',
      });
    expect(blocker.status).toBe(201);
    const movable = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId: secondLocationId,
        optionDate: '2026-12-05',
        occupancyStartTime: '19:00',
        occupancyEndTime: '21:00',
        label: 'Verschiebbare Option',
        validUntil,
      });
    const blockedMove = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/date-options/${movable.body.id as string}`)
      .send({ version: movable.body.version, locationId });
    expect(blockedMove.status).toBe(409);
    expect(blockedMove.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
    const unchanged = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/date-options/${movable.body.id as string}`,
    );
    expect(unchanged.body).toMatchObject({ locationId: secondLocationId, version: 1 });
    const renamed = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/date-options/${movable.body.id as string}`)
      .send({ version: 1, label: 'Verschiebbare Option aktualisiert' });
    expect(renamed.body).toMatchObject({ label: 'Verschiebbare Option aktualisiert', version: 2 });
    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/date-options/${movable.body.id as string}`)
      .send({ version: 1, label: 'Veraltet' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const first = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-06',
        occupancyStartTime: '16:00',
        occupancyEndTime: '18:00',
        label: 'Kurze erste Option',
        validUntil,
      });
    const second = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-06',
        occupancyStartTime: '17:00',
        occupancyEndTime: '20:00',
        label: 'Lange zweite Option',
        validUntil,
      });
    await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/date-options/${first.body.id as string}/release`,
      )
      .send({ version: first.body.version });
    const replacementFirst = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-06',
        occupancyStartTime: '16:30',
        occupancyEndTime: '17:30',
        label: 'Neue erste Option',
        validUntil,
      });
    expect(replacementFirst.body.rank).toBe('FIRST');
    const blockedPromotion = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/date-options/${second.body.id as string}/promote`,
      )
      .send({ version: second.body.version });
    expect(blockedPromotion.status).toBe(409);
    expect(blockedPromotion.body.code).toBe('LOCATION_OCCUPANCY_CONFLICT');
  });

  it('computes availability and converts a first option atomically', async () => {
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const first = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-10',
        occupancyStartTime: '16:00',
        occupancyEndTime: '23:00',
        label: 'Umwandlung Eins',
        validUntil,
      });
    const second = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-10',
        occupancyStartTime: '17:00',
        occupancyEndTime: '22:00',
        label: 'Umwandlung Zwei',
        validUntil,
      });
    expect(
      (
        await administratorAgent
          .post(
            `/api/v1/organizations/${organizationId}/date-options/${second.body.id as string}/convert`,
          )
          .send({ version: second.body.version, eventKind: 'THIRD_PARTY_EVENT' })
      ).status,
    ).toBe(409);
    const converted = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/date-options/${first.body.id as string}/convert`,
      )
      .send({ version: first.body.version, eventKind: 'THIRD_PARTY_EVENT' });
    expect(converted.status).toBe(201);
    expect(converted.body).toMatchObject({
      name: 'Umwandlung Eins',
      eventDate: '2026-12-10',
      locationId,
      snapshotSource: null,
      occupancyComplete: true,
    });
    expect(
      (await prisma.database.venueDateOption.findUniqueOrThrow({ where: { id: first.body.id } }))
        .status,
    ).toBe('CONVERTED');
    expect(
      (await prisma.database.venueDateOption.findUniqueOrThrow({ where: { id: second.body.id } }))
        .status,
    ).toBe('UNAVAILABLE');

    const availability = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/availability?locationId=${locationId}&fromDate=2026-11-22&toDate=2026-11-23&occupancyStartTime=16:00&occupancyEndTime=23:00&resultFilter=FREE_AND_SECOND_OPTION`,
    );
    expect(availability.status).toBe(200);
    expect(availability.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-11-22', state: 'MANUAL_REVIEW', selectable: false }),
        expect.objectContaining({ date: '2026-11-23', state: 'FREE', selectable: true }),
      ]),
    );
  });

  it('enforces permissions and Location scope without exposing inaccessible event IDs', async () => {
    const secondLocationEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        sourceEventFormatId: eventFormatId,
        locationId: secondLocationId,
        eventDate: '2026-09-20',
        name: 'Studio Event',
      });
    expect(secondLocationEvent.status).toBe(201);

    const bookingList = await bookingAgent.get(
      `/api/v1/organizations/${organizationId}/events?limit=100`,
    );
    expect(bookingList.status).toBe(200);
    expect(bookingList.body.items.map((event: { id: string }) => event.id)).not.toContain(
      secondLocationEvent.body.id,
    );
    expect(
      (
        await bookingAgent.get(
          `/api/v1/organizations/${organizationId}/events/${secondLocationEvent.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await bookingAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          sourceEventFormatId: eventFormatId,
          locationId: secondLocationId,
          eventDate: '2026-09-21',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await readOnlyAgent
          .post(`/api/v1/organizations/${organizationId}/events`)
          .send({ sourceEventFormatId: eventFormatId, locationId, eventDate: '2026-09-22' })
      ).status,
    ).toBe(403);
    expect(
      (
        await readOnlyAgent
          .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/status`)
          .send({ version: eventVersion, status: 'CONFIRMED' })
      ).status,
    ).toBe(403);
    expect(
      (
        await productionAgent
          .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/status`)
          .send({ version: eventVersion, status: 'CONFIRMED' })
      ).status,
    ).toBe(403);
    const batchPayload = {
      label: 'Nicht zugänglicher Batch',
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      options: [
        {
          locationId: secondLocationId,
          optionDate: '2026-12-21',
          occupancyStartTime: '16:00',
          occupancyEndTime: '22:00',
          rank: 'FIRST',
        },
      ],
    };
    expect(
      (
        await bookingAgent
          .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
          .send(batchPayload)
      ).status,
    ).toBe(404);
    expect(
      (
        await readOnlyAgent
          .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
          .send({
            ...batchPayload,
            options: [{ ...batchPayload.options[0], locationId }],
          })
      ).status,
    ).toBe(403);
    const optionPayload = {
      locationId: secondLocationId,
      optionDate: '2026-12-20',
      occupancyStartTime: '16:00',
      occupancyEndTime: '22:00',
      label: 'Nicht zugänglich',
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(
      (
        await bookingAgent
          .post(`/api/v1/organizations/${organizationId}/date-options`)
          .send(optionPayload)
      ).status,
    ).toBe(404);
    expect(
      (
        await readOnlyAgent
          .post(`/api/v1/organizations/${organizationId}/date-options`)
          .send({ ...optionPayload, locationId })
      ).status,
    ).toBe(403);
    expect(
      (
        await productionAgent
          .post(`/api/v1/organizations/${organizationId}/date-options`)
          .send({ ...optionPayload, locationId })
      ).status,
    ).toBe(403);
    const scopedOption = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send(optionPayload);
    expect(scopedOption.status).toBe(201);
    expect(
      (
        await bookingAgent.get(
          `/api/v1/organizations/${organizationId}/date-options/${scopedOption.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await bookingAgent.get(
          `/api/v1/organizations/${organizationId}/availability?locationId=${secondLocationId}&fromDate=2026-12-20&toDate=2026-12-20&occupancyStartTime=16:00&occupancyEndTime=22:00`,
        )
      ).status,
    ).toBe(404);
  });

  it('hides foreign tenant format, Location and event IDs consistently', async () => {
    const secondAdmin = await auth.auth.api.createUser({
      body: { name: 'Second Tenant Admin', email: 'phase5-second@example.test', password },
    });
    let secondOrganizationId = '';
    let foreignLocationId = '';
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: secondAdmin.user.id },
        data: { emailVerified: true },
      });
      const organization = await transaction.organization.create({ data: { name: 'Tenant Two' } });
      secondOrganizationId = organization.id;
      const location = await transaction.location.create({
        data: { organizationId: organization.id, name: 'Foreign Hall', timezone: 'Europe/Berlin' },
      });
      foreignLocationId = location.id;
      const roleId = await setup.createStandardRoles(transaction, organization.id);
      const membership = await transaction.membership.create({
        data: { organizationId: organization.id, userId: secondAdmin.user.id },
      });
      await transaction.membershipRole.create({
        data: { organizationId: organization.id, membershipId: membership.id, roleId },
      });
    });
    const secondAgent = request.agent(application.getHttpServer());
    expect((await signInAs(secondAgent, 'phase5-second@example.test')).status).toBe(200);
    const foreignFormat = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/event-formats`)
      .send({ name: 'Foreign Format', eventKind: 'THIRD_PARTY_EVENT' });
    const foreignEvent = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/events`)
      .send({
        sourceEventFormatId: foreignFormat.body.id,
        locationId: foreignLocationId,
        eventDate: '2026-09-30',
      });
    expect(foreignEvent.status).toBe(201);
    const foreignOption = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/date-options`)
      .send({
        locationId: foreignLocationId,
        optionDate: '2026-10-02',
        occupancyStartTime: '16:00',
        occupancyEndTime: '22:00',
        label: 'Foreign Option',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(foreignOption.status).toBe(201);

    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/events/${foreignEvent.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          sourceEventFormatId: foreignFormat.body.id,
          locationId,
          eventDate: '2026-09-30',
        })
      ).body.code,
    ).toBe('EVENT_FORMAT_NOT_FOUND');
    expect(
      (
        await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
          sourceEventFormatId: eventFormatId,
          locationId: foreignLocationId,
          eventDate: '2026-09-30',
        })
      ).body.code,
    ).toBe('LOCATION_NOT_FOUND');
    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/date-options/${foreignOption.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    const foreignBatch = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options/batch`)
      .send({
        label: 'Foreign Location Batch',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        options: [
          {
            locationId: foreignLocationId,
            optionDate: '2026-10-03',
            occupancyStartTime: '16:00',
            occupancyEndTime: '22:00',
            rank: 'FIRST',
          },
        ],
      });
    expect(foreignBatch.status).toBe(404);
    expect(foreignBatch.body.code).toBe('LOCATION_NOT_FOUND');
  });

  it('writes safe atomic audit metadata without format or event free text', async () => {
    const entries = await prisma.database.auditLog.findMany({
      where: { organizationId, targetType: 'event' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['event.created', 'event.updated', 'event.status_changed']),
    );
    const metadata = JSON.stringify(entries.map((entry) => entry.metadata));
    expect(metadata).not.toContain(sensitiveFormatDescription);
    expect(metadata).not.toContain(sensitiveEventDescription);
    expect(metadata).not.toContain('Individueller Mix-Abend');
    expect(metadata).toContain('sourceEventFormatVersion');
    expect(metadata).toContain('changedFields');
    expect(metadata).toContain('previousStatus');
    const optionEntries = await prisma.database.auditLog.findMany({
      where: { organizationId, targetType: 'venue_date_option' },
    });
    expect(optionEntries.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'date_option.created',
        'date_option.updated',
        'date_option.released',
        'date_option.promoted',
        'date_option.expired',
        'date_option.converted',
        'date_option.unavailable',
      ]),
    );
  });

  async function createRoleAgent(
    roleKey: string,
    email: string,
    locationScope: 'ALL' | 'SELECTED' = 'ALL',
    locationIds: string[] = [],
  ) {
    const created = await auth.auth.api.createUser({
      body: { name: `Phase Five ${roleKey}`, email, password },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: created.user.id },
        data: { emailVerified: true },
      });
      const role = await transaction.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: roleKey } },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: created.user.id, locationScope },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
      if (locationScope === 'SELECTED') {
        await transaction.membershipLocation.createMany({
          data: locationIds.map((assignedLocationId) => ({
            organizationId,
            membershipId: membership.id,
            locationId: assignedLocationId,
          })),
        });
      }
    });
    const agent = request.agent(application.getHttpServer());
    expect((await signInAs(agent, email)).status).toBe(200);
    return agent;
  }
});

async function signInAs(agent: ReturnType<typeof request.agent>, email: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}
