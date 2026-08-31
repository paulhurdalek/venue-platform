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
const password = 'Local-Test-Admin-10!';

describeWithDatabase('Phase 10 documents integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let restrictedAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let otherLocationId = '';
  let eventId = '';
  let dealId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    auth = application.get(AuthService);
    await cleanTestDatabase(prisma.database);

    const setup = application.get(SetupService);
    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase Ten Administrator',
        email: 'phase10-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Ten Venue',
        locationName: 'Document Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    otherLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Restricted Hall', timezone: 'Europe/Berlin' },
      })
    ).id;

    const event = await prisma.database.event.create({
      data: {
        organizationId,
        locationId,
        eventKind: 'THIRD_PARTY_EVENT',
        name: 'Phase Ten Festival',
        eventDate: new Date('2099-05-20T00:00:00.000Z'),
        timezone: 'Europe/Berlin',
        technicalGetInMinutes: 14 * 60,
        doorsMinutes: 18 * 60,
        startMinutes: 20 * 60,
      },
    });
    eventId = event.id;
    const partner = await prisma.database.businessPartner.create({
      data: {
        organizationId,
        companyName: 'Phase Ten Customer GmbH',
        billingAddressLine1: 'Testweg 10',
        billingPostalCode: '10115',
        billingCity: 'Berlin',
        billingCountryCode: 'DE',
        email: 'customer@example.test',
      },
    });
    const deal = await prisma.database.deal.create({
      data: {
        organizationId,
        eventId,
        businessPartnerId: partner.id,
        customerNameSnapshot: partner.companyName,
      },
    });
    dealId = deal.id;
    await prisma.database.dealComponent.create({
      data: {
        organizationId,
        dealId,
        type: 'FIXED_RENT',
        label: 'Saalmiete',
        amountNetMinor: 100_000n,
        taxRateBasisPoints: 1_900,
        sortOrder: 0,
      },
    });
    await prisma.database.dealComponent.create({
      data: {
        organizationId,
        dealId,
        type: 'REVENUE_SHARE',
        label: 'Interne Ticketumsatzbeteiligung',
        taxRateBasisPoints: 1_900,
        locationShareBasisPoints: 3_000,
        counterpartyShareBasisPoints: 7_000,
        sortOrder: 1,
      },
    });
    await prisma.database.dealServicePosition.create({
      data: {
        organizationId,
        dealId,
        serviceNameSnapshot: 'Grundtechnik',
        unitSnapshot: 'FLAT_RATE',
        quantity: '1',
        salesUnitPriceNetMinor: 50_000n,
        internalUnitCostNetMinor: 10_000n,
        taxRateBasisPoints: 1_900,
        billingMode: 'INCLUDED',
        sortOrder: 0,
      },
    });

    const artist = await prisma.database.artist.create({
      data: {
        organizationId,
        stageName: 'Pow',
        email: 'artist@example.test',
      },
    });
    const booking = await prisma.database.booking.create({
      data: {
        organizationId,
        eventId,
        artistId: artist.id,
        role: 'ARTIST',
        status: 'CONFIRMED',
        lineupOrder: 1,
        agreedFeeMinor: 987_654_321n,
        agreedFeeCurrency: 'EUR',
        internalNote: 'Stage-left briefing um 17 Uhr',
        performanceStartMinutes: 20 * 60,
        performanceDurationMinutes: 90,
      },
    });
    await prisma.database.eventProgramItem.create({
      data: {
        organizationId,
        eventId,
        bookingId: booking.id,
        kind: 'PERFORMANCE',
        sortOrder: 1,
        durationMinutes: 90,
      },
    });
    await prisma.database.eventProgramItem.create({
      data: {
        organizationId,
        eventId,
        kind: 'BREAK',
        label: 'Pause zwischen den Sets',
        sortOrder: 2,
        durationMinutes: 15,
      },
    });
    await prisma.database.eventProgramItem.create({
      data: {
        organizationId,
        eventId,
        bookingId: booking.id,
        kind: 'PERFORMANCE',
        sortOrder: 3,
        durationMinutes: 90,
      },
    });
    const cancelledBooking = await prisma.database.booking.create({
      data: {
        organizationId,
        eventId,
        artistId: artist.id,
        role: 'ARTIST',
        status: 'CANCELLED',
        lineupOrder: 2,
        performanceStartMinutes: 18 * 60,
        performanceDurationMinutes: 30,
      },
    });
    await prisma.database.eventProgramItem.createMany({
      data: [
        {
          organizationId,
          eventId,
          bookingId: cancelledBooking.id,
          kind: 'PERFORMANCE',
          sortOrder: 4,
          durationMinutes: 30,
        },
        {
          organizationId,
          eventId,
          bookingId: cancelledBooking.id,
          kind: 'PERFORMANCE',
          sortOrder: 5,
          durationMinutes: 30,
        },
      ],
    });

    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase10-admin@example.test')).status).toBe(200);
    restrictedAgent = await createRestrictedAgent();
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('keeps offer drafts mutable, published PDFs immutable and the source deal unchanged', async () => {
    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/document-templates`)
      .send({
        name: 'Standardangebot',
        type: 'OFFER',
        title: 'Nur interner Vorlagentitel',
        introduction: 'Vielen Dank für Ihre Anfrage.',
        blocks: [{ heading: 'Leistungsumfang', body: 'Saal und Grundausstattung.' }],
        standardTerms: 'Zahlbar innerhalb von 14 Tagen.',
        closing: 'Wir freuen uns auf Ihre Rückmeldung.',
        footer: 'Phase Ten Venue · Berlin',
      });
    expect(template.status, JSON.stringify(template.body)).toBe(201);

    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({ type: 'OFFER', templateId: template.body.id, dealId });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      status: 'ENTWURF',
      documentNumber: null,
      publishedVersion: 0,
      title: 'Vermietungsangebot für Phase Ten Festival',
      recipientName: 'Phase Ten Customer GmbH',
      sourceTemplateVersion: 1,
    });
    expect(created.body.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'DEAL_COMPONENT',
          description: 'Saalmiete',
          unitPriceNetMinor: '100000',
          differsFromSource: false,
        }),
        expect.objectContaining({
          source: 'DEAL_SERVICE',
          description: 'Grundtechnik (enthalten)',
          unitPriceNetMinor: '0',
          differsFromSource: false,
        }),
      ]),
    );
    expect(created.body.positions).toHaveLength(2);
    expect(JSON.stringify(created.body.positions)).not.toContain('Interne Ticketumsatzbeteiligung');
    expect(created.body.versions).toEqual([]);

    const templateChanged = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/document-templates/${template.body.id as string}`,
      )
      .send({
        version: template.body.version,
        name: 'Standardangebot',
        type: 'OFFER',
        title: 'Später geänderte Vorlage',
        introduction: null,
        blocks: [],
        standardTerms: null,
        closing: null,
        footer: null,
      });
    expect(templateChanged.status).toBe(200);

    const draft = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`)
      .send(
        updateBody(created.body, {
          validUntil: '2099-04-30',
          internalNote: 'Nur intern: Deckungsbeitrag prüfen',
          positions: created.body.positions.map((position: Record<string, unknown>) =>
            position.description === 'Saalmiete'
              ? positionInput(position, {
                  description: 'Saalmiete angepasst',
                  unitPriceNetMinor: '99000',
                })
              : positionInput(position),
          ),
        }),
      );
    expect(draft.status, JSON.stringify(draft.body)).toBe(200);
    expect(draft.body).toMatchObject({
      title: 'Vermietungsangebot für Phase Ten Festival',
      status: 'ENTWURF',
      publishedVersion: 0,
    });
    expect(draft.body.positions[0]).toMatchObject({ differsFromSource: true });
    expect(
      await prisma.database.documentVersion.count({ where: { documentId: created.body.id } }),
    ).toBe(0);

    const preview = await administratorAgent.post(
      `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/preview`,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(preview.body).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(Buffer.from(preview.body).toString('latin1')).not.toContain('Deckungsbeitrag');
    expect(Buffer.from(preview.body).toString('latin1')).not.toContain(
      'Interne Ticketumsatzbeteiligung',
    );

    const markedCreated = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/status`,
      )
      .send({ revision: draft.body.revision, status: 'ERSTELLT' });
    expect(markedCreated.body.status).toBe('ERSTELLT');
    expect(markedCreated.body.documentNumber).toMatch(/^ANG-\d{4}-0001$/);
    const published = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/publish`,
      )
      .send({ revision: markedCreated.body.revision });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body).toMatchObject({
      status: 'UEBERGEBEN',
      publishedVersion: 1,
      documentNumber: markedCreated.body.documentNumber,
    });
    expect(published.body.versions).toHaveLength(1);
    const firstVersion = await prisma.database.documentVersion.findFirstOrThrow({
      where: { documentId: created.body.id, documentVersion: 1 },
    });
    expect(Buffer.from(firstVersion.pdfData).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');

    const edited = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`)
      .send(updateBody(published.body, { closing: 'Überarbeitete Schlussformel.' }));
    expect(edited.body).toMatchObject({ status: 'ENTWURF', publishedVersion: 1 });
    expect(edited.body.versions).toHaveLength(1);

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`)
      .send(updateBody(published.body, { closing: 'Veraltete Änderung.' }));
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const republished = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/publish`,
      )
      .send({ revision: edited.body.revision });
    expect(republished.body).toMatchObject({ status: 'UEBERGEBEN', publishedVersion: 2 });
    expect(republished.body.versions).toHaveLength(2);
    const persistedFirstVersion = await prisma.database.documentVersion.findUniqueOrThrow({
      where: { id: firstVersion.id },
    });
    expect(persistedFirstVersion.pdfSha256).toBe(firstVersion.pdfSha256);
    expect(JSON.stringify(persistedFirstVersion.snapshot)).not.toContain(
      'Überarbeitete Schlussformel',
    );

    const unchangedDeal = await prisma.database.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { components: true },
    });
    expect(unchangedDeal).toMatchObject({ status: 'ENTWURF', version: 1 });
    expect(unchangedDeal.components[0]).toMatchObject({
      label: 'Saalmiete',
      amountNetMinor: 100_000n,
    });

    const accepted = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/status`,
      )
      .send({ revision: republished.body.revision, status: 'ANGENOMMEN' });
    expect(accepted.body.status).toBe('ANGENOMMEN');
    expect(
      await prisma.database.documentStatusHistory.count({ where: { documentId: created.body.id } }),
    ).toBe(5);

    const secondDraft = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({
        type: 'OFFER',
        templateId: template.body.id,
        dealId,
        title: 'Zweites Vermietungsangebot',
      });
    expect(secondDraft.body.documentNumber).toBeNull();
    const secondCreated = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/documents/${secondDraft.body.id as string}/status`,
      )
      .send({ revision: secondDraft.body.revision, status: 'ERSTELLT' });
    expect(secondCreated.body.documentNumber).toMatch(/^ANG-\d{4}-0002$/);
    const secondBackToDraft = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/documents/${secondDraft.body.id as string}/status`,
      )
      .send({ revision: secondCreated.body.revision, status: 'ENTWURF' });
    const secondCreatedAgain = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/documents/${secondDraft.body.id as string}/status`,
      )
      .send({ revision: secondBackToDraft.body.revision, status: 'ERSTELLT' });
    expect(secondCreatedAgain.body.documentNumber).toBe(secondCreated.body.documentNumber);
  });

  it('uses each active program item exactly once for browser and Ablauf PDF output', async () => {
    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/document-templates`)
      .send({
        name: 'Ablaufstandard',
        type: 'PRODUCTION_INFORMATION',
        title: 'Interner Ablauf-Vorlagentitel',
        introduction: 'Historischer Vorlagentext, der nicht ausgegeben werden darf.',
        blocks: [{ heading: 'Technische Leitung', body: 'Bitte Funkkanal 4 verwenden.' }],
        standardTerms: null,
        closing: null,
        footer: 'Nur für die Produktion',
      });
    expect(template.status).toBe(201);
    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({ type: 'PRODUCTION_INFORMATION', templateId: template.body.id });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      title: 'Ablauf für Phase Ten Festival',
      documentNumber: null,
      introduction: null,
      blocks: [],
      internalNote: null,
    });
    const visibleProgram = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/program-items`,
    );
    expect(visibleProgram.status).toBe(200);
    expect(visibleProgram.body).toHaveLength(3);
    const program = (
      created.body.contextSnapshot as {
        program?: Array<{
          programItemId?: string;
          kind?: string;
          label?: string | null;
          booking?: { artist?: { stageName?: string | null } } | null;
        }>;
      }
    ).program;
    expect(program).toHaveLength(3);
    expect(
      program?.map((item) => item.label ?? item.booking?.artist?.stageName ?? 'Auftritt'),
    ).toEqual(['Pow', 'Pause zwischen den Sets', 'Pow']);
    expect(new Set(program?.map((item) => item.programItemId)).size).toBe(3);
    const contextText = JSON.stringify(created.body.contextSnapshot);
    expect(contextText).toContain('Pow');
    expect(contextText).toContain('20:00');
    expect(contextText).not.toContain('CANCELLED');
    expect(contextText).not.toContain('Stage-left briefing um 17 Uhr');
    expect(contextText).not.toMatch(
      /agreedFee|travelCost|hotelBuyout|price|margin|amount|deal|contact|service/i,
    );

    const preview = await administratorAgent.post(
      `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/preview`,
    );
    expect(preview.status).toBe(200);
    const previewText = Buffer.from(preview.body).toString('latin1');
    expect(previewText).toContain('PROGRAMMPUNKT');
    expect(previewText).toContain('NOTIZ');
    expect(previewText).not.toContain('Zeiten');
    expect(previewText).not.toContain('PAUSE / UMBAU');
    expect(previewText.match(/Pow/g) ?? []).toHaveLength(2);
    const firstPow = previewText.indexOf('Pow');
    const pause = previewText.indexOf('Pause zwischen den Sets');
    const secondPow = previewText.indexOf('Pow', firstPow + 1);
    expect(firstPow).toBeGreaterThan(-1);
    expect(pause).toBeGreaterThan(firstPow);
    expect(secondPow).toBeGreaterThan(pause);

    const restricted = await restrictedAgent.get(
      `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`,
    );
    expect(restricted.status).toBe(404);
    expect(restricted.body).not.toHaveProperty('contextSnapshot');

    const updated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`)
      .send(updateBody(created.body, { internalNote: 'Produktionsbüro ab 12 Uhr besetzt.' }));
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    const published = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/publish`,
      )
      .send({ revision: updated.body.revision });
    expect(published.body).toMatchObject({ status: 'FREIGEGEBEN', publishedVersion: 1 });
    expect(published.body.documentNumber).toMatch(/^ABL-\d{4}-0001$/);
    const snapshotText = JSON.stringify(published.body.versions[0].snapshot);
    expect(snapshotText).not.toContain('Produktionsbüro ab 12 Uhr besetzt.');
    expect(snapshotText).not.toContain('Historischer Vorlagentext');
    expect(snapshotText).not.toContain('Technische Leitung');
    expect(snapshotText).not.toMatch(
      /agreedFee|travelCost|hotelBuyout|unitPrice|discount|totals|currency|margin|deal/i,
    );

    const download = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/versions/${published.body.versions[0].id as string}/pdf`,
    );
    expect(download.status).toBe(200);
    const pdfText = Buffer.from(download.body).toString('latin1');
    expect(pdfText).toContain('PROGRAMMPUNKT');
    expect(pdfText).toContain('NOTIZ');
    expect(pdfText).not.toContain(published.body.documentNumber);
    expect(pdfText).not.toContain('ABLAUF');
    expect(pdfText).not.toContain('Zeiten');
    expect(pdfText).not.toContain('Get-in Technik');
    expect(pdfText).not.toContain('PAUSE / UMBAU');
    expect(pdfText.match(/Pow/g) ?? []).toHaveLength(2);
    expect(pdfText.indexOf('Pause zwischen den Sets')).toBeGreaterThan(pdfText.indexOf('Pow'));
    expect(pdfText).not.toContain('987654321');
    expect(pdfText).not.toContain('Stage-left briefing');
    expect(pdfText).not.toContain('Historischer Vorlagentext');

    const archived = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/documents/${created.body.id as string}/archive`,
      )
      .send({ revision: published.body.revision });
    expect(archived.body.status).toBe('ARCHIVIERT');
    const editArchived = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${created.body.id as string}`)
      .send(updateBody(archived.body, { title: 'Unzulässige Änderung' }));
    expect(editArchived.status).toBe(422);
    expect(editArchived.body.code).toBe('DOCUMENT_ARCHIVED');
  });

  it('deletes only unversioned drafts and archives, filters and restores issued documents safely', async () => {
    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/document-templates`)
      .send({
        name: 'Archivangebot',
        type: 'OFFER',
        title: 'Archivangebot',
        blocks: [],
        footer: null,
      });
    expect(template.status).toBe(201);

    const draft = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({
        type: 'OFFER',
        templateId: template.body.id,
        dealId,
        title: 'Löschbarer Archivtest',
      });
    expect(draft.status).toBe(201);
    const reader = await createReadOnlyAgent();
    const forbiddenDelete = await reader
      .delete(`/api/v1/organizations/${organizationId}/documents/${draft.body.id as string}`)
      .send({ revision: draft.body.revision });
    expect(forbiddenDelete.status).toBe(403);
    const deleted = await administratorAgent
      .delete(`/api/v1/organizations/${organizationId}/documents/${draft.body.id as string}`)
      .send({ revision: draft.body.revision });
    expect(deleted.status).toBe(204);
    expect(
      await prisma.database.document.findUnique({ where: { id: draft.body.id as string } }),
    ).toBeNull();

    const issued = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({ type: 'OFFER', templateId: template.body.id, dealId, title: 'Archiviertes Angebot' });
    expect(issued.status).toBe(201);
    const completedIssued = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}`)
      .send(updateBody(issued.body, { validUntil: '2099-04-30' }));
    expect(completedIssued.status).toBe(200);
    const published = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/publish`)
      .send({ revision: completedIssued.body.revision });
    expect(published.body).toMatchObject({ status: 'UEBERGEBEN', publishedVersion: 1 });
    const versionId = published.body.versions[0].id as string;
    const versionBeforeArchive = await prisma.database.documentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });

    const forbiddenArchive = await reader
      .post(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/archive`)
      .send({ revision: published.body.revision });
    expect(forbiddenArchive.status).toBe(403);
    const inaccessibleArchive = await restrictedAgent
      .post(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/archive`)
      .send({ revision: published.body.revision });
    expect(inaccessibleArchive.status).toBe(404);

    const archived = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/archive`)
      .send({ revision: published.body.revision });
    expect(archived.body).toMatchObject({ status: 'ARCHIVIERT', publishedVersion: 1 });
    const standardList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/documents`,
    );
    expect(standardList.body).not.toContainEqual(expect.objectContaining({ id: issued.body.id }));
    const archiveList = await administratorAgent
      .get(`/api/v1/organizations/${organizationId}/documents`)
      .query({ status: 'ARCHIVIERT' });
    expect(archiveList.body).toContainEqual(
      expect.objectContaining({ id: issued.body.id, status: 'ARCHIVIERT' }),
    );
    const archivedPdf = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/versions/${versionId}/pdf`,
    );
    expect(archivedPdf.status).toBe(200);

    const restored = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/documents/${issued.body.id as string}/restore`)
      .send({ revision: archived.body.revision });
    expect(restored.body).toMatchObject({ status: 'UEBERGEBEN', publishedVersion: 1 });
    expect(restored.body.versions).toHaveLength(1);
    expect(
      await prisma.database.documentVersion.findUniqueOrThrow({ where: { id: versionId } }),
    ).toMatchObject({
      pdfSha256: versionBeforeArchive.pdfSha256,
      pdfData: versionBeforeArchive.pdfData,
    });
    const auditActions = await prisma.database.auditLog.findMany({
      where: { organizationId, targetId: issued.body.id as string },
      select: { action: true },
    });
    expect(auditActions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['document.archived', 'document.restored']),
    );
  });

  it('keeps a program item label separate from its editable Ablauf note', async () => {
    const createdProgramItem = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/program-items`)
      .send({
        kind: 'BREAK',
        label: 'Umbauzeit',
        note: 'Hocker bereitstellen',
        durationMinutes: 10,
      });
    expect(createdProgramItem.status).toBe(201);
    expect(createdProgramItem.body).toMatchObject({
      label: 'Umbauzeit',
      note: 'Hocker bereitstellen',
    });

    const updatedProgramItem = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/program-items/${createdProgramItem.body.id as string}`,
      )
      .send({
        version: createdProgramItem.body.version,
        note: 'Gitarre vorbereiten und Hocker bereitstellen',
      });
    expect(updatedProgramItem.status).toBe(200);
    expect(updatedProgramItem.body).toMatchObject({
      label: 'Umbauzeit',
      note: 'Gitarre vorbereiten und Hocker bereitstellen',
    });

    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/document-templates`)
      .send({
        name: 'Ablauf mit Notizen',
        type: 'PRODUCTION_INFORMATION',
        title: 'Ablauf mit Notizen',
        blocks: [],
        footer: null,
      });
    expect(template.status).toBe(201);
    const document = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/documents`)
      .send({ type: 'PRODUCTION_INFORMATION', templateId: template.body.id });
    expect(document.status).toBe(201);
    const program = (
      document.body.contextSnapshot as {
        program: Array<{ programItemId: string; label?: string | null; note?: string | null }>;
      }
    ).program;
    expect(program).toContainEqual(
      expect.objectContaining({
        programItemId: createdProgramItem.body.id,
        label: 'Umbauzeit',
        note: 'Gitarre vorbereiten und Hocker bereitstellen',
      }),
    );

    const preview = await administratorAgent.post(
      `/api/v1/organizations/${organizationId}/documents/${document.body.id as string}/preview`,
    );
    expect(preview.status).toBe(200);
    const pdfText = Buffer.from(preview.body).toString('latin1');
    expect(pdfText).toContain('Umbauzeit');
    expect(pdfText).toContain('Gitarre vorbereiten und Hocker bereitstellen');
  });

  async function createRestrictedAgent() {
    const created = await auth.auth.api.createUser({
      body: { name: 'Phase Ten Restricted', email: 'phase10-restricted@example.test', password },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: created.user.id },
        data: { emailVerified: true },
      });
      const role = await transaction.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: 'management_finance' } },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: created.user.id, locationScope: 'SELECTED' },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
      await transaction.membershipLocation.create({
        data: { organizationId, membershipId: membership.id, locationId: otherLocationId },
      });
    });
    const agent = request.agent(application.getHttpServer());
    expect((await signInAs(agent, 'phase10-restricted@example.test')).status).toBe(200);
    return agent;
  }

  async function createReadOnlyAgent() {
    const created = await auth.auth.api.createUser({
      body: { name: 'Phase Ten Read Only', email: 'phase10-readonly@example.test', password },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: created.user.id },
        data: { emailVerified: true },
      });
      const role = await transaction.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: 'read_only' } },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: created.user.id, locationScope: 'ALL' },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
    });
    const agent = request.agent(application.getHttpServer());
    expect((await signInAs(agent, 'phase10-readonly@example.test')).status).toBe(200);
    return agent;
  }
});

