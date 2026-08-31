import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { ACTIVE_BOOKING_STATUSES } from '../../bookings/domain/booking.rules.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DealService } from '../../deals/application/deal.service.js';
import type { DealDto } from '../../deals/presentation/deal.dto.js';
import type { AccessContext } from '../../security/access.types.js';
import { normalizeQuantity } from '../../services/domain/service-calculation.rules.js';
import {
  assertDocumentStatusTransition,
  canDeleteDocumentDraft,
  calculateOffer,
  cleanDocumentText,
  differsFromSource,
  DocumentValidationError,
  draftStatusAfterEdit,
  isOfferExpired,
  normalizeTemplateName,
  publishedStatus,
  type DocumentStatus,
  type DocumentType,
} from '../domain/document.rules.js';
import {
  renderDocumentPdf,
  type DocumentPdfModel,
} from '../infrastructure/document-pdf.renderer.js';
import type {
  CreateDocumentDto,
  DocumentDto,
  DocumentTemplateDto,
  DocumentTemplateInputDto,
  DocumentVersionDto,
  OfferPositionInputDto,
  UpdateDocumentDto,
} from '../presentation/document.dto.js';

const documentInclude = {
  event: { select: { name: true, eventDate: true } },
  location: { select: { name: true } },
  blocks: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  offerPositions: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  versions: {
    orderBy: [{ documentVersion: 'desc' as const }],
    select: {
      id: true,
      documentVersion: true,
      documentNumber: true,
      status: true,
      snapshot: true,
      pdfSha256: true,
      pdfSize: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DocumentInclude;

const templateInclude = {
  blocks: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DocumentTemplateInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;
type TemplateRow = Prisma.DocumentTemplateGetPayload<{ include: typeof templateInclude }>;
type Database = TransactionClient | PrismaService['database'];

interface NormalizedPosition {
  source: 'DEAL_COMPONENT' | 'DEAL_SERVICE' | 'CUSTOM';
  sourceId: string | null;
  sourceSnapshot: Prisma.InputJsonValue | typeof Prisma.DbNull;
  description: string;
  quantity: string;
  unitPriceNetMinor: bigint;
  taxRateBasisPoints: number;
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountFixedMinor: bigint | null;
  discountPercentageBasisPoints: number | null;
  sortOrder: number;
}

interface SnapshotArtist {
  stageName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface DocumentSnapshotContext {
  organization: {
    name: string;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  location: { name: string };
  event: {
    name: string;
    eventDate: string;
    technicalGetInTime?: string | null;
    artistGetInTime?: string | null;
    doorsTime?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    endNextDay?: boolean;
  };
  program?: Array<{
    programItemId?: string;
    kind?: 'PERFORMANCE' | 'BREAK';
    label?: string | null;
    note?: string | null;
    startTime?: string | null;
    durationMinutes?: number | null;
    booking?: { artist: SnapshotArtist } | null;
  }>;
}

interface PdfSnapshotPosition {
  description: string;
  quantity: string;
  unitPriceNetMinor: string;
  discountNetMinor: string;
  taxRateBasisPoints: number;
  totalNetMinor: string;
}

@Injectable()
export class DocumentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(DealService) private readonly deals: DealService,
  ) {}

  async listTemplates(
    access: AccessContext,
    status: 'ACTIVE' | 'ARCHIVED' | 'ALL',
    type?: DocumentType,
  ): Promise<DocumentTemplateDto[]> {
    const rows = await this.prisma.database.documentTemplate.findMany({
      where: {
        organizationId: access.organizationId,
        ...(status === 'ALL' ? {} : { status }),
        ...(type ? { type } : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: templateInclude,
    });
    return rows.map((row) => this.mapTemplate(row));
  }

  async findTemplate(access: AccessContext, id: string): Promise<DocumentTemplateDto> {
    return this.mapTemplate(await this.requireTemplate(this.prisma.database, access, id, false));
  }

  async createTemplate(
    access: AccessContext,
    input: DocumentTemplateInputDto,
  ): Promise<DocumentTemplateDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const values = this.templateValues(input);
        const row = await transaction.documentTemplate.create({
          data: { organizationId: access.organizationId, ...values.template },
          select: { id: true },
        });
        if (values.blocks.length) {
          await transaction.documentTemplateBlock.createMany({
            data: values.blocks.map((block) => ({
              organizationId: access.organizationId,
              templateId: row.id,
              ...block,
            })),
          });
        }
        await this.audit.append(
          transaction,
          access,
          'document_template.created',
          'document_template',
          row.id,
          { type: input.type, blockCount: values.blocks.length },
        );
        return this.mapTemplate(
          await transaction.documentTemplate.findUniqueOrThrow({
            where: { id: row.id, organizationId: access.organizationId },
            include: templateInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error, true);
    }
  }

  async updateTemplate(
    access: AccessContext,
    id: string,
    version: number,
    input: DocumentTemplateInputDto,
  ): Promise<DocumentTemplateDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireTemplate(transaction, access, id, false);
        if (current.version !== version) this.versionConflict();
        const values = this.templateValues(input);
        const updated = await transaction.documentTemplate.updateMany({
          where: { id, organizationId: access.organizationId, version },
          data: { ...values.template, version: { increment: 1 } },
        });
        if (updated.count !== 1) this.versionConflict();
        await transaction.documentTemplateBlock.deleteMany({
          where: { organizationId: access.organizationId, templateId: id },
        });
        if (values.blocks.length) {
          await transaction.documentTemplateBlock.createMany({
            data: values.blocks.map((block) => ({
              organizationId: access.organizationId,
              templateId: id,
              ...block,
            })),
          });
        }
        await this.audit.append(
          transaction,
          access,
          'document_template.updated',
          'document_template',
          id,
          { type: input.type, replacedSnapshot: true },
        );
        return this.mapTemplate(
          await transaction.documentTemplate.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: templateInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error, true);
    }
  }

  async setTemplateStatus(
    access: AccessContext,
    id: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<DocumentTemplateDto> {
    return this.prisma.transaction(async (transaction) => {
      const current = await this.requireTemplate(transaction, access, id, false);
      if (current.version !== version) this.versionConflict();
      const updated = await transaction.documentTemplate.updateMany({
        where: { id, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) this.versionConflict();
      await this.audit.append(
        transaction,
        access,
        status === 'ARCHIVED' ? 'document_template.archived' : 'document_template.reactivated',
        'document_template',
        id,
        { status },
      );
      return this.mapTemplate(
        await transaction.documentTemplate.findUniqueOrThrow({
          where: { id, organizationId: access.organizationId },
          include: templateInclude,
        }),
      );
    });
  }

  async list(
    access: AccessContext,
    filters: {
      type?: DocumentType;
      status?: DocumentStatus;
      eventId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<DocumentDto[]> {
    const rows = await this.prisma.database.document.findMany({
      where: {
        organizationId: access.organizationId,
        ...this.locationWhere(access),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : { status: { not: 'ARCHIVIERT' } }),
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
                ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: documentInclude,
    });
    return rows.map((row) => this.mapDocument(row));
  }

  async listForEvent(access: AccessContext, eventId: string): Promise<DocumentDto[]> {
    await this.requireEvent(this.prisma.database, access, eventId);
    return this.list(access, { eventId });
  }

  async find(access: AccessContext, id: string): Promise<DocumentDto> {
    return this.mapDocument(await this.requireDocument(this.prisma.database, access, id));
  }

  async create(
    access: AccessContext,
    eventId: string,
    input: CreateDocumentDto,
  ): Promise<DocumentDto> {
    try {
      const deal = input.type === 'OFFER' ? await this.deals.findForEvent(access, eventId) : null;
      if (input.dealId && deal?.id !== input.dealId) {
        this.notFound(
          'DEAL_NOT_FOUND',
          'Der ausgewählte Deal gehört nicht zu dieser Veranstaltung',
        );
      }
      return await this.prisma.transaction(async (transaction) => {
        const event = await this.requireEvent(transaction, access, eventId);
        const template = await this.requireTemplate(transaction, access, input.templateId, true);
        if (template.type !== input.type) {
          throw new DocumentValidationError(
            'DOCUMENT_TEMPLATE_TYPE_MISMATCH',
            'Die Vorlage passt nicht zum Dokumenttyp',
          );
        }
        const contextSnapshot =
          input.type === 'OFFER'
            ? await this.offerContext(transaction, access, event, deal!)
            : await this.productionContext(transaction, access, event);
        const id = randomUUID();
        const recipient =
          input.type === 'OFFER' ? await this.offerRecipient(transaction, access, deal!) : null;
        await transaction.document.create({
          data: {
            id,
            organizationId: access.organizationId,
            locationId: event.locationId,
            eventId,
            dealId: deal?.id ?? null,
            sourceTemplateId: template.id,
            sourceTemplateVersion: template.version,
            sourceTemplateNameSnapshot: template.name,
            type: input.type,
            documentNumber: null,
            title: cleanDocumentText(
              input.title ?? this.defaultDocumentTitle(input.type, event.name),
              'Der Dokumenttitel',
              300,
              true,
            )!,
            introduction: template.introduction,
            standardTerms: template.standardTerms,
            closing: template.closing,
            footer: template.footer,
            recipientName: recipient?.name ?? null,
            recipientContactName: recipient?.contactName ?? null,
            recipientEmail: recipient?.email ?? null,
            recipientAddress: recipient?.address ?? null,
            contextSnapshot,
            ...(deal ? this.documentDiscountData(deal) : {}),
          },
        });
        if (template.blocks.length) {
          await transaction.documentContentBlock.createMany({
            data: template.blocks.map((block) => ({
              organizationId: access.organizationId,
              documentId: id,
              heading: block.heading,
              body: block.body,
              sortOrder: block.sortOrder,
            })),
          });
        }
        if (deal) {
          const positions = this.positionsFromDeal(deal);
          if (positions.length) {
            await transaction.documentOfferPosition.createMany({
              data: positions.map((position) => ({
                organizationId: access.organizationId,
                documentId: id,
                ...position,
              })),
            });
          }
        }
        await this.audit.append(transaction, access, 'document.created', 'document', id, {
          eventId,
          type: input.type,
          sourceTemplateId: template.id,
          sourceTemplateVersion: template.version,
          dealId: deal?.id ?? null,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async update(access: AccessContext, id: string, input: UpdateDocumentDto): Promise<DocumentDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== input.revision) this.versionConflict();
        const contextSnapshot =
          current.type === 'PRODUCTION_INFORMATION'
            ? await this.productionContext(
                transaction,
                access,
                await this.requireEvent(transaction, access, current.eventId),
              )
            : undefined;
        const blocks = input.blocks.map((block, sortOrder) => ({
          heading: cleanDocumentText(block.heading, 'Die Blocküberschrift', 200, true)!,
          body: cleanDocumentText(block.body, 'Der Blockinhalt', 20_000) ?? '',
          sortOrder,
        }));
        const positions = this.normalizePositions(current, input.positions);
        if (current.type === 'PRODUCTION_INFORMATION' && positions.length) {
          throw new DocumentValidationError(
            'PRODUCTION_FINANCE_FORBIDDEN',
            'Abläufe dürfen keine Angebotspositionen enthalten',
          );
        }
        if (current.type === 'OFFER') {
          calculateOffer(
            positions.map((position) => ({
              quantity: position.quantity,
              unitPriceNetMinor: position.unitPriceNetMinor,
              taxRateBasisPoints: position.taxRateBasisPoints,
              discount: this.discountFromPosition(position),
            })),
            this.discountFromInput(input),
          );
        }
        const nextStatus = draftStatusAfterEdit(current.type, current.status);
        const updated = await transaction.document.updateMany({
          where: { id, organizationId: access.organizationId, revision: input.revision },
          data: {
            status: nextStatus,
            title: cleanDocumentText(input.title, 'Der Dokumenttitel', 300, true)!,
            introduction:
              current.type === 'OFFER'
                ? cleanDocumentText(input.introduction, 'Die Einleitung')
                : current.introduction,
            standardTerms:
              current.type === 'OFFER'
                ? cleanDocumentText(input.standardTerms, 'Die Bedingungen')
                : current.standardTerms,
            closing:
              current.type === 'OFFER'
                ? cleanDocumentText(input.closing, 'Die Schlussformel')
                : current.closing,
            footer:
              current.type === 'OFFER'
                ? cleanDocumentText(input.footer, 'Die Fußzeile', 5_000)
                : current.footer,
            recipientName:
              current.type === 'OFFER'
                ? cleanDocumentText(input.recipientName, 'Der Empfänger', 200)
                : null,
            recipientContactName:
              current.type === 'OFFER'
                ? cleanDocumentText(input.recipientContactName, 'Der Ansprechpartner', 200)
                : null,
            recipientEmail: current.type === 'OFFER' ? input.recipientEmail?.trim() || null : null,
            recipientAddress:
              current.type === 'OFFER'
                ? cleanDocumentText(input.recipientAddress, 'Die Empfängeradresse', 5_000)
                : null,
            validUntil:
              current.type === 'OFFER' && input.validUntil
                ? new Date(`${input.validUntil}T00:00:00.000Z`)
                : null,
            internalNote:
              current.type === 'OFFER'
                ? cleanDocumentText(input.internalNote, 'Die interne Notiz')
                : current.internalNote,
            ...(contextSnapshot ? { contextSnapshot } : {}),
            ...(current.type === 'OFFER'
              ? this.totalDiscountData(
                  input.totalDiscountType ?? null,
                  input.totalDiscountFixedMinor ?? null,
                  input.totalDiscountPercentageBasisPoints ?? null,
                )
              : this.totalDiscountData(null, null, null)),
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        if (current.type === 'OFFER') {
          await transaction.documentContentBlock.deleteMany({
            where: { organizationId: access.organizationId, documentId: id },
          });
        }
        if (current.type === 'OFFER' && blocks.length) {
          await transaction.documentContentBlock.createMany({
            data: blocks.map((block) => ({
              organizationId: access.organizationId,
              documentId: id,
              ...block,
            })),
          });
        }
        await transaction.documentOfferPosition.deleteMany({
          where: { organizationId: access.organizationId, documentId: id },
        });
        if (positions.length) {
          await transaction.documentOfferPosition.createMany({
            data: positions.map((position) => ({
              organizationId: access.organizationId,
              documentId: id,
              ...position,
            })),
          });
        }
        if (current.status !== nextStatus) {
          await this.appendStatusHistory(transaction, access, id, current.status, nextStatus);
        }
        await this.audit.append(transaction, access, 'document.updated', 'document', id, {
          eventId: current.eventId,
          draftOnly: true,
          publishedVersion: current.publishedVersion,
          resetToDraft: current.status !== nextStatus,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async setStatus(
    access: AccessContext,
    id: string,
    revision: number,
    status: DocumentStatus,
  ): Promise<DocumentDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== revision) this.versionConflict();
        if (status === 'ARCHIVIERT') {
          throw new DocumentValidationError(
            'DOCUMENT_ARCHIVE_USE_ENDPOINT',
            'Dokumente werden über die Archivierungsaktion archiviert',
          );
        }
        assertDocumentStatusTransition(current.type, current.status, status);
        if (
          status === 'ABGELAUFEN' &&
          !isOfferExpired(current.type, current.status, current.validUntil)
        ) {
          throw new DocumentValidationError(
            'DOCUMENT_NOT_EXPIRED',
            'Das Angebot ist anhand seines Gültigkeitsdatums noch nicht abgelaufen',
          );
        }
        const documentNumber =
          current.type === 'OFFER' && status === 'ERSTELLT' && !current.documentNumber
            ? await this.allocateDocumentNumber(transaction, access.organizationId, current.type)
            : current.documentNumber;
        const updated = await transaction.document.updateMany({
          where: { id, organizationId: access.organizationId, revision },
          data: { status, documentNumber, revision: { increment: 1 } },
        });
        if (updated.count !== 1) this.versionConflict();
        await this.appendStatusHistory(transaction, access, id, current.status, status);
        await this.audit.append(transaction, access, 'document.status_changed', 'document', id, {
          previousStatus: current.status,
          newStatus: status,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async deleteDraft(access: AccessContext, id: string, revision: number): Promise<void> {
    try {
      await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== revision) this.versionConflict();
        if (!canDeleteDocumentDraft(current.status, current.versions.length)) {
          throw new DocumentValidationError(
            'DOCUMENT_DELETE_FORBIDDEN',
            'Nur nicht ausgegebene Dokumententwürfe dürfen endgültig gelöscht werden',
          );
        }
        await transaction.documentStatusHistory.deleteMany({
          where: { organizationId: access.organizationId, documentId: id },
        });
        await transaction.document.delete({ where: { id, organizationId: access.organizationId } });
        await this.audit.append(transaction, access, 'document.deleted', 'document', id, {
          eventId: current.eventId,
          type: current.type,
          draftOnly: true,
        });
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async archive(access: AccessContext, id: string, revision: number): Promise<DocumentDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== revision) this.versionConflict();
        if (current.status === 'ARCHIVIERT') {
          throw new DocumentValidationError(
            'DOCUMENT_ALREADY_ARCHIVED',
            'Das Dokument ist bereits archiviert',
          );
        }
        if (canDeleteDocumentDraft(current.status, current.versions.length)) {
          throw new DocumentValidationError(
            'DOCUMENT_DRAFT_MUST_BE_DELETED',
            'Nicht ausgegebene Dokumententwürfe werden gelöscht statt archiviert',
          );
        }
        const updated = await transaction.document.updateMany({
          where: { id, organizationId: access.organizationId, revision },
          data: { status: 'ARCHIVIERT', revision: { increment: 1 } },
        });
        if (updated.count !== 1) this.versionConflict();
        await this.appendStatusHistory(transaction, access, id, current.status, 'ARCHIVIERT');
        await this.audit.append(transaction, access, 'document.archived', 'document', id, {
          previousStatus: current.status,
          publishedVersion: current.publishedVersion,
          versionCount: current.versions.length,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async restore(access: AccessContext, id: string, revision: number): Promise<DocumentDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== revision) this.versionConflict();
        if (current.status !== 'ARCHIVIERT') {
          throw new DocumentValidationError(
            'DOCUMENT_NOT_ARCHIVED',
            'Das Dokument ist nicht archiviert',
          );
        }
        const archivedTransition = await transaction.documentStatusHistory.findFirst({
          where: { organizationId: access.organizationId, documentId: id, newStatus: 'ARCHIVIERT' },
          orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
          select: { previousStatus: true },
        });
        if (!archivedTransition || archivedTransition.previousStatus === 'ARCHIVIERT') {
          throw new DocumentValidationError(
            'DOCUMENT_RESTORE_UNAVAILABLE',
            'Der ursprüngliche Dokumentstatus kann nicht wiederhergestellt werden',
          );
        }
        const restoredStatus = archivedTransition.previousStatus;
        const updated = await transaction.document.updateMany({
          where: { id, organizationId: access.organizationId, revision },
          data: { status: restoredStatus, revision: { increment: 1 } },
        });
        if (updated.count !== 1) this.versionConflict();
        await this.appendStatusHistory(transaction, access, id, 'ARCHIVIERT', restoredStatus);
        await this.audit.append(transaction, access, 'document.restored', 'document', id, {
          restoredStatus,
          publishedVersion: current.publishedVersion,
          versionCount: current.versions.length,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async preview(access: AccessContext, id: string): Promise<{ pdf: Buffer; filename: string }> {
    const row = await this.requireDocument(this.prisma.database, access, id);
    this.assertPublishable(row, false);
    const version = Math.max(1, row.publishedVersion + 1);
    const snapshot = this.snapshot(row, version, row.status);
    return {
      pdf: renderDocumentPdf(this.pdfModel(snapshot)),
      filename: `${row.documentNumber ?? 'Entwurf'}-Vorschau.pdf`,
    };
  }

  async publish(access: AccessContext, id: string, revision: number): Promise<DocumentDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDocument(transaction, access, id);
        if (current.revision !== revision) this.versionConflict();
        this.assertPublishable(current, true);
        const targetStatus = publishedStatus(current.type);
        const nextVersion = current.publishedVersion + 1;
        const createdAt = new Date();
        const documentNumber =
          current.documentNumber ??
          (await this.allocateDocumentNumber(
            transaction,
            access.organizationId,
            current.type,
            createdAt,
          ));
        const snapshot = this.snapshot(
          current,
          nextVersion,
          targetStatus,
          createdAt,
          documentNumber,
        );
        const pdf = renderDocumentPdf(this.pdfModel(snapshot));
        const sha256 = createHash('sha256').update(pdf).digest('hex');
        const updated = await transaction.document.updateMany({
          where: { id, organizationId: access.organizationId, revision },
          data: {
            status: targetStatus,
            documentNumber,
            publishedVersion: nextVersion,
            lastPublishedAt: createdAt,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await transaction.documentVersion.create({
          data: {
            organizationId: access.organizationId,
            documentId: id,
            documentVersion: nextVersion,
            documentNumber,
            status: targetStatus,
            snapshot,
            pdfData: Uint8Array.from(pdf),
            pdfSha256: sha256,
            pdfSize: pdf.length,
            createdByUserId: access.user.id,
            createdByMembershipId: access.membershipId,
            createdAt,
          },
        });
        await this.appendStatusHistory(transaction, access, id, current.status, targetStatus);
        await this.audit.append(transaction, access, 'document.published', 'document', id, {
          eventId: current.eventId,
          type: current.type,
          documentVersion: nextVersion,
          status: targetStatus,
          pdfSha256: sha256,
          pdfSize: pdf.length,
        });
        return this.mapDocument(
          await transaction.document.findUniqueOrThrow({
            where: { id, organizationId: access.organizationId },
            include: documentInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async downloadVersion(
    access: AccessContext,
    documentId: string,
    versionId: string,
  ): Promise<{ pdf: Buffer; filename: string; sha256: string }> {
    await this.requireDocument(this.prisma.database, access, documentId);
    const version = await this.prisma.database.documentVersion.findFirst({
      where: { id: versionId, documentId, organizationId: access.organizationId },
      select: { pdfData: true, pdfSha256: true, documentNumber: true, documentVersion: true },
    });
    if (!version)
      this.notFound('DOCUMENT_VERSION_NOT_FOUND', 'Die Dokumentversion wurde nicht gefunden');
    return {
      pdf: Buffer.from(version!.pdfData),
      filename: `${version!.documentNumber}-v${version!.documentVersion}.pdf`,
      sha256: version!.pdfSha256,
    };
  }

  private templateValues(input: DocumentTemplateInputDto) {
    const name = normalizeTemplateName(input.name);
    return {
      template: {
        ...name,
        type: input.type,
        title: cleanDocumentText(input.title, 'Der Dokumenttitel', 300, true)!,
        introduction: cleanDocumentText(input.introduction, 'Die Einleitung'),
        standardTerms: cleanDocumentText(input.standardTerms, 'Die Bedingungen'),
        closing: cleanDocumentText(input.closing, 'Die Schlussformel'),
        footer: cleanDocumentText(input.footer, 'Die Fußzeile', 5_000),
      },
      blocks: input.blocks.map((block, sortOrder) => ({
        heading: cleanDocumentText(block.heading, 'Die Blocküberschrift', 200, true)!,
        body: cleanDocumentText(block.body, 'Der Blockinhalt', 20_000) ?? '',
        sortOrder,
      })),
    };
  }

  private positionsFromDeal(deal: DealDto): NormalizedPosition[] {
    const positions: NormalizedPosition[] = [];
    for (const component of deal.components.filter((item) => item.type === 'FIXED_RENT')) {
      const unitPriceNetMinor = BigInt(component.amountNetMinor ?? '0');
      const snapshot = {
        componentType: component.type,
        description: component.label,
        quantity: '1',
        unitPriceNetMinor: unitPriceNetMinor.toString(),
        taxRateBasisPoints: component.taxRateBasisPoints,
        discountType: null,
        discountFixedMinor: null,
        discountPercentageBasisPoints: null,
      };
      positions.push({
        source: 'DEAL_COMPONENT',
        sourceId: component.id,
        sourceSnapshot: snapshot,
        description: snapshot.description,
        quantity: snapshot.quantity,
        unitPriceNetMinor,
        taxRateBasisPoints: snapshot.taxRateBasisPoints,
        discountType: snapshot.discountType,
        discountFixedMinor: snapshot.discountFixedMinor,
        discountPercentageBasisPoints: snapshot.discountPercentageBasisPoints,
        sortOrder: positions.length,
      });
    }
    for (const service of deal.servicePositions) {
      const included = service.billingMode === 'INCLUDED';
      const snapshot = {
        billingMode: service.billingMode,
        description: included ? `${service.name} (enthalten)` : service.name,
        quantity: normalizeQuantity(service.quantity),
        unitPriceNetMinor: included ? '0' : service.salesUnitPriceNetMinor,
        taxRateBasisPoints: service.taxRateBasisPoints,
        discountType: included ? null : service.discountType,
        discountFixedMinor: included ? null : service.discountFixedMinor,
        discountPercentageBasisPoints: included ? null : service.discountPercentageBasisPoints,
      };
      positions.push({
        source: 'DEAL_SERVICE',
        sourceId: service.id,
        sourceSnapshot: snapshot,
        description: snapshot.description,
        quantity: snapshot.quantity,
        unitPriceNetMinor: BigInt(snapshot.unitPriceNetMinor),
        taxRateBasisPoints: snapshot.taxRateBasisPoints,
        discountType: snapshot.discountType,
        discountFixedMinor: snapshot.discountFixedMinor
          ? BigInt(snapshot.discountFixedMinor)
          : null,
        discountPercentageBasisPoints: snapshot.discountPercentageBasisPoints,
        sortOrder: positions.length,
      });
    }
    return positions;
  }

  private normalizePositions(
    current: DocumentRow,
    input: OfferPositionInputDto[],
  ): NormalizedPosition[] {
    const existing = new Map(current.offerPositions.map((position) => [position.id, position]));
    return input.map((position, sortOrder) => {
      const source = position.id ? existing.get(position.id) : undefined;
      if (position.source !== 'CUSTOM' && !source) {
        throw new DocumentValidationError(
          'DOCUMENT_POSITION_SOURCE_INVALID',
          'Quellpositionen müssen aus dem bestehenden Dokument übernommen werden',
        );
      }
      if (source && source.source !== position.source) {
        throw new DocumentValidationError(
          'DOCUMENT_POSITION_SOURCE_INVALID',
          'Die Herkunft einer Angebotsposition kann nicht geändert werden',
        );
      }
      const discount = this.discountData(
        position.discountType ?? null,
        position.discountFixedMinor ?? null,
        position.discountPercentageBasisPoints ?? null,
      );
      return {
        source: position.source,
        sourceId: source?.sourceId ?? null,
        sourceSnapshot: source?.sourceSnapshot
          ? (source.sourceSnapshot as Prisma.InputJsonValue)
          : Prisma.DbNull,
        description: cleanDocumentText(
          position.description,
          'Die Positionsbezeichnung',
          300,
          true,
        )!,
        quantity: normalizeQuantity(position.quantity),
        unitPriceNetMinor: BigInt(position.unitPriceNetMinor),
        taxRateBasisPoints: position.taxRateBasisPoints,
        ...discount,
        sortOrder,
      };
    });
  }

  private async offerContext(
    transaction: TransactionClient,
    access: AccessContext,
    event: Awaited<ReturnType<DocumentService['requireEvent']>>,
    deal: DealDto,
  ): Promise<Prisma.InputJsonObject> {
    const organization = await transaction.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { name: true, legalName: true, email: true, phone: true },
    });
    return {
      organization: this.jsonObject(organization),
      location: this.jsonObject(event.location),
      event: this.eventSnapshot(event),
      deal: {
        id: deal.id,
        version: deal.version,
        customerName: deal.customerName,
        contactName: deal.contactName,
      },
    };
  }

  private async productionContext(
    transaction: TransactionClient,
    access: AccessContext,
    event: Awaited<ReturnType<DocumentService['requireEvent']>>,
  ): Promise<Prisma.InputJsonObject> {
    const organization = await transaction.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { name: true },
    });
    const program = await transaction.eventProgramItem.findMany({
      where: {
        organizationId: access.organizationId,
        eventId: event.id,
        OR: [{ kind: 'BREAK' }, { booking: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        kind: true,
        sortOrder: true,
        label: true,
        note: true,
        durationMinutes: true,
        booking: {
          select: {
            performanceStartMinutes: true,
            performanceDurationMinutes: true,
            artist: { select: { stageName: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    let cursor = event.startMinutes;
    const schedule = program.map((item) => {
      const startMinutes = item.booking?.performanceStartMinutes ?? cursor;
      const durationMinutes =
        item.durationMinutes ?? item.booking?.performanceDurationMinutes ?? null;
      if (startMinutes !== null && durationMinutes !== null)
        cursor = startMinutes + durationMinutes;
      return {
        programItemId: item.id,
        kind: item.kind,
        label: item.label,
        note: item.note,
        startTime: minutesToTime(startMinutes),
        durationMinutes,
        booking: item.booking ? { artist: item.booking.artist } : null,
      };
    });
    return {
      organization: this.jsonObject(organization),
      location: { name: event.location.name },
      event: {
        name: event.name,
        eventDate: event.eventDate.toISOString().slice(0, 10),
        technicalGetInTime: minutesToTime(event.technicalGetInMinutes),
        artistGetInTime: minutesToTime(event.artistGetInMinutes),
        doorsTime: minutesToTime(event.doorsMinutes),
        startTime: minutesToTime(event.startMinutes),
        endTime: minutesToTime(event.endMinutes),
        endNextDay:
          event.endMinutes !== null && event.startMinutes !== null
            ? event.endMinutes <= event.startMinutes
            : false,
      },
      program: schedule.map((item) => this.jsonObject(item)),
    };
  }

  private async offerRecipient(
    transaction: TransactionClient,
    access: AccessContext,
    deal: DealDto,
  ) {
    const row = await transaction.deal.findFirstOrThrow({
      where: { id: deal.id, organizationId: access.organizationId },
      select: {
        businessPartner: {
          select: {
            companyName: true,
            email: true,
            billingAddressLine1: true,
            billingAddressLine2: true,
            billingPostalCode: true,
            billingCity: true,
            billingCountryCode: true,
            addressLine1: true,
            addressLine2: true,
            postalCode: true,
            city: true,
            countryCode: true,
          },
        },
        contact: { select: { firstName: true, lastName: true, label: true, email: true } },
      },
    });
    const partner = row.businessPartner;
    const contact = row.contact;
    return {
      name: partner.companyName,
      contactName: contact ? this.contactName(contact) : null,
      email: contact?.email ?? partner.email,
      address: [
        partner.billingAddressLine1 ?? partner.addressLine1,
        partner.billingAddressLine2 ?? partner.addressLine2,
        [partner.billingPostalCode ?? partner.postalCode, partner.billingCity ?? partner.city]
          .filter(Boolean)
          .join(' '),
        partner.billingCountryCode ?? partner.countryCode,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private snapshot(
    row: DocumentRow,
    documentVersion: number,
    status: DocumentStatus,
    createdAt = new Date(),
    documentNumber: string | null = row.documentNumber,
  ): Prisma.InputJsonObject {
    const mapped = this.mapDocument(row);
    return {
      schemaVersion: 1,
      organizationId: row.organizationId,
      documentId: row.id,
      documentNumber,
      documentVersion,
      status,
      createdAt: createdAt.toISOString(),
      type: row.type,
      sourceTemplate: {
        id: row.sourceTemplateId,
        version: row.sourceTemplateVersion,
        name: row.sourceTemplateNameSnapshot,
      },
      title: mapped.title,
      introduction: mapped.introduction,
      blocks: this.jsonValue(mapped.blocks),
      standardTerms: mapped.standardTerms,
      closing: mapped.closing,
      footer: mapped.footer,
      internalNote: row.type === 'OFFER' ? row.internalNote : null,
      recipient:
        row.type === 'OFFER'
          ? {
              name: row.recipientName,
              contactName: row.recipientContactName,
              email: row.recipientEmail,
              address: row.recipientAddress,
            }
          : null,
      validUntil: mapped.validUntil,
      context: row.contextSnapshot as Prisma.InputJsonValue,
      ...(row.type === 'OFFER'
        ? {
            positions: mapped.positions.map((position) => ({
              id: position.id,
              source: position.source,
              sourceId: position.sourceId,
              description: position.description,
              quantity: position.quantity,
              unitPriceNetMinor: position.unitPriceNetMinor,
              taxRateBasisPoints: position.taxRateBasisPoints,
              discountType: position.discountType,
              discountFixedMinor: position.discountFixedMinor,
              discountPercentageBasisPoints: position.discountPercentageBasisPoints,
              sortOrder: position.sortOrder,
              differsFromSource: position.differsFromSource,
              subtotalNetMinor: position.subtotalNetMinor,
              discountNetMinor: position.discountNetMinor,
              totalNetMinor: position.totalNetMinor,
              taxMinor: position.taxMinor,
              totalGrossMinor: position.totalGrossMinor,
            })),
            totals: this.jsonValue(mapped.totals),
            currency: row.currency,
          }
        : { positions: [] }),
    };
  }

  private pdfModel(snapshot: Prisma.InputJsonObject): DocumentPdfModel {
    const context = snapshot.context as unknown as DocumentSnapshotContext;
    const event = context.event;
    const location = context.location;
    const organization = context.organization;
    const recipient = snapshot.recipient as DocumentPdfModel['recipient'];
    const positions = snapshot.positions as unknown as PdfSnapshotPosition[];
    const totals = snapshot.totals as DocumentPdfModel['totals'];
    const localTimes = [
      ['Get-in Technik', event.technicalGetInTime],
      ['Get-in Artists', event.artistGetInTime],
      ['Einlass', event.doorsTime],
      ['Beginn', event.startTime],
      ['Ende', event.endTime ? `${event.endTime}${event.endNextDay ? ' (+1 Tag)' : ''}` : null],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([label, value]) => ({ label, value }));
    const scheduleRows = (context.program ?? []).map((item) => ({
      startTime: item.startTime ?? null,
      label:
        item.label ??
        (item.booking
          ? this.artistName(item.booking.artist)
          : item.kind === 'BREAK'
            ? 'Pause'
            : 'Auftritt'),
      note: item.note ?? null,
      durationMinutes: item.durationMinutes ?? null,
      kind: item.kind ?? 'PERFORMANCE',
    }));
    return {
      type: snapshot.type as DocumentType,
      documentNumber: (snapshot.documentNumber as string | null) ?? null,
      version: snapshot.documentVersion as number,
      status: snapshot.status as string,
      createdAt: snapshot.createdAt as string,
      title: snapshot.title as string,
      organizationName: (organization.legalName ?? organization.name) as string,
      organizationContact: [organization.email, organization.phone].filter(Boolean).join(' | '),
      eventName: event.name,
      eventDate: event.eventDate,
      locationName: location.name,
      localTimes: snapshot.type === 'OFFER' ? localTimes : [],
      recipient: recipient ?? null,
      validUntil: snapshot.validUntil as string | null,
      introduction: snapshot.type === 'OFFER' ? (snapshot.introduction as string | null) : null,
      blocks:
        snapshot.type === 'OFFER'
          ? (snapshot.blocks as Array<{ heading: string; body: string }>)
          : [],
      positions: positions.map((position, index) => ({
        position: index + 1,
        description: position.description,
        quantity: position.quantity,
        unitPriceNetMinor: position.unitPriceNetMinor,
        discountNetMinor: position.discountNetMinor,
        taxRateBasisPoints: position.taxRateBasisPoints,
        totalNetMinor: position.totalNetMinor,
      })),
      totals,
      standardTerms: snapshot.type === 'OFFER' ? (snapshot.standardTerms as string | null) : null,
      closing: snapshot.type === 'OFFER' ? (snapshot.closing as string | null) : null,
      footer: snapshot.footer as string | null,
      scheduleRows: snapshot.type === 'PRODUCTION_INFORMATION' ? scheduleRows : [],
    };
  }

  private assertPublishable(row: DocumentRow, final: boolean): void {
    if (row.type === 'OFFER') {
      const offerPositions = this.externalOfferPositions(row);
      if (!row.recipientName || !row.validUntil || offerPositions.length === 0) {
        throw new DocumentValidationError(
          'DOCUMENT_INCOMPLETE',
          'Empfänger, Gültigkeitsdatum und mindestens eine Angebotsposition sind erforderlich',
        );
      }
      if (
        isOfferExpired(row.type, row.status, row.validUntil) ||
        row.validUntil.getTime() < startOfToday()
      ) {
        throw new DocumentValidationError(
          'DOCUMENT_EXPIRED',
          'Ein abgelaufenes Angebot kann nicht übergeben werden',
        );
      }
      calculateOffer(
        offerPositions.map((position) => ({
          quantity: position.quantity.toString(),
          unitPriceNetMinor: position.unitPriceNetMinor,
          taxRateBasisPoints: position.taxRateBasisPoints,
          discount: this.discountFromPosition(position),
        })),
        this.discountFromDocument(row),
      );
      if (final && !['ENTWURF', 'ERSTELLT'].includes(row.status)) {
        throw new DocumentValidationError(
          'DOCUMENT_PUBLISH_STATUS_INVALID',
          'Nur ein Angebotsentwurf kann übergeben werden',
        );
      }
    } else if (final && row.status !== 'ENTWURF') {
      throw new DocumentValidationError(
        'DOCUMENT_PUBLISH_STATUS_INVALID',
        'Nur ein Entwurf kann freigegeben werden',
      );
    }
  }

  private mapDocument(row: DocumentRow): DocumentDto {
    const offerPositions = this.externalOfferPositions(row);
    const totals =
      row.type === 'OFFER'
        ? calculateOffer(
            offerPositions.map((position) => ({
              quantity: position.quantity.toString(),
              unitPriceNetMinor: position.unitPriceNetMinor,
              taxRateBasisPoints: position.taxRateBasisPoints,
              discount: this.discountFromPosition(position),
            })),
            this.discountFromDocument(row),
          )
        : null;
    const expired = isOfferExpired(row.type, row.status, row.validUntil);
    return {
      id: row.id,
      organizationId: row.organizationId,
      locationId: row.locationId,
      eventId: row.eventId,
      eventName: row.event.name,
      eventDate: row.event.eventDate.toISOString().slice(0, 10),
      locationName: row.location.name,
      dealId: row.dealId,
      sourceTemplateId: row.sourceTemplateId,
      sourceTemplateVersion: row.sourceTemplateVersion,
      sourceTemplateName: row.sourceTemplateNameSnapshot,
      type: row.type,
      status: row.status,
      effectiveStatus: expired ? 'ABGELAUFEN' : row.status,
      expired,
      documentNumber: row.documentNumber,
      publishedVersion: row.publishedVersion,
      revision: row.revision,
      title: this.documentTitle(row),
      introduction: row.type === 'OFFER' ? row.introduction : null,
      blocks:
        row.type === 'OFFER'
          ? row.blocks.map((block) => ({ heading: block.heading, body: block.body }))
          : [],
      standardTerms: row.type === 'OFFER' ? row.standardTerms : null,
      closing: row.type === 'OFFER' ? row.closing : null,
      footer: row.type === 'OFFER' ? row.footer : null,
      recipientName: row.type === 'OFFER' ? row.recipientName : null,
      recipientContactName: row.type === 'OFFER' ? row.recipientContactName : null,
      recipientEmail: row.type === 'OFFER' ? row.recipientEmail : null,
      recipientAddress: row.type === 'OFFER' ? row.recipientAddress : null,
      validUntil:
        row.type === 'OFFER' ? (row.validUntil?.toISOString().slice(0, 10) ?? null) : null,
      internalNote: row.type === 'OFFER' ? row.internalNote : null,
      totalDiscountType: row.totalDiscountType,
      totalDiscountFixedMinor: row.totalDiscountFixedMinor?.toString() ?? null,
      totalDiscountPercentageBasisPoints: row.totalDiscountPercentageBasisPoints,
      contextSnapshot: row.contextSnapshot as Record<string, unknown>,
      positions: offerPositions.map((position, index) => ({
        id: position.id,
        source: position.source,
        sourceId: position.sourceId,
        description: position.description,
        quantity: position.quantity.toString(),
        unitPriceNetMinor: position.unitPriceNetMinor.toString(),
        taxRateBasisPoints: position.taxRateBasisPoints,
        discountType: position.discountType,
        discountFixedMinor: position.discountFixedMinor?.toString() ?? null,
        discountPercentageBasisPoints: position.discountPercentageBasisPoints,
        sortOrder: position.sortOrder,
        differsFromSource: differsFromSource(
          {
            description: position.description,
            quantity: position.quantity.toString(),
            unitPriceNetMinor: position.unitPriceNetMinor.toString(),
            taxRateBasisPoints: position.taxRateBasisPoints,
            discountType: position.discountType,
            discountFixedMinor: position.discountFixedMinor?.toString() ?? null,
            discountPercentageBasisPoints: position.discountPercentageBasisPoints,
          },
          position.sourceSnapshot,
        ),
        ...(totals?.positions[index] ?? {
          subtotalNetMinor: '0',
          discountNetMinor: '0',
          totalNetMinor: '0',
          taxMinor: '0',
          totalGrossMinor: '0',
        }),
      })),
      totals,
      versions: row.versions.map((version) => this.mapVersion(row.organizationId, row.id, version)),
      lastPublishedAt: row.lastPublishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapVersion(
    organizationId: string,
    documentId: string,
    version: DocumentRow['versions'][number],
  ): DocumentVersionDto {
    return {
      id: version.id,
      documentVersion: version.documentVersion,
      documentNumber: version.documentNumber,
      status: version.status,
      snapshot: version.snapshot as Record<string, unknown>,
      pdfSha256: version.pdfSha256,
      pdfSize: version.pdfSize,
      createdAt: version.createdAt.toISOString(),
      downloadPath: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions/${version.id}/pdf`,
    };
  }

  private mapTemplate(row: TemplateRow): DocumentTemplateDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      type: row.type,
      title: row.title,
      introduction: row.introduction,
      blocks: row.blocks.map((block) => ({ heading: block.heading, body: block.body })),
      standardTerms: row.standardTerms,
      closing: row.closing,
      footer: row.footer,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireEvent(database: Database, access: AccessContext, eventId: string) {
    const event = await database.event.findFirst({
      where: { id: eventId, organizationId: access.organizationId, ...this.locationWhere(access) },
      select: {
        id: true,
        locationId: true,
        name: true,
        eventDate: true,
        eventKind: true,
        description: true,
        technicalGetInMinutes: true,
        artistGetInMinutes: true,
        doorsMinutes: true,
        startMinutes: true,
        endMinutes: true,
        timezone: true,
        expectedGuestCount: true,
        location: {
          select: {
            name: true,
            timezone: true,
            addressLine1: true,
            addressLine2: true,
            postalCode: true,
            city: true,
            countryCode: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
    });
    if (!event) this.notFound('EVENT_NOT_FOUND', 'Die Veranstaltung wurde nicht gefunden');
    return event!;
  }

  private async requireDocument(database: Database, access: AccessContext, id: string) {
    const row = await database.document.findFirst({
      where: { id, organizationId: access.organizationId, ...this.locationWhere(access) },
      include: documentInclude,
    });
    if (!row) this.notFound('DOCUMENT_NOT_FOUND', 'Das Dokument wurde nicht gefunden');
    return row!;
  }

  private async requireTemplate(
    database: Database,
    access: AccessContext,
    id: string,
    active: boolean,
  ) {
    const row = await database.documentTemplate.findFirst({
      where: { id, organizationId: access.organizationId, ...(active ? { status: 'ACTIVE' } : {}) },
      include: templateInclude,
    });
    if (!row)
      this.notFound('DOCUMENT_TEMPLATE_NOT_FOUND', 'Die Dokumentvorlage wurde nicht gefunden');
    return row!;
  }

  private async appendStatusHistory(
    transaction: TransactionClient,
    access: AccessContext,
    documentId: string,
    previousStatus: DocumentStatus,
    newStatus: DocumentStatus,
  ): Promise<void> {
    if (previousStatus === newStatus) return;
    await transaction.documentStatusHistory.create({
      data: {
        organizationId: access.organizationId,
        documentId,
        previousStatus,
        newStatus,
        actorUserId: access.user.id,
        actorMembershipId: access.membershipId,
      },
    });
  }

  private discountFromPosition(position: {
    discountType: 'FIXED' | 'PERCENTAGE' | null;
    discountFixedMinor: bigint | null;
    discountPercentageBasisPoints: number | null;
  }) {
    return {
      type: position.discountType,
      fixedMinor: position.discountFixedMinor,
      percentageBasisPoints: position.discountPercentageBasisPoints,
    };
  }

  private discountFromDocument(document: {
    totalDiscountType: 'FIXED' | 'PERCENTAGE' | null;
    totalDiscountFixedMinor: bigint | null;
    totalDiscountPercentageBasisPoints: number | null;
  }) {
    return {
      type: document.totalDiscountType,
      fixedMinor: document.totalDiscountFixedMinor,
      percentageBasisPoints: document.totalDiscountPercentageBasisPoints,
    };
  }

  private discountFromInput(input: UpdateDocumentDto) {
    return {
      type: input.totalDiscountType ?? null,
      fixedMinor: input.totalDiscountFixedMinor ? BigInt(input.totalDiscountFixedMinor) : null,
      percentageBasisPoints: input.totalDiscountPercentageBasisPoints ?? null,
    };
  }

  private discountData(
    type: 'FIXED' | 'PERCENTAGE' | null,
    fixed: string | null,
    percentage: number | null,
  ) {
    return {
      discountType: type,
      discountFixedMinor: fixed ? BigInt(fixed) : null,
      discountPercentageBasisPoints: percentage,
    };
  }

  private documentDiscountData(deal: DealDto) {
    return {
      totalDiscountType: deal.totalDiscountType,
      totalDiscountFixedMinor: deal.totalDiscountFixedMinor
        ? BigInt(deal.totalDiscountFixedMinor)
        : null,
      totalDiscountPercentageBasisPoints: deal.totalDiscountPercentageBasisPoints,
    };
  }

  private totalDiscountData(
    type: 'FIXED' | 'PERCENTAGE' | null,
    fixed: string | null,
    percentage: number | null,
  ) {
    return {
      totalDiscountType: type,
      totalDiscountFixedMinor: fixed ? BigInt(fixed) : null,
      totalDiscountPercentageBasisPoints: percentage,
    };
  }

  private async allocateDocumentNumber(
    transaction: TransactionClient,
    organizationId: string,
    type: DocumentType,
    assignedAt = new Date(),
  ): Promise<string> {
    const year = assignedAt.getUTCFullYear();
    const sequence = await transaction.documentNumberSequence.upsert({
      where: {
        organizationId_year_documentType: { organizationId, year, documentType: type },
      },
      create: { organizationId, year, documentType: type, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    const prefix = type === 'OFFER' ? 'ANG' : 'ABL';
    return `${prefix}-${year}-${sequence.lastNumber.toString().padStart(4, '0')}`;
  }

  private defaultDocumentTitle(type: DocumentType, eventName: string): string {
    return type === 'OFFER' ? `Vermietungsangebot für ${eventName}` : `Ablauf für ${eventName}`;
  }

  private documentTitle(row: DocumentRow): string {
    if (row.type !== 'OFFER') return row.title;
    const normalized = row.title.trim().toLocaleLowerCase('de-DE');
    if (
      ['vorlage', 'angebot', 'standardangebot'].includes(normalized) ||
      normalized === row.sourceTemplateNameSnapshot.trim().toLocaleLowerCase('de-DE')
    ) {
      return this.defaultDocumentTitle(row.type, row.event.name);
    }
    return row.title;
  }

  private externalOfferPositions(row: DocumentRow): DocumentRow['offerPositions'] {
    return row.offerPositions.filter((position) => {
      if (position.source !== 'DEAL_COMPONENT') return true;
      if (!position.sourceSnapshot || Array.isArray(position.sourceSnapshot)) return true;
      const snapshot = position.sourceSnapshot as Prisma.JsonObject;
      const componentType = snapshot.componentType;
      return componentType !== 'REVENUE_SHARE' && componentType !== 'MINIMUM_GUARANTEE_SHARE';
    });
  }

  private artistName(artist: SnapshotArtist): string {
    return (
      artist.stageName ??
      ([artist.firstName, artist.lastName].filter(Boolean).join(' ') || 'Auftritt')
    );
  }

  private eventSnapshot(event: Awaited<ReturnType<DocumentService['requireEvent']>>) {
    return {
      id: event.id,
      name: event.name,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      eventKind: event.eventKind,
      description: event.description,
      timezone: event.timezone,
      expectedGuestCount: event.expectedGuestCount,
      technicalGetInTime: minutesToTime(event.technicalGetInMinutes),
      artistGetInTime: minutesToTime(event.artistGetInMinutes),
      doorsTime: minutesToTime(event.doorsMinutes),
      startTime: minutesToTime(event.startMinutes),
      endTime: minutesToTime(event.endMinutes),
      endNextDay:
        event.endMinutes !== null && event.startMinutes !== null
          ? event.endMinutes <= event.startMinutes
          : false,
    };
  }

  private jsonObject(value: object): Prisma.InputJsonObject {
    return JSON.parse(
      JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item)),
    ) as Prisma.InputJsonObject;
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item)),
    ) as Prisma.InputJsonValue;
  }

  private contactName(contact: {
    firstName: string | null;
    lastName: string | null;
    label: string | null;
  }): string {
    return (
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.label || 'Kontakt'
    );
  }

  private locationWhere(access: AccessContext): { locationId?: { in: string[] } } {
    return access.locationScope === 'ALL' ? {} : { locationId: { in: access.locationIds } };
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Der Datensatz wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.',
    });
  }

  private notFound(code: string, message: string): never {
    throw new NotFoundException({ code, message });
  }

  private rethrow(error: unknown, template = false): never {
    if (error instanceof DocumentValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    const candidate = error as { code?: string };
    if (candidate?.code === 'P2002') {
      throw new ConflictException({
        code: template ? 'DOCUMENT_TEMPLATE_NAME_CONFLICT' : 'DOCUMENT_CONFLICT',
        message: template
          ? 'Eine Dokumentvorlage mit diesem Namen und Typ ist bereits vorhanden.'
          : 'Das Dokument konnte wegen eines Konflikts nicht gespeichert werden.',
      });
    }
    throw error;
  }
}

function minutesToTime(value: number | null): string | null {
  if (value === null) return null;
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`;
}

function startOfToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
