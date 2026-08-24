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
const password = 'Local-Test-Admin-66!';

describeWithDatabase('Phase 6 booking and lineup integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let productionAgent: ReturnType<typeof request.agent>;
  let scopedBookingAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let secondLocationId = '';
  let eventFormatId = '';
  let eventId = '';
  let otherLocationEventId = '';
  let artistOneId = '';
  let artistTwoId = '';
  let artistThreeId = '';
  let partnerId = '';
  let contactId = '';
  let firstBookingId = '';
  let firstBookingVersion = 1;
  let secondBookingId = '';
  let secondBookingVersion = 1;

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
        administratorName: 'Phase Six Administrator',
        email: 'phase6-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Six Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    secondLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Restricted Hall', timezone: 'Europe/Berlin' },
      })
    ).id;
    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase6-admin@example.test')).status).toBe(200);
    productionAgent = await createRoleAgent('production', 'phase6-production@example.test');
    scopedBookingAgent = await createRoleAgent(
      'booking',
      'phase6-booking@example.test',
      'SELECTED',
      [locationId],
    );
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('backfills the exact Phase 6 permission matrix', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    const matrix = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions
          .map(({ permission }) => permission.key)
          .filter((key) => key.startsWith('bookings.') || key === 'lineup.write')
          .sort(),
      ]),
    );
    expect(matrix).toEqual({
      administrator: [
        'bookings.finance',
        'bookings.read',
        'bookings.status',
        'bookings.write',
        'lineup.write',
      ],
      booking: [
        'bookings.finance',
        'bookings.read',
        'bookings.status',
        'bookings.write',
        'lineup.write',
      ],
      management_finance: [
        'bookings.finance',
        'bookings.read',
        'bookings.status',
        'bookings.write',
        'lineup.write',
      ],
      production: ['bookings.read'],
      read_only: ['bookings.read'],
    });
  });

  it('creates relational format requirements and snapshots them into new events', async () => {
    const format = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'Phase 6 Late Show', eventKind: 'OWN_PRODUCTION' });
    expect(format.status).toBe(201);
    eventFormatId = format.body.id as string;

    const requirements = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/lineup-requirements`,
      )
      .send({
        version: 1,
        items: [
          {
            role: 'ARTIST',
            requiredCount: 2,
            defaultFeeMinor: '100000',
            defaultFeeCurrency: 'EUR',
          },
          { role: 'MODERATOR', requiredCount: 1 },
          { role: 'OTHER', customRoleLabel: 'Support Act', requiredCount: 1 },
        ],
      });
    expect(requirements.status).toBe(200);
    expect(requirements.body.version).toBe(2);
    expect(requirements.body.items).toHaveLength(3);

    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({ sourceEventFormatId: eventFormatId, locationId, eventDate: '2026-10-10' });
    expect(event.status).toBe(201);
    eventId = event.body.id as string;
    expect(event.body.bookingSummary).toMatchObject({
      artistRequiredCount: 2,
      artistConfirmedCount: 0,
      moderatorRequired: true,
      moderatorConfirmed: false,
      incomplete: true,
    });

    const snapshot = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`,
    );
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'ARTIST',
          requiredCount: 2,
          defaultFeeMinor: '100000',
          defaultFeeCurrency: 'EUR',
          sourceEventFormatRequirementVersion: 1,
        }),
        expect.objectContaining({ role: 'MODERATOR', requiredCount: 1 }),
        expect.objectContaining({
          role: 'OTHER',
          customRoleLabel: 'Support Act',
          requiredCount: 1,
        }),
      ]),
    );

    otherLocationEventId = (
      await administratorAgent.post(`/api/v1/organizations/${organizationId}/events`).send({
        name: 'Restricted Event',
        eventKind: 'OWN_PRODUCTION',
        locationId: secondLocationId,
        eventDate: '2026-10-11',
      })
    ).body.id as string;
  });

  it('keeps event snapshots unchanged after the format requirements change', async () => {
    const current = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/lineup-requirements`,
    );
    const changed = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/lineup-requirements`,
      )
      .send({
        version: current.body.version,
        items: current.body.items.map((item: Record<string, unknown>) => ({
          id: item.id,
          version: item.version,
          role: item.role,
          customRoleLabel: item.customRoleLabel,
          requiredCount: item.role === 'ARTIST' ? 4 : item.requiredCount,
          defaultFeeMinor: item.role === 'ARTIST' ? '250000' : item.defaultFeeMinor,
          defaultFeeCurrency: item.role === 'ARTIST' ? 'EUR' : item.defaultFeeCurrency,
        })),
      });
    expect(changed.status).toBe(200);
    const eventSnapshot = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`,
    );
    expect(eventSnapshot.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'ARTIST', requiredCount: 2, defaultFeeMinor: '100000' }),
      ]),
    );
  });

  it('creates tenant-safe master-data relationships used by bookings', async () => {
    const [artistOne, artistTwo, artistThree, partner, contact] = await Promise.all([
      prisma.database.artist.create({
        data: {
          organizationId,
          stageName: 'Artist One',
          email: 'artist.one@example.test',
          phone: '+4930111111',
        },
      }),
      prisma.database.artist.create({
        data: {
          organizationId,
          stageName: 'Artist Two',
          email: 'artist.two@example.test',
          phone: '+4930222222',
        },
      }),
      prisma.database.artist.create({ data: { organizationId, stageName: 'Artist Three' } }),
      prisma.database.businessPartner.create({
        data: { organizationId, companyName: 'Booking Management GmbH' },
      }),
      prisma.database.contact.create({
        data: {
          organizationId,
          firstName: 'Alex',
          lastName: 'Agent',
          email: 'alex.agent@example.test',
          phone: '+4930123456',
          mobile: '+49170123456',
        },
      }),
    ]);
    artistOneId = artistOne.id;
    artistTwoId = artistTwo.id;
    artistThreeId = artistThree.id;
    partnerId = partner.id;
    contactId = contact.id;
    const partnerContact = await prisma.database.businessPartnerContact.create({
      data: { organizationId, businessPartnerId: partnerId, contactId },
    });
    const bookingRole = await prisma.database.contactRole.findUniqueOrThrow({
      where: { key: 'booking' },
    });
    for (const artistId of [artistOneId, artistThreeId]) {
      const artistPartner = await prisma.database.artistBusinessPartner.create({
        data: { organizationId, artistId, businessPartnerId: partnerId },
      });
      const representative = await prisma.database.artistBusinessPartnerContact.create({
        data: {
          organizationId,
          artistBusinessPartnerId: artistPartner.id,
          businessPartnerId: partnerId,
          businessPartnerContactId: partnerContact.id,
          isPrimary: true,
        },
      });
      await prisma.database.artistBusinessPartnerContactRole.create({
        data: {
          organizationId,
          artistBusinessPartnerContactId: representative.id,
          roleId: bookingRole.id,
        },
      });
    }
  });

  it('searches active Artists by stage, first and last name with pagination beyond 100', async () => {
    await prisma.database.artist.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        organizationId,
        stageName: `Catalog Artist ${String(index + 1).padStart(3, '0')}`,
      })),
    });
    const pow = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Pow', firstName: 'Paul', lastName: 'Hurdalek' },
    });
    for (const query of ['Pow', 'Paul', 'Hurdalek', 'Paul Hurdalek']) {
      const result = await administratorAgent.get(
        `/api/v1/organizations/${organizationId}/artists?q=${encodeURIComponent(query)}&status=ACTIVE&limit=25&offset=0`,
      );
      expect(result.status).toBe(200);
      expect(result.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: pow.id })]),
      );
    }
    const pageAfterOneHundred = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/artists?q=Catalog&status=ACTIVE&limit=25&offset=100`,
    );
    expect(pageAfterOneHundred.status).toBe(200);
    expect(pageAfterOneHundred.body.total).toBe(105);
    expect(pageAfterOneHundred.body.items).toHaveLength(5);
  });

  it('creates bookings without mutating artists, accepts no fee and validates contacts', async () => {
    const artistBefore = await prisma.database.artist.findUniqueOrThrow({
      where: { id: artistOneId },
    });
    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artistOneId,
        role: 'ARTIST',
        status: 'SHORTLISTED',
        businessPartnerId: partnerId,
        contactId,
        agreedFeeMinor: null,
        agreedFeeCurrency: null,
        hotelRequired: true,
        internalNote: 'First candidate',
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      artistId: artistOneId,
      artistName: 'Artist One',
      role: 'ARTIST',
      status: 'SHORTLISTED',
      agreedFeeMinor: null,
      agreedFeeCurrency: null,
      businessPartnerId: partnerId,
      contactId,
      contactEmail: 'alex.agent@example.test',
      contactPhone: '+4930123456',
      contactMobile: '+49170123456',
      hasActiveRepresentation: true,
      hotelArrangement: 'REQUIRED',
      version: 1,
    });
    firstBookingId = created.body.id as string;
    const artistAfter = await prisma.database.artist.findUniqueOrThrow({
      where: { id: artistOneId },
    });
    expect(artistAfter).toEqual(artistBefore);

    const second = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artistTwoId,
        role: 'ARTIST',
        status: 'OPTION',
        agreedFeeMinor: '175500',
        agreedFeeCurrency: 'EUR',
        travelCostMinor: '25000',
        travelCostCurrency: 'EUR',
        hotelArrangement: 'BUYOUT',
        hotelBuyoutMinor: '10000',
        hotelBuyoutCurrency: 'EUR',
      });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({
      agreedFeeMinor: '175500',
      agreedFeeCurrency: 'EUR',
      travelCostMinor: '25000',
      artistEmail: 'artist.two@example.test',
      artistPhone: '+4930222222',
      hasActiveRepresentation: false,
      hotelArrangement: 'BUYOUT',
      hotelBuyoutMinor: '10000',
    });
    secondBookingId = second.body.id as string;

    const duplicate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({ artistId: artistOneId, role: 'ARTIST', hotelRequired: false });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: 'BOOKING_ACTIVE_ARTIST_CONFLICT',
      message: 'Dieser Artist ist für diese Veranstaltung bereits gebucht.',
      details: {
        existingBooking: {
          id: firstBookingId,
          role: 'ARTIST',
          status: 'SHORTLISTED',
        },
      },
    });

    const duplicateDifferentRole = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artistOneId,
        role: 'OTHER',
        customRoleLabel: 'Special Guest',
        hotelArrangement: 'NONE',
      });
    expect(duplicateDifferentRole.status).toBe(409);
    expect(duplicateDifferentRole.body.code).toBe('BOOKING_ACTIVE_ARTIST_CONFLICT');

    const foreignContact = await prisma.database.contact.create({
      data: { organizationId, firstName: 'Not', lastName: 'Linked' },
    });
    const invalidContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artistThreeId,
        role: 'MODERATOR',
        contactId: foreignContact.id,
        hotelRequired: false,
      });
    expect(invalidContact.status).toBe(422);
    expect(invalidContact.body.code).toBe('BOOKING_CONTACT_NOT_AVAILABLE');
  });

  it('returns Artist direct contact fallback and a clear no-contact state', async () => {
    const noContactArtist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'No Contact Artist' },
    });
    const contactEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Direct Contact Event',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-10-12',
      });
    const direct = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${contactEvent.body.id}/bookings`)
      .send({ artistId: artistTwoId, role: 'ARTIST', hotelArrangement: 'NONE' });
    expect(direct.status).toBe(201);
    expect(direct.body).toMatchObject({
      artistEmail: 'artist.two@example.test',
      artistPhone: '+4930222222',
      hasActiveRepresentation: false,
      businessPartnerId: null,
      contactId: null,
    });
    const withoutContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${contactEvent.body.id}/bookings`)
      .send({ artistId: noContactArtist.id, role: 'ARTIST', hotelArrangement: 'NONE' });
    expect(withoutContact.status).toBe(201);
    expect(withoutContact.body).toMatchObject({
      artistEmail: null,
      artistPhone: null,
      hasActiveRepresentation: false,
    });

    const privateRole = await prisma.database.role.create({
      data: { organizationId, key: 'phase6_booking_only', name: 'Phase 6 booking only' },
    });
    const bookingRead = await prisma.database.permission.findUniqueOrThrow({
      where: { key: 'bookings.read' },
    });
    await prisma.database.rolePermission.create({
      data: { organizationId, roleId: privateRole.id, permissionId: bookingRead.id },
    });
    const bookingOnlyAgent = await createRoleAgent(
      'phase6_booking_only',
      'phase6-booking-only@example.test',
    );
    const redacted = await bookingOnlyAgent.get(
      `/api/v1/organizations/${organizationId}/events/${contactEvent.body.id}/bookings`,
    );
    expect(redacted.status).toBe(200);
    expect(redacted.body[0]).not.toHaveProperty('artistEmail');
    expect(redacted.body[0]).not.toHaveProperty('artistPhone');
  });

  it('supports all hotel arrangements and exact optional Hotel-Buy-out money', async () => {
    const hotelEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Hotel Arrangement Event',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-10-13',
      });
    const hotelArtists = await Promise.all(
      ['None', 'Required', 'Buyout'].map((suffix) =>
        prisma.database.artist.create({
          data: { organizationId, stageName: `Hotel ${suffix}` },
        }),
      ),
    );
    const none = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${hotelEvent.body.id}/bookings`)
      .send({ artistId: hotelArtists[0]!.id, role: 'ARTIST', hotelArrangement: 'NONE' });
    const required = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${hotelEvent.body.id}/bookings`)
      .send({ artistId: hotelArtists[1]!.id, role: 'ARTIST', hotelRequired: true });
    const buyout = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${hotelEvent.body.id}/bookings`)
      .send({
        artistId: hotelArtists[2]!.id,
        role: 'ARTIST',
        hotelArrangement: 'BUYOUT',
        hotelBuyoutMinor: '10000',
        hotelBuyoutCurrency: 'EUR',
        hotelNote: 'Unabhängige Hotelnotiz',
      });
    expect(none.body).toMatchObject({ hotelArrangement: 'NONE', hotelRequired: false });
    expect(required.body).toMatchObject({ hotelArrangement: 'REQUIRED', hotelRequired: true });
    expect(buyout.body).toMatchObject({
      hotelArrangement: 'BUYOUT',
      hotelRequired: false,
      hotelBuyoutMinor: '10000',
      hotelBuyoutCurrency: 'EUR',
      hotelNote: 'Unabhängige Hotelnotiz',
    });
    const productionView = await productionAgent.get(
      `/api/v1/organizations/${organizationId}/events/${hotelEvent.body.id}/bookings`,
    );
    const redactedBuyout = productionView.body.find(
      (booking: { id: string }) => booking.id === buyout.body.id,
    );
    expect(redactedBuyout.hotelArrangement).toBe('BUYOUT');
    expect(redactedBuyout).not.toHaveProperty('hotelBuyoutMinor');
    expect(redactedBuyout).not.toHaveProperty('hotelBuyoutCurrency');
  });

  it('serializes duplicate Artist creation and permits only explicit separate Bookings', async () => {
    const duplicateEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Duplicate Artist Event',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-10-14',
      });
    const duplicateArtist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Duplicate Artist' },
    });
    const [first, raced] = await Promise.all([
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events/${duplicateEvent.body.id}/bookings`)
        .send({ artistId: duplicateArtist.id, role: 'ARTIST', hotelArrangement: 'NONE' }),
      administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events/${duplicateEvent.body.id}/bookings`)
        .send({
          artistId: duplicateArtist.id,
          role: 'OTHER',
          customRoleLabel: 'Second Role',
          hotelArrangement: 'NONE',
        }),
    ]);
    expect([first.status, raced.status].sort()).toEqual([201, 409]);
    const existing = first.status === 201 ? first : raced;
    for (const status of ['DECLINED', 'CANCELLED'] as const) {
      const historical = await administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events/${duplicateEvent.body.id}/bookings`)
        .send({
          artistId: duplicateArtist.id,
          role: 'ARTIST',
          status,
          hotelArrangement: 'NONE',
        });
      expect(historical.status).toBe(201);
    }
    const confirmedSeparate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${duplicateEvent.body.id}/bookings`)
      .send({
        artistId: duplicateArtist.id,
        role: 'ARTIST',
        hotelArrangement: 'NONE',
        confirmDuplicateArtist: true,
      });
    expect(confirmedSeparate.status).toBe(201);
    expect(confirmedSeparate.body.id).not.toBe(existing.body.id);
    expect(
      await prisma.database.booking.count({
        where: {
          organizationId,
          eventId: duplicateEvent.body.id,
          artistId: duplicateArtist.id,
          status: { in: ['SHORTLISTED', 'REQUESTED', 'OPTION', 'CONFIRMED'] },
        },
      }),
    ).toBe(2);
  });

  it('supports direct status corrections with optimistic locking, history and atomic audit', async () => {
    const unchanged = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({ version: 1, status: 'SHORTLISTED', confirmReactivation: false });
    expect(unchanged.status).toBe(422);
    expect(unchanged.body.code).toBe('NO_CHANGES');

    for (const status of ['CONFIRMED', 'OPTION', 'REQUESTED', 'CONFIRMED'] as const) {
      const changed = await administratorAgent
        .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
        .send({
          version: firstBookingVersion,
          status,
          note: `Changed to ${status}`,
          confirmReactivation: false,
        });
      expect(changed.status).toBe(200);
      firstBookingVersion = changed.body.version as number;
    }
    const current = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/bookings/${firstBookingId}`,
    );
    expect(current.body.status).toBe('CONFIRMED');
    expect(
      current.body.statusHistory.map((entry: { newStatus: string }) => entry.newStatus),
    ).toEqual(['CONFIRMED', 'REQUESTED', 'OPTION', 'CONFIRMED']);
    expect(
      current.body.statusHistory.every((entry: { actorName: string }) => entry.actorName),
    ).toBe(true);
    expect(
      await prisma.database.auditLog.count({
        where: {
          organizationId,
          targetId: firstBookingId,
          action: 'booking.status_changed',
        },
      }),
    ).toBe(4);

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({ version: 1, status: 'CANCELLED', confirmReactivation: false });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
  });

  it('calculates progress and serializes versioned parallel order changes', async () => {
    const progress = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/booking-progress`,
    );
    expect(progress.status).toBe(200);
    expect(progress.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'ARTIST',
          requiredCount: 2,
          confirmedCount: 1,
          optionCount: 1,
          missingCount: 0,
        }),
        expect.objectContaining({
          role: 'MODERATOR',
          requiredCount: 1,
          confirmedCount: 0,
          missingCount: 1,
        }),
      ]),
    );
    expect(progress.body.moderatorRequired).toBe(true);
    expect(progress.body.moderatorConfirmed).toBe(false);

    const reordered = await administratorAgent
      .put(`/api/v1/organizations/${organizationId}/events/${eventId}/lineup/order`)
      .send({
        items: [
          { bookingId: secondBookingId, version: secondBookingVersion },
          { bookingId: firstBookingId, version: firstBookingVersion },
        ],
      });
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((booking: { id: string }) => booking.id)).toEqual([
      secondBookingId,
      firstBookingId,
    ]);
    secondBookingVersion = reordered.body[0].version as number;
    firstBookingVersion = reordered.body[1].version as number;

    const [parallelForward, parallelReverse] = await Promise.all([
      administratorAgent
        .put(`/api/v1/organizations/${organizationId}/events/${eventId}/lineup/order`)
        .send({
          items: [
            { bookingId: firstBookingId, version: firstBookingVersion },
            { bookingId: secondBookingId, version: secondBookingVersion },
          ],
        }),
      administratorAgent
        .put(`/api/v1/organizations/${organizationId}/events/${eventId}/lineup/order`)
        .send({
          items: [
            { bookingId: secondBookingId, version: secondBookingVersion },
            { bookingId: firstBookingId, version: firstBookingVersion },
          ],
        }),
    ]);
    expect([parallelForward.status, parallelReverse.status].sort()).toEqual([200, 409]);
    const winner = parallelForward.status === 200 ? parallelForward : parallelReverse;
    firstBookingVersion = winner.body.find(
      (booking: { id: string; version: number }) => booking.id === firstBookingId,
    ).version as number;
    secondBookingVersion = winner.body.find(
      (booking: { id: string; version: number }) => booking.id === secondBookingId,
    ).version as number;
  });

  it('manages multiple sets and breaks with atomic versioned program ordering', async () => {
    const initial = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/program-items`,
    );
    expect(initial.status).toBe(200);
    const firstSet = initial.body.find(
      (item: { bookingId: string }) => item.bookingId === firstBookingId,
    );
    const otherArtistSet = initial.body.find(
      (item: { bookingId: string }) => item.bookingId === secondBookingId,
    );
    expect(firstSet).toBeTruthy();
    expect(otherArtistSet).toBeTruthy();

    const updatedFirst = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/program-items/${firstSet.id}`)
      .send({ version: firstSet.version, label: 'Set 1 · Erste Hälfte', durationMinutes: 10 });
    const updatedOther = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/program-items/${otherArtistSet.id}`)
      .send({
        version: otherArtistSet.version,
        label: 'Hauptauftritt',
        durationMinutes: 45,
      });
    expect(updatedFirst.status).toBe(200);
    expect(updatedOther.status).toBe(200);

    const secondSet = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/program-items`)
      .send({
        kind: 'PERFORMANCE',
        bookingId: firstBookingId,
        label: 'Set 2 · Zweite Hälfte',
        durationMinutes: 10,
      });
    const breakItem = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/program-items`)
      .send({ kind: 'BREAK', label: 'Umbaupause', durationMinutes: 20 });
    expect(secondSet.status).toBe(201);
    expect(breakItem.status).toBe(201);

    const orderedItems = [updatedFirst.body, updatedOther.body, breakItem.body, secondSet.body];
    const reordered = await administratorAgent
      .put(`/api/v1/organizations/${organizationId}/events/${eventId}/program/order`)
      .send({
        items: orderedItems.map((item) => ({ itemId: item.id, version: item.version })),
      });
    expect(reordered.status).toBe(200);
    expect(
      reordered.body.map((item: { bookingId: string | null; label: string | null }) => ({
        bookingId: item.bookingId,
        label: item.label,
      })),
    ).toEqual([
      { bookingId: firstBookingId, label: 'Set 1 · Erste Hälfte' },
      { bookingId: secondBookingId, label: 'Hauptauftritt' },
      { bookingId: null, label: 'Umbaupause' },
      { bookingId: firstBookingId, label: 'Set 2 · Zweite Hälfte' },
    ]);
    expect(
      reordered.body.reduce(
        (sum: number, item: { durationMinutes: number | null }) =>
          sum + (item.durationMinutes ?? 0),
        0,
      ),
    ).toBe(85);

    const progress = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/booking-progress`,
    );
    const artistProgress = progress.body.roles.find(
      (role: { role: string }) => role.role === 'ARTIST',
    );
    expect(artistProgress.confirmedCount + artistProgress.optionCount).toBe(2);

    const versions = reordered.body.map((item: { id: string; version: number }) => ({
      itemId: item.id,
      version: item.version,
    }));
    const [forward, reverse] = await Promise.all([
      administratorAgent
        .put(`/api/v1/organizations/${organizationId}/events/${eventId}/program/order`)
        .send({ items: versions }),
      administratorAgent
        .put(`/api/v1/organizations/${organizationId}/events/${eventId}/program/order`)
        .send({ items: [...versions].reverse() }),
    ]);
    expect([forward.status, reverse.status].sort()).toEqual([200, 409]);
    expect(
      await prisma.database.auditLog.count({
        where: { organizationId, targetId: eventId, action: 'event_program.reordered' },
      }),
    ).toBeGreaterThanOrEqual(2);

    expect(
      (
        await productionAgent.post(
          `/api/v1/organizations/${organizationId}/events/${eventId}/program-items`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await scopedBookingAgent.get(
          `/api/v1/organizations/${organizationId}/events/${otherLocationEventId}/program-items`,
        )
      ).status,
    ).toBe(404);
  });

  it('redacts financial fields server-side and enforces Location scope', async () => {
    const productionList = await productionAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/bookings`,
    );
    expect(productionList.status).toBe(200);
    expect(productionList.body).toHaveLength(2);
    for (const booking of productionList.body as Array<Record<string, unknown>>) {
      expect(booking).not.toHaveProperty('agreedFeeMinor');
      expect(booking).not.toHaveProperty('agreedFeeCurrency');
      expect(booking).not.toHaveProperty('travelCostMinor');
      expect(booking).not.toHaveProperty('travelCostCurrency');
    }
    const redactedRequirements = await productionAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`,
    );
    expect(redactedRequirements.body.items[0]).not.toHaveProperty('defaultFeeMinor');

    expect(
      (
        await scopedBookingAgent.get(
          `/api/v1/organizations/${organizationId}/events/${otherLocationEventId}/bookings`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await scopedBookingAgent
          .post(`/api/v1/organizations/${organizationId}/events/${otherLocationEventId}/bookings`)
          .send({ artistId: artistThreeId, role: 'ARTIST', hotelRequired: false })
      ).status,
    ).toBe(404);
  });

  it('redacts booking and Artist contact data without the dedicated read permissions', async () => {
    const role = await prisma.database.role.create({
      data: { organizationId, key: 'phase6_private_reader', name: 'Phase 6 private reader' },
    });
    const permissions = await prisma.database.permission.findMany({
      where: { key: { in: ['bookings.read', 'artists.read'] } },
    });
    await prisma.database.rolePermission.createMany({
      data: permissions.map((permission) => ({
        organizationId,
        roleId: role.id,
        permissionId: permission.id,
      })),
    });
    const privateAgent = await createRoleAgent(
      'phase6_private_reader',
      'phase6-private@example.test',
    );
    const bookings = await privateAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/bookings`,
    );
    expect(bookings.status).toBe(200);
    const protectedBooking = bookings.body.find(
      (booking: { id: string }) => booking.id === firstBookingId,
    );
    expect(protectedBooking).not.toHaveProperty('businessPartnerId');
    expect(protectedBooking).not.toHaveProperty('businessPartnerName');
    expect(protectedBooking).not.toHaveProperty('contactId');
    expect(protectedBooking).not.toHaveProperty('contactEmail');
    expect(protectedBooking).not.toHaveProperty('additionalContacts');

    const artists = await privateAgent.get(
      `/api/v1/organizations/${organizationId}/artists?q=Artist%20One&status=ACTIVE&limit=25&offset=0`,
    );
    expect(artists.status).toBe(200);
    expect(artists.body.items[0]).toMatchObject({ contacts: [], businessPartners: [] });
  });

  it('keeps declined and cancelled history, supports confirmed reactivation and later requests', async () => {
    const cancelled = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({
        version: firstBookingVersion,
        status: 'CANCELLED',
        note: 'Production changed',
        confirmReactivation: false,
      });
    expect(cancelled.status).toBe(200);
    firstBookingVersion = cancelled.body.version as number;

    const hidden = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/bookings`,
    );
    expect(hidden.body.some((booking: { id: string }) => booking.id === firstBookingId)).toBe(
      false,
    );
    const history = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/bookings?includeHistorical=true`,
    );
    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstBookingId, status: 'CANCELLED' }),
      ]),
    );

    const missingConfirmation = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({ version: firstBookingVersion, status: 'SHORTLISTED', confirmReactivation: false });
    expect(missingConfirmation.status).toBe(422);
    expect(missingConfirmation.body.code).toBe('BOOKING_REACTIVATION_CONFIRMATION_REQUIRED');
    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({ version: firstBookingVersion, status: 'SHORTLISTED', confirmReactivation: true });
    expect(reactivated.status).toBe(200);
    firstBookingVersion = reactivated.body.version as number;

    const cancelledAgain = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${firstBookingId}/status`)
      .send({ version: firstBookingVersion, status: 'CANCELLED', confirmReactivation: false });
    expect(cancelledAgain.status).toBe(200);
    const laterRequest = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({ artistId: artistOneId, role: 'ARTIST', status: 'SHORTLISTED', hotelRequired: false });
    expect(laterRequest.status).toBe(201);

    const declined = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${secondBookingId}/status`)
      .send({ version: secondBookingVersion, status: 'DECLINED', confirmReactivation: false });
    expect(declined.status).toBe(200);
    const afterDecline = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({ artistId: artistTwoId, role: 'ARTIST', status: 'REQUESTED', hotelRequired: false });
    expect(afterDecline.status).toBe(201);
  });

  it('keeps archived contacts readable but excludes them from new booking validation', async () => {
    await prisma.database.contact.update({
      where: { id: contactId },
      data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
    });
    const historical = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/bookings/${firstBookingId}`,
    );
    expect(historical.status).toBe(200);
    expect(historical.body).toMatchObject({
      contactId,
      contactName: 'Alex Agent',
      contactStatus: 'ARCHIVED',
      contactEmail: 'alex.agent@example.test',
    });
    const newBooking = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artistThreeId,
        role: 'MODERATOR',
        businessPartnerId: partnerId,
        contactId,
        hotelRequired: false,
      });
    expect(newBooking.status).toBe(422);
    expect(newBooking.body.code).toBe('BOOKING_CONTACT_NOT_AVAILABLE');
  });

  it('returns batch booking summaries and filters event lists without per-event API calls', async () => {
    const list = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?booking=INCOMPLETE&limit=100&offset=0`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: eventId,
          bookingSummary: expect.objectContaining({
            artistRequiredCount: 2,
            moderatorRequired: true,
            moderatorConfirmed: false,
          }),
        }),
      ]),
    );
    const openRequests = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events?booking=OPEN_REQUESTS&limit=100&offset=0`,
    );
    expect(openRequests.status).toBe(200);
    expect(openRequests.body.items.some((event: { id: string }) => event.id === eventId)).toBe(
      true,
    );
  });

  it('returns one winner for parallel status updates on the same version', async () => {
    const artist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Concurrent Artist' },
    });
    const booking = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({ artistId: artist.id, role: 'OTHER', customRoleLabel: 'Guest', hotelRequired: false });
    expect(booking.status).toBe(201);
    const [requested, cancelled] = await Promise.all([
      administratorAgent
        .patch(
          `/api/v1/organizations/${organizationId}/bookings/${booking.body.id as string}/status`,
        )
        .send({ version: 1, status: 'REQUESTED', confirmReactivation: false }),
      administratorAgent
        .patch(
          `/api/v1/organizations/${organizationId}/bookings/${booking.body.id as string}/status`,
        )
        .send({ version: 1, status: 'CANCELLED', confirmReactivation: false }),
    ]);
    expect([requested.status, cancelled.status].sort()).toEqual([200, 409]);
    expect(
      await prisma.database.bookingStatusHistory.count({ where: { bookingId: booking.body.id } }),
    ).toBe(1);
  });

  it('maps an individual Headliner requirement, fee and progress without rewriting saved roles', async () => {
    const current = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`,
    );
    const headlinerRequirements = await administratorAgent
      .put(`/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`)
      .send({
        version: current.body.version,
        items: current.body.items.map((item: Record<string, unknown>) => ({
          id: item.id,
          version: item.version,
          role: item.role,
          customRoleLabel: item.role === 'OTHER' ? 'Headliner' : item.customRoleLabel,
          requiredCount: item.role === 'OTHER' ? 1 : item.requiredCount,
          defaultFeeMinor: item.role === 'OTHER' ? '76500' : item.defaultFeeMinor,
          defaultFeeCurrency: item.role === 'OTHER' ? 'EUR' : item.defaultFeeCurrency,
        })),
      });
    expect(headlinerRequirements.status).toBe(200);
    expect(headlinerRequirements.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'OTHER',
          customRoleLabel: 'Headliner',
          defaultFeeMinor: '76500',
        }),
      ]),
    );
    const artist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Phase Six Headliner' },
    });
    const booking = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artist.id,
        role: 'OTHER',
        customRoleLabel: 'Headliner',
        status: 'CONFIRMED',
        agreedFeeMinor: '76500',
        agreedFeeCurrency: 'EUR',
        hotelRequired: false,
      });
    expect(booking.status).toBe(201);
    const progress = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/booking-progress`,
    );
    expect(progress.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Headliner',
          requiredCount: 1,
          confirmedCount: 1,
          missingCount: 0,
        }),
      ]),
    );

    const renamed = await administratorAgent
      .put(`/api/v1/organizations/${organizationId}/events/${eventId}/lineup-requirements`)
      .send({
        version: headlinerRequirements.body.version,
        items: headlinerRequirements.body.items.map((item: Record<string, unknown>) => ({
          id: item.id,
          version: item.version,
          role: item.role,
          customRoleLabel: item.role === 'OTHER' ? 'Featured Act' : item.customRoleLabel,
          requiredCount: item.requiredCount,
          defaultFeeMinor: item.defaultFeeMinor,
          defaultFeeCurrency: item.defaultFeeCurrency,
        })),
      });
    expect(renamed.status).toBe(200);
    const savedBooking = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/bookings/${booking.body.id as string}`,
    );
    expect(savedBooking.body).toMatchObject({ role: 'OTHER', customRoleLabel: 'Headliner' });
    const changedProgress = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/booking-progress`,
    );
    expect(changedProgress.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Featured Act', requiredCount: 1, missingCount: 1 }),
        expect.objectContaining({ label: 'Headliner', requiredCount: 0, confirmedCount: 1 }),
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
      body: { name: `Phase Six ${roleKey}`, email, password },
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