function updateBody(document: Record<string, unknown>, changes: Record<string, unknown> = {}) {
  return {
    revision: document.revision,
    title: document.title,
    introduction: document.introduction,
    blocks: document.blocks,
    standardTerms: document.standardTerms,
    closing: document.closing,
    footer: document.footer,
    recipientName: document.recipientName,
    recipientContactName: document.recipientContactName,
    recipientEmail: document.recipientEmail,
    recipientAddress: document.recipientAddress,
    validUntil: document.validUntil,
    internalNote: document.internalNote,
    totalDiscountType: document.totalDiscountType,
    totalDiscountFixedMinor: document.totalDiscountFixedMinor,
    totalDiscountPercentageBasisPoints: document.totalDiscountPercentageBasisPoints,
    positions: Array.isArray(document.positions)
      ? document.positions.map((position) => positionInput(position as Record<string, unknown>))
      : [],
    ...changes,
  };
}

function positionInput(position: Record<string, unknown>, changes: Record<string, unknown> = {}) {
  return {
    id: position.id,
    source: position.source,
    description: position.description,
    quantity: position.quantity,
    unitPriceNetMinor: position.unitPriceNetMinor,
    taxRateBasisPoints: position.taxRateBasisPoints,
    discountType: position.discountType,
    discountFixedMinor: position.discountFixedMinor,
    discountPercentageBasisPoints: position.discountPercentageBasisPoints,
    ...changes,
  };
}

async function signInAs(agent: ReturnType<typeof request.agent>, email: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}
