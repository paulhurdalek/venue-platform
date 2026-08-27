import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import { convertNetGross, parseRevenueMinor } from '../../revenue/domain/revenue-planning.rules.js';
import type {
  CalculationTemplateAdditionalRevenueInputDto,
  CalculationTemplateInputDto,
  CalculationTemplateTierInputDto,
  RevenueTemplateAllocationInputDto,
  RevenueTemplateComponentInputDto,
  SaveEventCalculationTemplateDto,
  TaxRateTemplateInputDto,
  TicketProviderTemplateInputDto,
} from '../presentation/revenue-template.dto.js';

const providerInclude = {
  components: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      allocations: {
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        include: { artist: true, businessPartner: true },
      },
    },
  },
} satisfies Prisma.TicketProviderTemplateInclude;

const calculationInclude = {
  tiers: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      components: {
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        include: {
          allocations: {
            orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
            include: { artist: true, businessPartner: true },
          },
        },
      },
    },
  },
  additionalRevenues: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.CalculationTemplateInclude;

type TemplateStatus = 'ACTIVE' | 'ARCHIVED';
type StatusFilter = TemplateStatus | 'ALL';

@Injectable()
export class RevenueTemplateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  async listTaxRates(organizationId: string, status: StatusFilter) {
    const rows = await this.prisma.database.taxRateTemplate.findMany({
      where: { organizationId, ...(status === 'ALL' ? {} : { status }) },
      orderBy: [{ rateBasisPoints: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(serialize);
  }

  async createTaxRate(access: AccessContext, input: TaxRateTemplateInputDto) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Steuersatzvorlage');
        assertBasisPoints(input.rateBasisPoints, 'Der Steuersatz');
        const created = await transaction.taxRateTemplate.create({
          data: {
            organizationId: access.organizationId,
            name,
            normalizedName: normalizeName(name),
            rateBasisPoints: input.rateBasisPoints,
          },
        });
        await this.audit.append(
          transaction,
          access,
          'tax_rate_template.created',
          'tax_rate_template',
          created.id,
          {
            rateBasisPoints: created.rateBasisPoints,
            newVersion: created.version,
          },
        );
        return serialize(created);
      }),
    );
  }

  async updateTaxRate(
    access: AccessContext,
    templateId: string,
    version: number,
    input: TaxRateTemplateInputDto,
  ) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Steuersatzvorlage');
        assertBasisPoints(input.rateBasisPoints, 'Der Steuersatz');
        const updated = await transaction.taxRateTemplate.updateMany({
          where: { id: templateId, organizationId: access.organizationId, version },
          data: {
            name,
            normalizedName: normalizeName(name),
            rateBasisPoints: input.rateBasisPoints,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        const record = await transaction.taxRateTemplate.findUniqueOrThrow({
          where: { id: templateId },
        });
        await this.audit.append(
          transaction,
          access,
          'tax_rate_template.updated',
          'tax_rate_template',
          templateId,
          {
            previousVersion: version,
            newVersion: record.version,
            rateBasisPoints: record.rateBasisPoints,
          },
        );
        return serialize(record);
      }),
    );
  }

  async setTaxRateStatus(
    access: AccessContext,
    templateId: string,
    version: number,
    status: TemplateStatus,
  ) {
    return this.setSimpleStatus(
      access,
      'taxRateTemplate',
      'tax_rate_template',
      templateId,
      version,
      status,
    );
  }

  async listProviders(organizationId: string, status: StatusFilter) {
    const rows = await this.prisma.database.ticketProviderTemplate.findMany({
      where: { organizationId, ...(status === 'ALL' ? {} : { status }) },
      include: providerInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(serialize);
  }

  async findProvider(organizationId: string, templateId: string) {
    const row = await this.prisma.database.ticketProviderTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: providerInclude,
    });
    if (!row) this.notFound();
    return serialize(row!);
  }

  async createProvider(access: AccessContext, input: TicketProviderTemplateInputDto) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Ticketanbieter-Vorlage');
        const parent = await transaction.ticketProviderTemplate.create({
          data: {
            organizationId: access.organizationId,
            name,
            normalizedName: normalizeName(name),
            description: cleanOptional(input.description),
          },
        });
        await this.writeProviderContents(
          transaction,
          access.organizationId,
          parent.id,
          input.components,
        );
        await this.audit.append(
          transaction,
          access,
          'ticket_provider_template.created',
          'ticket_provider_template',
          parent.id,
          {
            componentCount: input.components.length,
            newVersion: parent.version,
          },
        );
        return serialize(await this.requireProvider(transaction, access.organizationId, parent.id));
      }),
    );
  }

  async updateProvider(
    access: AccessContext,
    templateId: string,
    version: number,
    input: TicketProviderTemplateInputDto,
  ) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Ticketanbieter-Vorlage');
        const updated = await transaction.ticketProviderTemplate.updateMany({
          where: { id: templateId, organizationId: access.organizationId, version },
          data: {
            name,
            normalizedName: normalizeName(name),
            description: cleanOptional(input.description),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await this.clearProviderContents(transaction, access.organizationId, templateId);
        await this.writeProviderContents(
          transaction,
          access.organizationId,
          templateId,
          input.components,
        );
        const record = await this.requireProvider(transaction, access.organizationId, templateId);
        await this.audit.append(
          transaction,
          access,
          'ticket_provider_template.updated',
          'ticket_provider_template',
          templateId,
          {
            previousVersion: version,
            newVersion: record.version,
            componentCount: input.components.length,
          },
        );
        return serialize(record);
      }),
    );
  }

  async duplicateProvider(access: AccessContext, templateId: string, requestedName?: string) {
    const source = await this.prisma.database.ticketProviderTemplate.findFirst({
      where: { id: templateId, organizationId: access.organizationId },
      include: providerInclude,
    });
    if (!source) this.notFound();
    const input: TicketProviderTemplateInputDto = {
      name:
        requestedName ??
        (await this.availableName('provider', access.organizationId, `${source!.name} (Kopie)`)),
      description: source!.description,
      components: source!.components.map((component) => ({
        name: component.name,
        amountType: component.amountType,
        percentageRateBasisPoints: component.percentageRateBasisPoints,
        inputType: component.inputType,
        inputAmountMinor: component.inputAmountMinor?.toString() ?? null,
        taxRateTemplateId: component.taxRateTemplateId,
        guestPays: component.guestPays,
        allocations: component.allocations.map((allocation) => ({
          recipientType: allocation.recipientType,
          artistId: allocation.artistId,
          businessPartnerId: allocation.businessPartnerId,
          externalRecipientName: allocation.externalRecipientName,
          allocationType: allocation.allocationType,
          percentageBasisPoints: allocation.percentageBasisPoints,
          fixedAmountMinor: allocation.fixedAmountMinor?.toString() ?? null,
        })),
      })),
    };
    return this.createProvider(access, input);
  }

  async setProviderStatus(
    access: AccessContext,
    id: string,
    version: number,
    status: TemplateStatus,
  ) {
    await this.setSimpleStatus(
      access,
      'ticketProviderTemplate',
      'ticket_provider_template',
      id,
      version,
      status,
    );
    return this.findProvider(access.organizationId, id);
  }

  async listCalculations(organizationId: string, status: StatusFilter) {
    const rows = await this.prisma.database.calculationTemplate.findMany({
      where: { organizationId, ...(status === 'ALL' ? {} : { status }) },
      include: calculationInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(serialize);
  }

  async findCalculation(organizationId: string, templateId: string) {
    const row = await this.prisma.database.calculationTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: calculationInclude,
    });
    if (!row) this.notFound();
    return serialize(row!);
  }

  async createCalculation(access: AccessContext, input: CalculationTemplateInputDto) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Kalkulationsvorlage');
        const parent = await transaction.calculationTemplate.create({
          data: {
            organizationId: access.organizationId,
            name,
            normalizedName: normalizeName(name),
            description: cleanOptional(input.description),
            expectedGuestCount: input.expectedGuestCount ?? null,
          },
        });
        await this.writeCalculationContents(transaction, access.organizationId, parent.id, input);
        await this.audit.append(
          transaction,
          access,
          'calculation_template.created',
          'calculation_template',
          parent.id,
          {
            tierCount: input.tiers.length,
            additionalRevenueCount: input.additionalRevenues.length,
            newVersion: parent.version,
          },
        );
        return serialize(
          await this.requireCalculation(transaction, access.organizationId, parent.id),
        );
      }),
    );
  }

  async updateCalculation(
    access: AccessContext,
    templateId: string,
    version: number,
    input: CalculationTemplateInputDto,
  ) {
    return this.withKnownErrors(async () =>
      this.prisma.transaction(async (transaction) => {
        const name = cleanName(input.name, 'Der Name der Kalkulationsvorlage');
        const updated = await transaction.calculationTemplate.updateMany({
          where: { id: templateId, organizationId: access.organizationId, version },
          data: {
            name,
            normalizedName: normalizeName(name),
            description: cleanOptional(input.description),
            expectedGuestCount: input.expectedGuestCount ?? null,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict();
        await this.clearCalculationContents(transaction, access.organizationId, templateId);
        await this.writeCalculationContents(transaction, access.organizationId, templateId, input);
        const record = await this.requireCalculation(
          transaction,
          access.organizationId,
          templateId,
        );
        await this.audit.append(
          transaction,
          access,
          'calculation_template.updated',
          'calculation_template',
          templateId,
          {
            previousVersion: version,
            newVersion: record.version,
            tierCount: input.tiers.length,
            additionalRevenueCount: input.additionalRevenues.length,
          },
        );
        return serialize(record);
      }),
    );
  }

  async duplicateCalculation(access: AccessContext, templateId: string, requestedName?: string) {
    const source = await this.prisma.database.calculationTemplate.findFirst({
      where: { id: templateId, organizationId: access.organizationId },
      include: calculationInclude,
    });
    if (!source) this.notFound();
    const input = this.calculationRecordToInput(
      source!,
      requestedName ??
        (await this.availableName('calculation', access.organizationId, `${source!.name} (Kopie)`)),
    );
    return this.createCalculation(access, input);
  }

  async saveEventCalculation(
    access: AccessContext,
    eventId: string,
    input: SaveEventCalculationTemplateDto,
  ) {
    const event = await this.prisma.database.event.findFirst({
      where: { id: eventId, organizationId: access.organizationId },
      include: {
        ticketPriceTiers: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            components: {
              where: { status: 'ACTIVE' },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              include: {
                allocations: {
                  where: { status: 'ACTIVE' },
                  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                },
              },
            },
          },
        },
        additionalRevenues: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!event) this.notFound();
    const templateInput: CalculationTemplateInputDto = {
      name: input.name,
      description: cleanOptional(input.description),
      expectedGuestCount: event!.expectedGuestCount,
      tiers: event!.ticketPriceTiers.map((tier) => ({
        name: tier.name,
        expectedQuantity: tier.expectedQuantity,
        baseInputType: tier.baseInputType,
        baseInputMinor: tier.baseInputMinor?.toString() ?? null,
        baseTaxRateTemplateId: tier.baseTaxRateTemplateId,
        sourceTicketProviderTemplateId: tier.sourceTicketProviderTemplateId,
        components: tier.components.map((component) => ({
          name: component.name,
          amountType: component.amountType,
          percentageRateBasisPoints: component.percentageRateBasisPoints,
          inputType: component.inputType,
          inputAmountMinor: component.inputAmountMinor?.toString() ?? null,
          taxRateTemplateId: requiredReference(
            component.taxRateTemplateId,
            'COMPONENT_TAX_TEMPLATE_MISSING',
          ),
          guestPays: component.guestPays,
          allocations: component.allocations.map(allocationToInput),
        })),
      })),
      additionalRevenues: event!.additionalRevenues.map((revenue) => ({
        name: revenue.name,
        calculationType: revenue.calculationType,
        inputType: revenue.inputType,
        inputAmountMinor: revenue.inputAmountMinor?.toString() ?? null,
        percentageRateBasisPoints: revenue.percentageRateBasisPoints,
        taxRateTemplateId: requiredReference(
          revenue.taxRateTemplateId,
          'REVENUE_TAX_TEMPLATE_MISSING',
        ),
        confirmationStatus: revenue.confirmationStatus,
        note: revenue.note,
      })),
    };
    return this.createCalculation(access, templateInput);
  }

  async setCalculationStatus(
    access: AccessContext,
    id: string,
    version: number,
    status: TemplateStatus,
  ) {
    await this.setSimpleStatus(
      access,
      'calculationTemplate',
      'calculation_template',
      id,
      version,
      status,
    );
    return this.findCalculation(access.organizationId, id);
  }

  private async setSimpleStatus(
    access: AccessContext,
    delegate: 'taxRateTemplate' | 'ticketProviderTemplate' | 'calculationTemplate',
    targetType: string,
    id: string,
    version: number,
    status: TemplateStatus,
  ) {
    return this.prisma.transaction(async (transaction) => {
      const model = transaction[delegate] as unknown as {
        updateMany(args: object): Promise<{ count: number }>;
        findUniqueOrThrow(args: object): Promise<Record<string, unknown>>;
      };
      const result = await model.updateMany({
        where: { id, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) this.versionConflict();
      const record = await model.findUniqueOrThrow({ where: { id } });
      await this.audit.append(
        transaction,
        access,
        `${targetType}.${status === 'ARCHIVED' ? 'archived' : 'reactivated'}`,
        targetType,
        id,
        { previousVersion: version, newStatus: status },
      );
      return serialize(record);
    });
  }

  private async writeProviderContents(
    transaction: TransactionClient,
    organizationId: string,
    templateId: string,
    components: RevenueTemplateComponentInputDto[],
  ) {
    if (components.length > 100)
      this.invalid(
        'TOO_MANY_COMPONENTS',
        'Eine Vorlage darf höchstens 100 Preisstruktur-Positionen enthalten',
      );
    for (const [index, input] of components.entries()) {
      const data = await this.componentData(transaction, organizationId, input, index);
      const created = await transaction.ticketProviderTemplateComponent.create({
        data: { organizationId, ticketProviderTemplateId: templateId, ...data.component },
      });
      if (data.allocations.length) {
        await transaction.ticketProviderTemplateAllocation.createMany({
          data: data.allocations.map((allocation) => ({
            organizationId,
            ticketProviderTemplateComponentId: created.id,
            ...allocation,
          })),
        });
      }
    }
  }

  private async clearProviderContents(
    transaction: TransactionClient,
    organizationId: string,
    templateId: string,
  ) {
    const components = await transaction.ticketProviderTemplateComponent.findMany({
      where: { organizationId, ticketProviderTemplateId: templateId },
      select: { id: true },
    });
    const ids = components.map(({ id }) => id);
    if (ids.length)
      await transaction.ticketProviderTemplateAllocation.deleteMany({
        where: { organizationId, ticketProviderTemplateComponentId: { in: ids } },
      });
    await transaction.ticketProviderTemplateComponent.deleteMany({
      where: { organizationId, ticketProviderTemplateId: templateId },
    });
  }

  private async writeCalculationContents(
    transaction: TransactionClient,
    organizationId: string,
    templateId: string,
    input: CalculationTemplateInputDto,
  ) {
    if (input.tiers.length > 100 || input.additionalRevenues.length > 100)
      this.invalid(
        'TEMPLATE_TOO_LARGE',
        'Eine Kalkulationsvorlage darf je Bereich höchstens 100 Positionen enthalten',
      );
    for (const [tierIndex, tierInput] of input.tiers.entries()) {
      const tierData = await this.tierData(transaction, organizationId, tierInput, tierIndex);
      const tier = await transaction.calculationTemplateTier.create({
        data: { organizationId, calculationTemplateId: templateId, ...tierData },
      });
      for (const [componentIndex, componentInput] of (tierInput.components ?? []).entries()) {
        const data = await this.componentData(
          transaction,
          organizationId,
          componentInput,
          componentIndex,
        );
        const component = await transaction.calculationTemplateComponent.create({
          data: { organizationId, calculationTemplateTierId: tier.id, ...data.component },
        });
        if (data.allocations.length) {
          await transaction.calculationTemplateAllocation.createMany({
            data: data.allocations.map((allocation) => ({
              organizationId,
              calculationTemplateComponentId: component.id,
              ...allocation,
            })),
          });
        }
      }
    }
    for (const [index, revenueInput] of input.additionalRevenues.entries()) {
      const data = await this.additionalRevenueData(
        transaction,
        organizationId,
        revenueInput,
        index,
      );
      await transaction.calculationTemplateAdditionalRevenue.create({
        data: { organizationId, calculationTemplateId: templateId, ...data },
      });
    }
  }

  private async clearCalculationContents(
    transaction: TransactionClient,
    organizationId: string,
    templateId: string,
  ) {
    const tiers = await transaction.calculationTemplateTier.findMany({
      where: { organizationId, calculationTemplateId: templateId },
      select: { id: true },
    });
    const tierIds = tiers.map(({ id }) => id);
    const components = tierIds.length
      ? await transaction.calculationTemplateComponent.findMany({
          where: { organizationId, calculationTemplateTierId: { in: tierIds } },
          select: { id: true },
        })
      : [];
    const componentIds = components.map(({ id }) => id);
    if (componentIds.length)
      await transaction.calculationTemplateAllocation.deleteMany({
        where: { organizationId, calculationTemplateComponentId: { in: componentIds } },
      });
    if (tierIds.length)
      await transaction.calculationTemplateComponent.deleteMany({
        where: { organizationId, calculationTemplateTierId: { in: tierIds } },
      });
    await transaction.calculationTemplateTier.deleteMany({
      where: { organizationId, calculationTemplateId: templateId },
    });
    await transaction.calculationTemplateAdditionalRevenue.deleteMany({
      where: { organizationId, calculationTemplateId: templateId },
    });
  }

  private async componentData(
    transaction: TransactionClient,
    organizationId: string,
    input: RevenueTemplateComponentInputDto,
    sortOrder: number,
  ) {
    const tax = await this.requireTax(transaction, organizationId, input.taxRateTemplateId);
    const inputAmount = parseRevenueMinor(
      input.inputAmountMinor,
      'Der Betrag der Preisstruktur-Position',
    );
    const percentage = input.percentageRateBasisPoints ?? null;
    if (input.amountType === 'FIXED' && inputAmount === null)
      this.invalid(
        'COMPONENT_AMOUNT_REQUIRED',
        'Für einen festen Betrag ist ein Wert erforderlich',
      );
    if (input.amountType === 'PERCENTAGE' && percentage === null)
      this.invalid(
        'COMPONENT_PERCENTAGE_REQUIRED',
        'Für eine prozentuale Position ist ein Prozentsatz erforderlich',
      );
    if (percentage !== null) assertBasisPoints(percentage, 'Der Prozentsatz');
    const allocations = [];
    for (const [index, allocation] of (input.allocations ?? []).entries()) {
      allocations.push(await this.allocationData(transaction, organizationId, allocation, index));
    }
    return {
      component: {
        name: cleanName(input.name, 'Die Bezeichnung der Preisstruktur-Position'),
        amountType: input.amountType,
        percentageBasis: input.amountType === 'PERCENTAGE' ? ('TICKET_BASE_GROSS' as const) : null,
        percentageRateBasisPoints: input.amountType === 'PERCENTAGE' ? percentage : null,
        inputType: input.inputType,
        inputAmountMinor: input.amountType === 'FIXED' ? inputAmount : null,
        taxRateTemplateId: tax.id,
        taxRateTemplateVersion: tax.version,
        taxRateNameSnapshot: tax.name,
        taxRateBasisPoints: tax.rateBasisPoints,
        guestPays: input.guestPays ?? true,
        sortOrder,
      },
      allocations,
    };
  }

  private async allocationData(
    transaction: TransactionClient,
    organizationId: string,
    input: RevenueTemplateAllocationInputDto,
    sortOrder: number,
  ) {
    const artistId = input.recipientType === 'ARTIST' ? (input.artistId ?? null) : null;
    const businessPartnerId =
      input.recipientType === 'BUSINESS_PARTNER' ? (input.businessPartnerId ?? null) : null;
    const externalRecipientName =
      input.recipientType === 'EXTERNAL'
        ? cleanName(input.externalRecipientName ?? '', 'Der externe Empfänger')
        : null;
    if (input.recipientType === 'ARTIST') {
      if (
        !artistId ||
        !(await transaction.artist.count({
          where: { id: artistId, organizationId, status: 'ACTIVE' },
        }))
      )
        this.invalid(
          'INVALID_TEMPLATE_RECIPIENT',
          'Der gewählte Artist ist nicht aktiv oder gehört nicht zur Organisation',
        );
    }
    if (input.recipientType === 'BUSINESS_PARTNER') {
      if (
        !businessPartnerId ||
        !(await transaction.businessPartner.count({
          where: { id: businessPartnerId, organizationId, status: 'ACTIVE' },
        }))
      )
        this.invalid(
          'INVALID_TEMPLATE_RECIPIENT',
          'Der gewählte Geschäftspartner ist nicht aktiv oder gehört nicht zur Organisation',
        );
    }
    const fixed = parseRevenueMinor(input.fixedAmountMinor, 'Der feste Empfänger-Anteil');
    const percentage = input.percentageBasisPoints ?? null;
    if (input.allocationType === 'FIXED' && fixed === null)
      this.invalid(
        'ALLOCATION_AMOUNT_REQUIRED',
        'Für eine feste Aufteilung ist ein Betrag erforderlich',
      );
    if (input.allocationType === 'PERCENTAGE' && percentage === null)
      this.invalid(
        'ALLOCATION_PERCENTAGE_REQUIRED',
        'Für eine prozentuale Aufteilung ist ein Prozentsatz erforderlich',
      );
    if (percentage !== null && (percentage < 0 || percentage > 10_000))
      this.invalid(
        'ALLOCATION_PERCENTAGE_INVALID',
        'Der Aufteilungs-Prozentsatz muss zwischen 0 und 100 Prozent liegen',
      );
    return {
      recipientType: input.recipientType,
      artistId,
      businessPartnerId,
      externalRecipientName,
      allocationType: input.allocationType,
      percentageBasisPoints: input.allocationType === 'PERCENTAGE' ? percentage : null,
      fixedAmountMinor: input.allocationType === 'FIXED' ? fixed : null,
      sortOrder,
    };
  }

  private async tierData(
    transaction: TransactionClient,
    organizationId: string,
    input: CalculationTemplateTierInputDto,
    sortOrder: number,
  ) {
    const amount = parseRevenueMinor(input.baseInputMinor, 'Der Ticketgrundpreis');
    const inputType = input.baseInputType ?? null;
    const taxId = input.baseTaxRateTemplateId ?? null;
    const empty = amount === null && inputType === null && taxId === null;
    if (!empty && (amount === null || inputType === null || taxId === null))
      this.invalid(
        'TICKET_BASE_PRICE_INCOMPLETE',
        'Ticketgrundpreis, Eingabeart und Steuersatzvorlage müssen gemeinsam angegeben werden',
      );
    const tax = taxId ? await this.requireTax(transaction, organizationId, taxId) : null;
    const converted =
      tax && amount !== null && inputType
        ? convertNetGross(amount, inputType, tax.rateBasisPoints)
        : null;
    const provider = input.sourceTicketProviderTemplateId
      ? await transaction.ticketProviderTemplate.findFirst({
          where: { id: input.sourceTicketProviderTemplateId, organizationId, status: 'ACTIVE' },
        })
      : null;
    if (input.sourceTicketProviderTemplateId && !provider)
      this.invalid(
        'TICKET_PROVIDER_TEMPLATE_INVALID',
        'Die Ticketanbieter-Vorlage ist nicht aktiv oder gehört nicht zur Organisation',
      );
    return {
      name: cleanName(input.name, 'Die Ticketstufen-Bezeichnung'),
      expectedQuantity: input.expectedQuantity ?? 0,
      baseInputType: empty ? null : inputType,
      baseInputMinor: empty ? null : amount,
      baseNetUnitMinor: converted?.netMinor ?? null,
      baseGrossUnitMinor: converted?.grossMinor ?? null,
      baseTaxRateTemplateId: tax?.id ?? null,
      baseTaxRateTemplateVersion: tax?.version ?? null,
      baseTaxRateNameSnapshot: tax?.name ?? null,
      baseTaxRateBasisPoints: tax?.rateBasisPoints ?? null,
      sourceTicketProviderTemplateId: provider?.id ?? null,
      sourceTicketProviderTemplateVersion: provider?.version ?? null,
      sourceTicketProviderNameSnapshot: provider?.name ?? null,
      sortOrder,
    };
  }

  private async additionalRevenueData(
    transaction: TransactionClient,
    organizationId: string,
    input: CalculationTemplateAdditionalRevenueInputDto,
    sortOrder: number,
  ) {
    const tax = await this.requireTax(transaction, organizationId, input.taxRateTemplateId);
    const amount = parseRevenueMinor(input.inputAmountMinor, 'Der zusätzliche Erlös');
    const percentage = input.percentageRateBasisPoints ?? null;
    const percentageType = input.calculationType === 'PERCENT_TICKET_BASE_NET';
    if (percentageType && percentage === null)
      this.invalid(
        'ADDITIONAL_REVENUE_PERCENTAGE_REQUIRED',
        'Für prozentuale Erlöse ist ein Prozentsatz erforderlich',
      );
    if (!percentageType && amount === null)
      this.invalid(
        'ADDITIONAL_REVENUE_AMOUNT_REQUIRED',
        'Für diesen Erlös ist ein Betrag erforderlich',
      );
    if (percentage !== null) assertBasisPoints(percentage, 'Der Erlös-Prozentsatz');
    return {
      name: cleanName(input.name, 'Die Erlös-Bezeichnung'),
      calculationType: input.calculationType,
      inputType: input.inputType,
      inputAmountMinor: percentageType ? null : amount,
      percentageRateBasisPoints: percentageType ? percentage : null,
      taxRateTemplateId: tax.id,
      taxRateTemplateVersion: tax.version,
      taxRateNameSnapshot: tax.name,
      taxRateBasisPoints: tax.rateBasisPoints,
      confirmationStatus: input.confirmationStatus ?? 'PLANNED',
      note: cleanOptional(input.note),
      sortOrder,
    };
  }

  private async requireTax(transaction: TransactionClient, organizationId: string, id: string) {
    const tax = await transaction.taxRateTemplate.findFirst({
      where: { id, organizationId, status: 'ACTIVE' },
    });
    if (!tax)
      this.invalid(
        'TAX_RATE_TEMPLATE_INVALID',
        'Die Steuersatzvorlage ist nicht aktiv oder gehört nicht zur Organisation',
      );
    return tax!;
  }

  private requireProvider(transaction: TransactionClient, organizationId: string, id: string) {
    return transaction.ticketProviderTemplate.findFirstOrThrow({
      where: { id, organizationId },
      include: providerInclude,
    });
  }

  private requireCalculation(transaction: TransactionClient, organizationId: string, id: string) {
    return transaction.calculationTemplate.findFirstOrThrow({
      where: { id, organizationId },
      include: calculationInclude,
    });
  }

  private calculationRecordToInput(
    source: Prisma.CalculationTemplateGetPayload<{ include: typeof calculationInclude }>,
    name: string,
  ): CalculationTemplateInputDto {
    return {
      name,
      description: source.description,
      expectedGuestCount: source.expectedGuestCount,
      tiers: source.tiers.map((tier) => ({
        name: tier.name,
        expectedQuantity: tier.expectedQuantity,
        baseInputType: tier.baseInputType,
        baseInputMinor: tier.baseInputMinor?.toString() ?? null,
        baseTaxRateTemplateId: tier.baseTaxRateTemplateId,
        sourceTicketProviderTemplateId: tier.sourceTicketProviderTemplateId,
        components: tier.components.map((component) => ({
          name: component.name,
          amountType: component.amountType,
          percentageRateBasisPoints: component.percentageRateBasisPoints,
          inputType: component.inputType,
          inputAmountMinor: component.inputAmountMinor?.toString() ?? null,
          taxRateTemplateId: component.taxRateTemplateId,
          guestPays: component.guestPays,
          allocations: component.allocations.map(allocationToInput),
        })),
      })),
      additionalRevenues: source.additionalRevenues.map((revenue) => ({
        name: revenue.name,
        calculationType: revenue.calculationType,
        inputType: revenue.inputType,
        inputAmountMinor: revenue.inputAmountMinor?.toString() ?? null,
        percentageRateBasisPoints: revenue.percentageRateBasisPoints,
        taxRateTemplateId: revenue.taxRateTemplateId,
        confirmationStatus: revenue.confirmationStatus,
        note: revenue.note,
      })),
    };
  }

  private async availableName(
    type: 'provider' | 'calculation',
    organizationId: string,
    base: string,
  ) {
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base} ${suffix + 1}`;
      const count =
        type === 'provider'
          ? await this.prisma.database.ticketProviderTemplate.count({
              where: { organizationId, normalizedName: normalizeName(candidate) },
            })
          : await this.prisma.database.calculationTemplate.count({
              where: { organizationId, normalizedName: normalizeName(candidate) },
            });
      if (!count) return candidate;
    }
    this.invalid(
      'DUPLICATE_NAME_UNAVAILABLE',
      'Für die Kopie konnte kein freier Name erzeugt werden',
    );
  }

  private async withKnownErrors<T>(callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'TEMPLATE_NAME_CONFLICT',
          message: 'Der Vorlagenname ist in dieser Organisation bereits vergeben',
        });
      }
      throw error;
    }
  }

  private invalid(code: string, message: string): never {
    throw new UnprocessableEntityException({ code, message });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'REVENUE_TEMPLATE_NOT_FOUND',
      message: 'Die Vorlage wurde nicht gefunden',
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Vorlage wurde zwischenzeitlich geändert',
    });
  }
}

function allocationToInput(allocation: {
  recipientType: 'ORGANIZATION' | 'ARTIST' | 'BUSINESS_PARTNER' | 'EXTERNAL';
  artistId: string | null;
  businessPartnerId: string | null;
  externalRecipientName: string | null;
  allocationType: 'FIXED' | 'PERCENTAGE';
  percentageBasisPoints: number | null;
  fixedAmountMinor: bigint | null;
}): RevenueTemplateAllocationInputDto {
  return {
    recipientType: allocation.recipientType,
    artistId: allocation.artistId,
    businessPartnerId: allocation.businessPartnerId,
    externalRecipientName: allocation.externalRecipientName,
    allocationType: allocation.allocationType,
    percentageBasisPoints: allocation.percentageBasisPoints,
    fixedAmountMinor: allocation.fixedAmountMinor?.toString() ?? null,
  };
}

function cleanName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name)
    throw new UnprocessableEntityException({
      code: 'TEMPLATE_NAME_REQUIRED',
      message: `${label} ist erforderlich`,
    });
  return name;
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function cleanOptional(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function assertBasisPoints(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100_000) {
    throw new UnprocessableEntityException({
      code: 'INVALID_BASIS_POINTS',
      message: `${label} muss zwischen 0 und 1000 Prozent liegen`,
    });
  }
}

function requiredReference(value: string | null, code: string): string {
  if (!value)
    throw new UnprocessableEntityException({
      code,
      message: 'Die bestehende Position besitzt keine Steuersatzvorlagen-Referenz',
    });
  return value;
}

function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}
