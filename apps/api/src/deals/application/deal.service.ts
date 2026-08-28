import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { resolveComponentAmount } from '../../revenue/domain/revenue-planning.rules.js';
import {
  calculateLineTotal,
  normalizeQuantity,
} from '../../services/domain/service-calculation.rules.js';
import type { AccessContext } from '../../security/access.types.js';
import {
  assertShareInvariant,
  assertStatusTransition,
  calculateDeal,
  cleanDealText,
  DealValidationError,
  isWkzName,
  normalizeDealName,
  parseMinor,
  resolveDiscount,
  type DealStatus,
  type DiscountInput,
} from '../domain/deal.rules.js';
import type {
  CreateDealDto,
  DealDto,
  DealComponentInputDto,
  DealServicePositionInputDto,
  DealTemplateInputDto,
  DealTemplateDto,
  DealTemplatePreviewDto,
  UpdateDealDto,
} from '../presentation/deal.dto.js';

const dealInclude = {
  event: {
    select: {
      name: true,
      locationId: true,
      calculation: {
        select: {
          ticketPriceTiers: {
            orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
            include: {
              components: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
            },
          },
        },
      },
    },
  },
  components: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  servicePositions: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DealInclude;

const templateInclude = {
  components: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  servicePositions: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DealTemplateInclude;

type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;
type TemplateRow = Prisma.DealTemplateGetPayload<{ include: typeof templateInclude }>;
type Database = TransactionClient | PrismaService['database'];

interface ComponentValues {
  type: 'FIXED_RENT' | 'REVENUE_SHARE' | 'MINIMUM_GUARANTEE_SHARE';
  label: string;
  amountNetMinor: bigint | null;
  minimumGuaranteeNetMinor: bigint | null;
  taxRateBasisPoints: number;
  locationShareBasisPoints: number | null;
  counterpartyShareBasisPoints: number | null;
  includeWkz: boolean;
  sortOrder: number;
}

interface ServiceValues {
  sourceServiceId: string | null;
  sourceServiceVersion: number | null;
  serviceNameSnapshot: string;
  unitSnapshot: 'PIECE' | 'HOUR' | 'DAY' | 'PERSON' | 'FLAT_RATE' | 'PER_GUEST' | 'PER_TICKET';
  quantity: string;
  salesUnitPriceNetMinor: bigint;
  internalUnitCostNetMinor: bigint;
  taxRateBasisPoints: number;
  billingMode: 'SEPARATELY_BILLABLE' | 'INCLUDED';
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountFixedMinor: bigint | null;
  discountPercentageBasisPoints: number | null;
  sortOrder: number;
}

interface SnapshotValues {
  components: ComponentValues[];
  servicePositions: ServiceValues[];
  totalDiscount: DiscountInput;
}

@Injectable()
export class DealService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  async findForEvent(access: AccessContext, eventId: string): Promise<DealDto> {
    const row = await this.prisma.database.deal.findFirst({
      where: { organizationId: access.organizationId, eventId, ...this.locationWhere(access) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: dealInclude,
    });
    if (!row) this.notFound('DEAL_NOT_FOUND', 'Für diese Veranstaltung ist kein Deal vorhanden');
    return this.mapDeal(row!);
  }

  async create(access: AccessContext, eventId: string, input: CreateDealDto): Promise<DealDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        await this.requireEvent(transaction, access, eventId);
        const active = await transaction.deal.findFirst({
          where: { organizationId: access.organizationId, eventId, status: { not: 'STORNIERT' } },
          select: { id: true },
        });
        if (active)
          this.conflict(
            'DEAL_ALREADY_EXISTS',
            'Für diese Veranstaltung besteht bereits ein aktiver Deal',
          );
        const party = await this.resolveParty(
          transaction,
          access,
          input.businessPartnerId,
          input.contactId ?? null,
        );
        const snapshot = input.templateId
          ? await this.snapshotFromTemplate(transaction, access, input)
          : await this.normalizeSnapshot(
              transaction,
              access,
              input.components ?? [],
              input.servicePositions ?? [],
              input.totalDiscount,
            );
        this.validateSnapshot(snapshot);
        const template = input.templateId
          ? await this.requireTemplate(transaction, access, input.templateId, true)
          : null;
        const row = await transaction.deal.create({
          data: {
            organizationId: access.organizationId,
            eventId,
            businessPartnerId: party.partner.id,
            contactId: party.contact?.id ?? null,
            customerNameSnapshot: party.partner.companyName,
            contactNameSnapshot: party.contact ? this.contactName(party.contact) : null,
            sourceTemplateId: template?.id ?? null,
            sourceTemplateVersion: template?.version ?? null,
            sourceTemplateNameSnapshot: template?.name ?? null,
            ...this.discountData(snapshot.totalDiscount, 'total'),
          },
          select: { id: true },
        });
        await transaction.dealComponent.createMany({
          data: snapshot.components.map((item) => ({
            organizationId: access.organizationId,
            dealId: row.id,
            ...item,
          })),
        });
        await transaction.dealServicePosition.createMany({
          data: snapshot.servicePositions.map((item) => ({
            organizationId: access.organizationId,
            dealId: row.id,
            ...item,
          })),
        });
        await this.audit.append(transaction, access, 'deal.created', 'deal', row.id, {
          eventId,
          componentCount: snapshot.components.length,
          servicePositionCount: snapshot.servicePositions.length,
          fromTemplate: Boolean(template),
        });
        return this.mapDeal(
          await transaction.deal.findUniqueOrThrow({
            where: { id: row.id, organizationId: access.organizationId },
            include: dealInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async update(access: AccessContext, dealId: string, input: UpdateDealDto): Promise<DealDto> {
    try {
      if (input.templateId) {
        throw new DealValidationError(
          'DEAL_TEMPLATE_CONFIRMATION_REQUIRED',
          'Eine spätere Vorlagenübernahme ist nur über Vorschau und bestätigten vollständigen Ersatz möglich',
        );
      }
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDeal(transaction, access, dealId);
        const party = await this.resolveParty(
          transaction,
          access,
          input.businessPartnerId,
          input.contactId ?? null,
        );
        const snapshot = await this.normalizeSnapshot(
          transaction,
          access,
          input.components ?? [],
          input.servicePositions ?? [],
          input.totalDiscount,
        );
        this.validateSnapshot(snapshot);
        const updated = await transaction.deal.updateMany({
          where: { id: dealId, organizationId: access.organizationId, version: input.version },
          data: {
            businessPartnerId: party.partner.id,
            contactId: party.contact?.id ?? null,
            customerNameSnapshot: party.partner.companyName,
            contactNameSnapshot: party.contact ? this.contactName(party.contact) : null,
            sourceTemplateId: null,
            sourceTemplateVersion: null,
            sourceTemplateNameSnapshot: null,
            ...this.discountData(snapshot.totalDiscount, 'total'),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await transaction.dealComponent.deleteMany({
          where: { dealId, organizationId: access.organizationId },
        });
        await transaction.dealServicePosition.deleteMany({
          where: { dealId, organizationId: access.organizationId },
        });
        await transaction.dealComponent.createMany({
          data: snapshot.components.map((item) => ({
            organizationId: access.organizationId,
            dealId,
            ...item,
          })),
        });
        await transaction.dealServicePosition.createMany({
          data: snapshot.servicePositions.map((item) => ({
            organizationId: access.organizationId,
            dealId,
            ...item,
          })),
        });
        await this.audit.append(transaction, access, 'deal.updated', 'deal', dealId, {
          eventId: current.eventId,
          replacedSnapshot: true,
          componentCount: snapshot.components.length,
          servicePositionCount: snapshot.servicePositions.length,
        });
        return this.mapDeal(
          await transaction.deal.findUniqueOrThrow({
            where: { id: dealId, organizationId: access.organizationId },
            include: dealInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async setStatus(
    access: AccessContext,
    dealId: string,
    version: number,
    status: DealStatus,
  ): Promise<DealDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDeal(transaction, access, dealId);
        assertStatusTransition(current.status, status);
        if (current.status !== status) {
          const updated = await transaction.deal.updateMany({
            where: { id: dealId, organizationId: access.organizationId, version },
            data: { status, version: { increment: 1 } },
          });
          if (updated.count !== 1) this.versionConflict();
          await transaction.dealStatusHistory.create({
            data: {
              organizationId: access.organizationId,
              dealId,
              previousStatus: current.status,
              newStatus: status,
              actorUserId: access.user.id,
              actorMembershipId: access.membershipId,
            },
          });
          await this.audit.append(transaction, access, 'deal.status_changed', 'deal', dealId, {
            previousStatus: current.status,
            newStatus: status,
          });
        }
        return this.mapDeal(
          await transaction.deal.findUniqueOrThrow({
            where: { id: dealId, organizationId: access.organizationId },
            include: dealInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async previewTemplate(
    access: AccessContext,
    dealId: string,
    templateId: string,
  ): Promise<DealTemplatePreviewDto> {
    await this.requireDeal(this.prisma.database, access, dealId);
    const template = await this.requireTemplate(this.prisma.database, access, templateId, true);
    return {
      ...this.mapTemplate(template),
      replacesExistingSnapshot: true,
      replacementMessage:
        'Alle bestehenden Deal-Bausteine, Leistungs-Snapshots und Rabatte werden vollständig ersetzt. Kunde, Ansprechpartner und Dealstatus bleiben erhalten.',
    };
  }

  async applyTemplate(
    access: AccessContext,
    dealId: string,
    templateId: string,
    version: number,
    confirm: boolean,
  ): Promise<DealDto> {
    try {
      if (!confirm) {
        throw new DealValidationError(
          'DEAL_TEMPLATE_CONFIRMATION_REQUIRED',
          'Der vollständige Ersatz muss ausdrücklich bestätigt werden',
        );
      }
      return await this.prisma.transaction(async (transaction) => {
        const current = await this.requireDeal(transaction, access, dealId);
        const template = await this.requireTemplate(transaction, access, templateId, true);
        const snapshot = this.valuesFromTemplate(template);
        this.validateSnapshot(snapshot);
        const updated = await transaction.deal.updateMany({
          where: { id: dealId, organizationId: access.organizationId, version },
          data: {
            sourceTemplateId: template.id,
            sourceTemplateVersion: template.version,
            sourceTemplateNameSnapshot: template.name,
            ...this.discountData(snapshot.totalDiscount, 'total'),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await transaction.dealComponent.deleteMany({
          where: { dealId, organizationId: access.organizationId },
        });
        await transaction.dealServicePosition.deleteMany({
          where: { dealId, organizationId: access.organizationId },
        });
        await transaction.dealComponent.createMany({
          data: snapshot.components.map((item) => ({
            organizationId: access.organizationId,
            dealId,
            ...item,
          })),
        });
        await transaction.dealServicePosition.createMany({
          data: snapshot.servicePositions.map((item) => ({
            organizationId: access.organizationId,
            dealId,
            ...item,
          })),
        });
        await this.audit.append(transaction, access, 'deal.template_applied', 'deal', dealId, {
          eventId: current.eventId,
          templateId,
          templateVersion: template.version,
          replacedSnapshot: true,
        });
        return this.mapDeal(
          await transaction.deal.findUniqueOrThrow({
            where: { id: dealId, organizationId: access.organizationId },
            include: dealInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async listTemplates(
    access: AccessContext,
    status: 'ACTIVE' | 'ARCHIVED' | 'ALL',
  ): Promise<DealTemplateDto[]> {
    const rows = await this.prisma.database.dealTemplate.findMany({
      where: { organizationId: access.organizationId, ...(status === 'ALL' ? {} : { status }) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: templateInclude,
    });
    return rows.map((row) => this.mapTemplate(row));
  }

  async findTemplate(access: AccessContext, templateId: string): Promise<DealTemplateDto> {
    return this.mapTemplate(
      await this.requireTemplate(this.prisma.database, access, templateId, false),
    );
  }

  async createTemplate(
    access: AccessContext,
    input: DealTemplateInputDto,
  ): Promise<DealTemplateDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        const names = normalizeDealName(input.name);
        const snapshot = await this.normalizeSnapshot(
          transaction,
          access,
          input.components,
          input.servicePositions,
          input.totalDiscount,
        );
        this.validateSnapshot(snapshot);
        const row = await transaction.dealTemplate.create({
          data: {
            organizationId: access.organizationId,
            ...names,
            description: input.description?.trim() || null,
            ...this.discountData(snapshot.totalDiscount, 'total'),
          },
          select: { id: true },
        });
        await transaction.dealTemplateComponent.createMany({
          data: snapshot.components.map((item) => ({
            organizationId: access.organizationId,
            templateId: row.id,
            ...item,
          })),
        });
        await transaction.dealTemplateServicePosition.createMany({
          data: snapshot.servicePositions.map((item) => ({
            organizationId: access.organizationId,
            templateId: row.id,
            ...item,
          })),
        });
        await this.audit.append(
          transaction,
          access,
          'deal_template.created',
          'deal_template',
          row.id,
          {
            componentCount: snapshot.components.length,
            servicePositionCount: snapshot.servicePositions.length,
          },
        );
        return this.mapTemplate(
          await transaction.dealTemplate.findUniqueOrThrow({
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
    templateId: string,
    version: number,
    input: DealTemplateInputDto,
  ): Promise<DealTemplateDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        await this.requireTemplate(transaction, access, templateId, false);
        const names = normalizeDealName(input.name);
        const snapshot = await this.normalizeSnapshot(
          transaction,
          access,
          input.components,
          input.servicePositions,
          input.totalDiscount,
        );
        this.validateSnapshot(snapshot);
        const updated = await transaction.dealTemplate.updateMany({
          where: { id: templateId, organizationId: access.organizationId, version },
          data: {
            ...names,
            description: input.description?.trim() || null,
            ...this.discountData(snapshot.totalDiscount, 'total'),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await transaction.dealTemplateComponent.deleteMany({
          where: { templateId, organizationId: access.organizationId },
        });
        await transaction.dealTemplateServicePosition.deleteMany({
          where: { templateId, organizationId: access.organizationId },
        });
        await transaction.dealTemplateComponent.createMany({
          data: snapshot.components.map((item) => ({
            organizationId: access.organizationId,
            templateId,
            ...item,
          })),
        });
        await transaction.dealTemplateServicePosition.createMany({
          data: snapshot.servicePositions.map((item) => ({
            organizationId: access.organizationId,
            templateId,
            ...item,
          })),
        });
        await this.audit.append(
          transaction,
          access,
          'deal_template.updated',
          'deal_template',
          templateId,
          { replacedSnapshot: true },
        );
        return this.mapTemplate(
          await transaction.dealTemplate.findUniqueOrThrow({
            where: { id: templateId, organizationId: access.organizationId },
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
    templateId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<DealTemplateDto> {
    try {
      return await this.prisma.transaction(async (transaction) => {
        await this.requireTemplate(transaction, access, templateId, false);
        const updated = await transaction.dealTemplate.updateMany({
          where: { id: templateId, organizationId: access.organizationId, version },
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
          `deal_template.${status === 'ARCHIVED' ? 'archived' : 'reactivated'}`,
          'deal_template',
          templateId,
          { status },
        );
        return this.mapTemplate(
          await transaction.dealTemplate.findUniqueOrThrow({
            where: { id: templateId, organizationId: access.organizationId },
            include: templateInclude,
          }),
        );
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  private async normalizeSnapshot(
    database: Database,
    access: AccessContext,
    componentInputs: DealComponentInputDto[],
    serviceInputs: DealServicePositionInputDto[],
    totalDiscountInput?: {
      type?: 'FIXED' | 'PERCENTAGE' | null;
      fixedMinor?: string | null;
      percentageBasisPoints?: number | null;
    },
  ): Promise<SnapshotValues> {
    if (componentInputs.length > 100 || serviceInputs.length > 200) {
      throw new DealValidationError(
        'DEAL_SNAPSHOT_TOO_LARGE',
        'Ein Deal darf höchstens 100 Bausteine und 200 Leistungspositionen enthalten',
      );
    }
    const components = componentInputs.map((input, sortOrder) =>
      this.componentValues(input, sortOrder),
    );
    const servicePositions = await this.serviceValues(database, access, serviceInputs);
    return { components, servicePositions, totalDiscount: this.discountValues(totalDiscountInput) };
  }

  private componentValues(input: DealComponentInputDto, sortOrder: number): ComponentValues {
    const amount = parseMinor(input.amountNetMinor, 'Der Mietbetrag');
    const minimum = parseMinor(input.minimumGuaranteeNetMinor, 'Die Mindestgarantie');
    const location = input.locationShareBasisPoints ?? null;
    const counterparty = input.counterpartyShareBasisPoints ?? null;
    if (input.type === 'FIXED_RENT') {
      if (
        amount === null ||
        minimum !== null ||
        location !== null ||
        counterparty !== null ||
        input.includeWkz
      ) {
        throw new DealValidationError(
          'DEAL_COMPONENT_INCONSISTENT',
          'Der feste Mietbaustein enthält widersprüchliche Werte',
        );
      }
    } else {
      assertShareInvariant(location, counterparty);
      if (
        amount !== null ||
        (input.type === 'REVENUE_SHARE' && minimum !== null) ||
        (input.type === 'MINIMUM_GUARANTEE_SHARE' && minimum === null)
      ) {
        throw new DealValidationError(
          'DEAL_COMPONENT_INCONSISTENT',
          'Der Beteiligungsbaustein enthält widersprüchliche Werte',
        );
      }
    }
    return {
      type: input.type,
      label: cleanDealText(input.label, 'Die Bausteinbezeichnung'),
      amountNetMinor: amount,
      minimumGuaranteeNetMinor: minimum,
      taxRateBasisPoints: input.taxRateBasisPoints,
      locationShareBasisPoints: location,
      counterpartyShareBasisPoints: counterparty,
      includeWkz: input.includeWkz,
      sortOrder,
    };
  }

  private async serviceValues(
    database: Database,
    access: AccessContext,
    inputs: DealServicePositionInputDto[],
  ): Promise<ServiceValues[]> {
    const sourceIds = [
      ...new Set(inputs.flatMap((item) => (item.sourceServiceId ? [item.sourceServiceId] : []))),
    ];
    const sources = sourceIds.length
      ? await database.service.findMany({
          where: { id: { in: sourceIds }, organizationId: access.organizationId, status: 'ACTIVE' },
          include: { providerPrices: { where: { status: 'ACTIVE', preferred: true }, take: 1 } },
        })
      : [];
    const byId = new Map(sources.map((source) => [source.id, source]));
    if (byId.size !== sourceIds.length)
      this.notFound(
        'DEAL_SERVICE_NOT_FOUND',
        'Mindestens eine ausgewählte Leistung wurde nicht gefunden',
      );
    return inputs.map((input, sortOrder) => {
      const source = input.sourceServiceId ? byId.get(input.sourceServiceId) : undefined;
      const name =
        source?.name ?? (input.name ? cleanDealText(input.name, 'Die Leistungsbezeichnung') : null);
      const unit = source?.unit ?? input.unit;
      if (!name || !unit)
        throw new DealValidationError(
          'DEAL_SERVICE_SNAPSHOT_INCOMPLETE',
          'Freie Leistungspositionen benötigen Bezeichnung und Einheit',
        );
      const sales =
        parseMinor(input.salesUnitPriceNetMinor, 'Der Verkaufspreis') ??
        source?.defaultSalesPriceMinor ??
        null;
      const internal =
        parseMinor(input.internalUnitCostNetMinor, 'Die internen Kosten') ??
        source?.providerPrices[0]?.purchasePriceMinor ??
        0n;
      if (sales === null)
        throw new DealValidationError(
          'DEAL_SERVICE_SALES_PRICE_REQUIRED',
          `Für „${name}“ fehlt der Netto-Verkaufspreis`,
        );
      const quantity = normalizeQuantity(input.quantity).replace(',', '.');
      const discount = this.discountValues(input.discount);
      if (input.billingMode === 'INCLUDED' && discount.type !== null) {
        throw new DealValidationError(
          'DEAL_INCLUDED_SERVICE_DISCOUNT_FORBIDDEN',
          'Im Deal enthaltene Leistungen dürfen keinen Kundenrabatt tragen',
        );
      }
      resolveDiscount(
        calculateLineTotal(quantity, sales),
        discount,
        `Der Positionsrabatt für „${name}“`,
      );
      return {
        sourceServiceId: source?.id ?? null,
        sourceServiceVersion: source?.version ?? null,
        serviceNameSnapshot: name,
        unitSnapshot: unit,
        quantity,
        salesUnitPriceNetMinor: sales,
        internalUnitCostNetMinor: internal,
        taxRateBasisPoints: input.taxRateBasisPoints,
        billingMode: input.billingMode,
        discountType: discount.type,
        discountFixedMinor: discount.fixedMinor,
        discountPercentageBasisPoints: discount.percentageBasisPoints,
        sortOrder,
      };
    });
  }

  private validateSnapshot(snapshot: SnapshotValues): void {
    calculateDeal({
      ticketNetRevenueMinor: 0n,
      wkzNetRevenueMinor: 0n,
      components: snapshot.components.map((item, index) => ({ id: String(index), ...item })),
      servicePositions: snapshot.servicePositions.map((item, index) => ({
        id: String(index),
        quantity: item.quantity,
        salesUnitPriceNetMinor: item.salesUnitPriceNetMinor,
        internalUnitCostNetMinor: item.internalUnitCostNetMinor,
        taxRateBasisPoints: item.taxRateBasisPoints,
        billingMode: item.billingMode,
        discount: {
          type: item.discountType,
          fixedMinor: item.discountFixedMinor,
          percentageBasisPoints: item.discountPercentageBasisPoints,
        },
      })),
      totalDiscount: snapshot.totalDiscount,
    });
  }

  private discountValues(input?: {
    type?: 'FIXED' | 'PERCENTAGE' | null;
    fixedMinor?: string | null;
    percentageBasisPoints?: number | null;
  }): DiscountInput {
    return {
      type: input?.type ?? null,
      fixedMinor: parseMinor(input?.fixedMinor, 'Der Rabattbetrag'),
      percentageBasisPoints: input?.percentageBasisPoints ?? null,
    };
  }

  private discountData(discount: DiscountInput, prefix: 'total' | 'position') {
    return prefix === 'total'
      ? {
          totalDiscountType: discount.type,
          totalDiscountFixedMinor: discount.fixedMinor,
          totalDiscountPercentageBasisPoints: discount.percentageBasisPoints,
        }
      : {
          discountType: discount.type,
          discountFixedMinor: discount.fixedMinor,
          discountPercentageBasisPoints: discount.percentageBasisPoints,
        };
  }

  private async snapshotFromTemplate(
    database: Database,
    access: AccessContext,
    input: CreateDealDto,
  ): Promise<SnapshotValues> {
    if (
      input.components !== undefined ||
      input.servicePositions !== undefined ||
      input.totalDiscount !== undefined
    ) {
      throw new DealValidationError(
        'DEAL_TEMPLATE_INPUT_CONFLICT',
        'Beim Erstellen aus einer Vorlage dürfen keine parallelen Snapshot-Werte übergeben werden',
      );
    }
    return this.valuesFromTemplate(
      await this.requireTemplate(database, access, input.templateId!, true),
    );
  }

  private valuesFromTemplate(template: TemplateRow): SnapshotValues {
    return {
      components: template.components.map((item) => ({
        type: item.type,
        label: item.label,
        amountNetMinor: item.amountNetMinor,
        minimumGuaranteeNetMinor: item.minimumGuaranteeNetMinor,
        taxRateBasisPoints: item.taxRateBasisPoints,
        locationShareBasisPoints: item.locationShareBasisPoints,
        counterpartyShareBasisPoints: item.counterpartyShareBasisPoints,
        includeWkz: item.includeWkz,
        sortOrder: item.sortOrder,
      })),
      servicePositions: template.servicePositions.map((item) => ({
        sourceServiceId: item.sourceServiceId,
        sourceServiceVersion: item.sourceServiceVersion,
        serviceNameSnapshot: item.serviceNameSnapshot,
        unitSnapshot: item.unitSnapshot,
        quantity: item.quantity.toString(),
        salesUnitPriceNetMinor: item.salesUnitPriceNetMinor,
        internalUnitCostNetMinor: item.internalUnitCostNetMinor,
        taxRateBasisPoints: item.taxRateBasisPoints,
        billingMode: item.billingMode,
        discountType: item.discountType,
        discountFixedMinor: item.discountFixedMinor,
        discountPercentageBasisPoints: item.discountPercentageBasisPoints,
        sortOrder: item.sortOrder,
      })),
      totalDiscount: {
        type: template.totalDiscountType,
        fixedMinor: template.totalDiscountFixedMinor,
        percentageBasisPoints: template.totalDiscountPercentageBasisPoints,
      },
    };
  }

  private async resolveParty(
    database: Database,
    access: AccessContext,
    partnerId: string,
    contactId: string | null,
  ) {
    const partner = await database.businessPartner.findFirst({
      where: { id: partnerId, organizationId: access.organizationId, status: 'ACTIVE' },
    });
    if (!partner)
      this.notFound(
        'DEAL_BUSINESS_PARTNER_NOT_FOUND',
        'Kunde oder Veranstalter wurde nicht gefunden',
      );
    const contact = contactId
      ? await database.contact.findFirst({
          where: {
            id: contactId,
            organizationId: access.organizationId,
            status: 'ACTIVE',
            businessPartnerLinks: { some: { businessPartnerId: partnerId } },
          },
        })
      : null;
    if (contactId && !contact)
      this.notFound(
        'DEAL_CONTACT_NOT_FOUND',
        'Der Ansprechpartner ist dem ausgewählten Geschäftspartner nicht zugeordnet',
      );
    return { partner: partner!, contact };
  }

  private async requireEvent(database: Database, access: AccessContext, eventId: string) {
    const event = await database.event.findFirst({
      where: { id: eventId, organizationId: access.organizationId, ...this.locationWhere(access) },
      select: { id: true },
    });
    if (!event) this.notFound('EVENT_NOT_FOUND', 'Veranstaltung nicht gefunden');
    return event!;
  }

  private async requireDeal(database: Database, access: AccessContext, dealId: string) {
    const row = await database.deal.findFirst({
      where: { id: dealId, organizationId: access.organizationId, ...this.locationWhere(access) },
      include: dealInclude,
    });
    if (!row) this.notFound('DEAL_NOT_FOUND', 'Deal nicht gefunden');
    return row!;
  }

  private async requireTemplate(
    database: Database,
    access: AccessContext,
    templateId: string,
    activeOnly: boolean,
  ) {
    const row = await database.dealTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: access.organizationId,
        ...(activeOnly ? { status: 'ACTIVE' } : {}),
      },
      include: templateInclude,
    });
    if (!row) this.notFound('DEAL_TEMPLATE_NOT_FOUND', 'Dealvorlage nicht gefunden');
    return row!;
  }

  private locationWhere(access: AccessContext) {
    return access.locationScope === 'SELECTED'
      ? { event: { locationId: { in: access.locationIds } } }
      : {};
  }

  private mapDeal(row: DealRow): DealDto {
    let ticketNet = 0n;
    let wkzNet = 0n;
    for (const tier of row.event.calculation?.ticketPriceTiers ?? []) {
      if (tier.status !== 'ACTIVE') continue;
      if (tier.baseNetUnitMinor !== null)
        ticketNet += tier.baseNetUnitMinor * BigInt(tier.expectedQuantity);
      for (const component of tier.components) {
        if (component.status !== 'ACTIVE' || !component.guestPays || !isWkzName(component.name))
          continue;
        const resolved = resolveComponentAmount(tier.baseGrossUnitMinor, {
          amountType: component.amountType,
          inputType: component.inputType,
          inputAmountMinor: component.inputAmountMinor,
          percentageRateBasisPoints: component.percentageRateBasisPoints,
          taxRateBasisPoints: component.taxRateBasisPoints,
        });
        if (resolved) wkzNet += resolved.netMinor * BigInt(tier.expectedQuantity);
      }
    }
    const components = row.components.map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      amountNetMinor: item.amountNetMinor?.toString() ?? null,
      minimumGuaranteeNetMinor: item.minimumGuaranteeNetMinor?.toString() ?? null,
      taxRateBasisPoints: item.taxRateBasisPoints,
      locationShareBasisPoints: item.locationShareBasisPoints,
      counterpartyShareBasisPoints: item.counterpartyShareBasisPoints,
      includeWkz: item.includeWkz,
      sortOrder: item.sortOrder,
      version: item.version,
    }));
    const servicePositions = row.servicePositions.map((item) => this.mapServicePosition(item));
    const summary = calculateDeal({
      ticketNetRevenueMinor: ticketNet,
      wkzNetRevenueMinor: wkzNet,
      components: row.components,
      servicePositions: row.servicePositions.map((item) => ({
        id: item.id,
        quantity: item.quantity.toString(),
        salesUnitPriceNetMinor: item.salesUnitPriceNetMinor,
        internalUnitCostNetMinor: item.internalUnitCostNetMinor,
        taxRateBasisPoints: item.taxRateBasisPoints,
        billingMode: item.billingMode,
        discount: {
          type: item.discountType,
          fixedMinor: item.discountFixedMinor,
          percentageBasisPoints: item.discountPercentageBasisPoints,
        },
      })),
      totalDiscount: {
        type: row.totalDiscountType,
        fixedMinor: row.totalDiscountFixedMinor,
        percentageBasisPoints: row.totalDiscountPercentageBasisPoints,
      },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      eventName: row.event.name,
      businessPartnerId: row.businessPartnerId,
      customerName: row.customerNameSnapshot,
      contactId: row.contactId,
      contactName: row.contactNameSnapshot,
      sourceTemplateId: row.sourceTemplateId,
      sourceTemplateVersion: row.sourceTemplateVersion,
      sourceTemplateName: row.sourceTemplateNameSnapshot,
      status: row.status,
      totalDiscountType: row.totalDiscountType,
      totalDiscountFixedMinor: row.totalDiscountFixedMinor?.toString() ?? null,
      totalDiscountPercentageBasisPoints: row.totalDiscountPercentageBasisPoints,
      currency: 'EUR' as const,
      version: row.version,
      components,
      servicePositions,
      summary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapTemplate(row: TemplateRow): DealTemplateDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      description: row.description,
      status: row.status,
      version: row.version,
      totalDiscountType: row.totalDiscountType,
      totalDiscountFixedMinor: row.totalDiscountFixedMinor?.toString() ?? null,
      totalDiscountPercentageBasisPoints: row.totalDiscountPercentageBasisPoints,
      components: row.components.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        amountNetMinor: item.amountNetMinor?.toString() ?? null,
        minimumGuaranteeNetMinor: item.minimumGuaranteeNetMinor?.toString() ?? null,
        taxRateBasisPoints: item.taxRateBasisPoints,
        locationShareBasisPoints: item.locationShareBasisPoints,
        counterpartyShareBasisPoints: item.counterpartyShareBasisPoints,
        includeWkz: item.includeWkz,
        sortOrder: item.sortOrder,
        version: 1,
      })),
      servicePositions: row.servicePositions.map((item) => this.mapServicePosition(item, 1)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapServicePosition(
    item: DealRow['servicePositions'][number] | TemplateRow['servicePositions'][number],
    version?: number,
  ) {
    return {
      id: item.id,
      sourceServiceId: item.sourceServiceId,
      sourceServiceVersion: item.sourceServiceVersion,
      name: item.serviceNameSnapshot,
      unit: item.unitSnapshot,
      quantity: item.quantity.toString(),
      salesUnitPriceNetMinor: item.salesUnitPriceNetMinor.toString(),
      internalUnitCostNetMinor: item.internalUnitCostNetMinor.toString(),
      taxRateBasisPoints: item.taxRateBasisPoints,
      billingMode: item.billingMode,
      discountType: item.discountType,
      discountFixedMinor: item.discountFixedMinor?.toString() ?? null,
      discountPercentageBasisPoints: item.discountPercentageBasisPoints,
      sortOrder: item.sortOrder,
      version: version ?? ('version' in item ? item.version : 1),
    };
  }

  private contactName(contact: {
    firstName: string | null;
    lastName: string | null;
    label: string | null;
  }) {
    return (
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      contact.label ||
      'Ansprechpartner'
    );
  }

  private rethrow(error: unknown, templateNameConflict = false): never {
    if (error instanceof DealValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'P2002') {
        this.conflict(
          templateNameConflict ? 'DEAL_TEMPLATE_NAME_CONFLICT' : 'DEAL_ALREADY_EXISTS',
          templateNameConflict
            ? 'Eine Dealvorlage mit diesem Namen existiert bereits'
            : 'Für diese Veranstaltung besteht bereits ein aktiver Deal',
        );
      }
      if (error.code === 'P2003')
        this.notFound(
          'DEAL_REFERENCE_NOT_FOUND',
          'Eine referenzierte Ressource wurde nicht gefunden',
        );
    }
    throw error;
  }

  private versionConflict(): never {
    this.conflict('VERSION_CONFLICT', 'Die Ressource wurde zwischenzeitlich geändert');
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }

  private notFound(code: string, message: string): never {
    throw new NotFoundException({ code, message });
  }
}
