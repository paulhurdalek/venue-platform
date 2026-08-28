import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseClient, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import { calculateLineTotal } from '../../services/domain/service-calculation.rules.js';
import type {
  AdditionalRevenueRecord,
  AdditionalRevenueValues,
  ComponentValues,
  RevenueApprovalBlocker,
  RevenuePlanRecord,
  RevenuePlanTotals,
  TicketComponentRecord,
  TicketTierRecord,
  TicketTierValues,
} from '../application/revenue-planning.models.js';
import {
  RevenuePlanningPersistenceError,
  type RevenuePlanningRepository,
} from '../application/revenue-planning.repository.js';
import {
  resolveAdditionalRevenue,
  resolveAllocations,
  resolveComponentAmount,
  type NetGrossPair,
} from '../domain/revenue-planning.rules.js';
import {
  applyCalculationTemplateSnapshot,
  previewCalculationTemplate,
  type TemplateRecipientResolution,
} from './calculation-template-snapshot.js';

type Database = DatabaseClient | TransactionClient;

const planInclude = {
  event: {
    select: {
      id: true,
      version: true,
      name: true,
      locationId: true,
      expectedGuestCount: true,
      bookings: {
        where: { status: { in: ['SHORTLISTED', 'REQUESTED', 'OPTION', 'CONFIRMED'] } },
        select: {
          status: true,
          agreedFeeMinor: true,
          agreedFeeCurrency: true,
          travelCostMinor: true,
          travelCostCurrency: true,
          hotelArrangement: true,
          hotelBuyoutMinor: true,
          hotelBuyoutCurrency: true,
        },
      },
    },
  },
  positions: true,
  ticketPriceTiers: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      components: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          allocations: {
            where: { status: 'ACTIVE' },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: {
              artist: {
                select: { stageName: true, firstName: true, lastName: true, status: true },
              },
              businessPartner: { select: { companyName: true, status: true } },
            },
          },
        },
      },
    },
  },
  additionalRevenues: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.EventCalculationInclude;

type PlanRow = Prisma.EventCalculationGetPayload<{ include: typeof planInclude }>;
type TierRow = PlanRow['ticketPriceTiers'][number];
type ComponentRow = TierRow['components'][number];
type AdditionalRevenueRow = PlanRow['additionalRevenues'][number];

@Injectable()
export class PrismaRevenuePlanningRepository implements RevenuePlanningRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly auditWriter: AuditWriter,
  ) {}

  findPlan(access: AccessContext, eventId: string): Promise<RevenuePlanRecord | undefined> {
    return this.findPlanWith(this.prisma.database, access, eventId);
  }

  previewCalculationTemplate(
    access: AccessContext,
    eventId: string,
    templateId: string,
  ): Promise<object> {
    return this.prisma.transaction((database) =>
      previewCalculationTemplate(database, access.organizationId, eventId, templateId),
    );
  }

  applyCalculationTemplate(
    access: AccessContext,
    eventId: string,
    templateId: string,
    calculationVersion: number,
    confirmReplacement: boolean,
    resolutions: TemplateRecipientResolution[],
  ) {
    return this.prisma.transaction(async (database) => {
      const preview = await applyCalculationTemplateSnapshot(
        database,
        access.organizationId,
        eventId,
        templateId,
        {
          calculationVersion,
          confirmReplacement,
          resolutions,
          userId: access.user.id,
          membershipId: access.membershipId,
        },
      );
      await this.audit(
        database,
        access,
        'calculation_template.applied',
        'event_calculation',
        preview.calculationId,
        {
          eventId,
          calculationTemplateId: templateId,
          calculationTemplateVersion: preview.templateVersion,
          replacement: preview.replacementRequired,
          removedOrReplacedRecipientCount: resolutions.length,
        },
      );
      return this.requirePlan(database, access, eventId);
    });
  }

  async findActiveTaxRateTemplate(access: AccessContext, templateId: string) {
    return (
      (await this.prisma.database.taxRateTemplate.findFirst({
        where: { id: templateId, organizationId: access.organizationId, status: 'ACTIVE' },
        select: { id: true, name: true, version: true, rateBasisPoints: true },
      })) ?? undefined
    );
  }

  setExpectedGuests(
    access: AccessContext,
    eventId: string,
    eventVersion: number,
    expectedGuestCount: number | null,
  ) {
    return this.prisma.transaction(async (database) => {
      const calculation = await this.lockCalculationForEvent(database, access, eventId);
      const result = await database.event.updateMany({
        where: { id: eventId, organizationId: access.organizationId, version: eventVersion },
        data: { expectedGuestCount, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'event',
        eventId,
        'Erwartete Gästezahl geändert',
      );
      await this.audit(database, access, 'event.expected_guest_count_changed', 'event', eventId, {
        previousVersion: eventVersion,
        newVersion: eventVersion + 1,
        valuePresent: expectedGuestCount !== null,
      });
      return this.findPlanWith(database, access, eventId);
    });
  }

  createTicketTier(access: AccessContext, eventId: string, values: TicketTierValues) {
    return this.prisma.transaction(async (database) => {
      const calculation = await this.lockCalculationForEvent(database, access, eventId);
      const {
        components: inputComponents,
        sourceTicketProviderTemplateId,
        sortOrder: _sortOrder,
        ...tierValues
      } = values;
      void _sortOrder;
      const lastTier = await database.ticketPriceTier.aggregate({
        where: { organizationId: access.organizationId, eventId },
        _max: { sortOrder: true },
      });
      const provider = sourceTicketProviderTemplateId
        ? await database.ticketProviderTemplate.findFirst({
            where: {
              id: sourceTicketProviderTemplateId,
              organizationId: access.organizationId,
              status: 'ACTIVE',
            },
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
          })
        : null;
      if (sourceTicketProviderTemplateId && !provider) {
        this.referenceNotFound(
          'TICKET_PROVIDER_TEMPLATE_INVALID',
          'Die Ticketanbieter-Vorlage ist nicht aktiv oder gehört nicht zur Organisation',
        );
      }
      const providerComponents: ComponentValues[] = (provider?.components ?? []).map(
        (component, index) => ({
          name: component.name,
          amountType: component.amountType,
          percentageRateBasisPoints: component.percentageRateBasisPoints,
          inputType: component.inputType,
          inputAmountMinor: component.inputAmountMinor,
          taxRateBasisPoints: component.taxRateBasisPoints,
          taxRateTemplateId: component.taxRateTemplateId,
          taxRateTemplateVersion: component.taxRateTemplateVersion,
          taxRateNameSnapshot: component.taxRateNameSnapshot,
          guestPays: component.guestPays,
          sortOrder: index,
          allocations: component.allocations.map((allocation, allocationIndex) => ({
            recipientType: allocation.recipientType,
            artistId: allocation.artistId,
            businessPartnerId: allocation.businessPartnerId,
            externalRecipientName: allocation.externalRecipientName,
            allocationType: allocation.allocationType,
            percentageBasisPoints: allocation.percentageBasisPoints,
            fixedAmountMinor: allocation.fixedAmountMinor,
            sortOrder: allocationIndex,
          })),
        }),
      );
      const components = [...providerComponents, ...inputComponents].map((component, index) => ({
        ...component,
        sortOrder: index,
      }));
      for (const component of components) {
        await this.validateRecipients(database, access.organizationId, component);
      }
      const tier = await database.ticketPriceTier.create({
        data: {
          organizationId: access.organizationId,
          eventId,
          calculationId: calculation.id,
          ...tierValues,
          sourceTicketProviderTemplateId: provider?.id ?? null,
          sourceTicketProviderTemplateVersion: provider?.version ?? null,
          sourceTicketProviderNameSnapshot: provider?.name ?? null,
          sortOrder: (lastTier._max.sortOrder ?? -1) + 1,
        },
      });
      for (const componentValues of components) {
        const component = await database.ticketPriceComponent.create({
          data: {
            organizationId: access.organizationId,
            ticketPriceTierId: tier.id,
            name: componentValues.name,
            amountType: componentValues.amountType,
            percentageBasis:
              componentValues.amountType === 'PERCENTAGE' ? 'TICKET_BASE_GROSS' : null,
            percentageRateBasisPoints: componentValues.percentageRateBasisPoints,
            inputType: componentValues.inputType,
            inputAmountMinor: componentValues.inputAmountMinor,
            taxRateBasisPoints: componentValues.taxRateBasisPoints,
            taxRateTemplateId: componentValues.taxRateTemplateId,
            taxRateTemplateVersion: componentValues.taxRateTemplateVersion,
            taxRateNameSnapshot: componentValues.taxRateNameSnapshot,
            guestPays: componentValues.guestPays,
            sortOrder: componentValues.sortOrder,
          },
        });
        await this.createAllocations(
          database,
          access.organizationId,
          component.id,
          componentValues,
        );
      }
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_tier',
        tier.id,
        'Ticketpreis-Stufe angelegt',
      );
      await this.audit(
        database,
        access,
        'ticket_price_tier.created',
        'ticket_price_tier',
        tier.id,
        {
          eventId,
          expectedQuantity: values.expectedQuantity,
          pricePresent: values.baseInputMinor !== null,
          sourceTicketProviderTemplateId: provider?.id ?? null,
          componentCount: components.length,
        },
      );
      return (await this.requirePlan(database, access, eventId)).ticketTiers.find(
        (item) => item.id === tier.id,
      )!;
    });
  }

  updateTicketTier(
    access: AccessContext,
    tierId: string,
    version: number,
    values: TicketTierValues,
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findTierSource(database, access, tierId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      const {
        components: _components,
        sourceTicketProviderTemplateId: _providerId,
        sortOrder: _sortOrder,
        ...tierValues
      } = values;
      void _components;
      void _providerId;
      void _sortOrder;
      const result = await database.ticketPriceTier.updateMany({
        where: { id: tierId, organizationId: access.organizationId, version },
        data: { ...tierValues, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_tier',
        tierId,
        'Ticketpreis-Stufe geändert',
      );
      await this.audit(database, access, 'ticket_price_tier.updated', 'ticket_price_tier', tierId, {
        eventId: current.eventId,
        previousVersion: version,
        newVersion: version + 1,
        expectedQuantity: values.expectedQuantity,
        pricePresent: values.baseInputMinor !== null,
      });
      return (await this.requirePlan(database, access, current.eventId)).ticketTiers.find(
        (item) => item.id === tierId,
      );
    });
  }

  setTicketTierStatus(
    access: AccessContext,
    tierId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findTierSource(database, access, tierId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      const result = await database.ticketPriceTier.updateMany({
        where: { id: tierId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_tier',
        tierId,
        status === 'ARCHIVED' ? 'Ticketpreis-Stufe archiviert' : 'Ticketpreis-Stufe reaktiviert',
      );
      await this.audit(
        database,
        access,
        status === 'ARCHIVED' ? 'ticket_price_tier.archived' : 'ticket_price_tier.reactivated',
        'ticket_price_tier',
        tierId,
        { eventId: current.eventId, previousVersion: version, newVersion: version + 1 },
      );
      return (await this.requirePlan(database, access, current.eventId)).ticketTiers.find(
        (item) => item.id === tierId,
      );
    });
  }

  createComponent(access: AccessContext, tierId: string, values: ComponentValues) {
    return this.prisma.transaction(async (database) => {
      const tier = await this.findTierSource(database, access, tierId);
      if (!tier)
        this.referenceNotFound('TICKET_TIER_NOT_FOUND', 'Ticketpreis-Stufe nicht gefunden');
      const calculation = await this.lockCalculationForEvent(database, access, tier!.eventId);
      await this.validateRecipients(database, access.organizationId, values);
      const lastComponent = await database.ticketPriceComponent.aggregate({
        where: { organizationId: access.organizationId, ticketPriceTierId: tierId },
        _max: { sortOrder: true },
      });
      const component = await database.ticketPriceComponent.create({
        data: {
          organizationId: access.organizationId,
          ticketPriceTierId: tierId,
          name: values.name,
          amountType: values.amountType,
          percentageBasis: values.amountType === 'PERCENTAGE' ? 'TICKET_BASE_GROSS' : null,
          percentageRateBasisPoints: values.percentageRateBasisPoints,
          inputType: values.inputType,
          inputAmountMinor: values.inputAmountMinor,
          taxRateBasisPoints: values.taxRateBasisPoints,
          taxRateTemplateId: values.taxRateTemplateId,
          taxRateTemplateVersion: values.taxRateTemplateVersion,
          taxRateNameSnapshot: values.taxRateNameSnapshot,
          guestPays: values.guestPays,
          sortOrder: (lastComponent._max.sortOrder ?? -1) + 1,
        },
      });
      await this.createAllocations(database, access.organizationId, component.id, values);
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_component',
        component.id,
        'Ticket-Preisbestandteil angelegt',
      );
      await this.audit(
        database,
        access,
        'ticket_price_component.created',
        'ticket_price_component',
        component.id,
        {
          eventId: tier!.eventId,
          ticketPriceTierId: tierId,
          amountType: values.amountType,
          allocationCount: values.allocations.length,
          guestPays: values.guestPays,
        },
      );
      return this.findMappedComponent(database, access, tier!.eventId, component.id);
    });
  }

  updateComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    values: ComponentValues,
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findComponentSource(database, access, componentId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      await this.validateRecipients(database, access.organizationId, values);
      const now = new Date();
      const result = await database.ticketPriceComponent.updateMany({
        where: { id: componentId, organizationId: access.organizationId, version },
        data: {
          name: values.name,
          amountType: values.amountType,
          percentageBasis: values.amountType === 'PERCENTAGE' ? 'TICKET_BASE_GROSS' : null,
          percentageRateBasisPoints: values.percentageRateBasisPoints,
          inputType: values.inputType,
          inputAmountMinor: values.inputAmountMinor,
          taxRateBasisPoints: values.taxRateBasisPoints,
          taxRateTemplateId: values.taxRateTemplateId,
          taxRateTemplateVersion: values.taxRateTemplateVersion,
          taxRateNameSnapshot: values.taxRateNameSnapshot,
          guestPays: values.guestPays,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await database.ticketComponentAllocation.updateMany({
        where: {
          organizationId: access.organizationId,
          ticketPriceComponentId: componentId,
          status: 'ACTIVE',
        },
        data: { status: 'ARCHIVED', archivedAt: now, version: { increment: 1 } },
      });
      await this.createAllocations(database, access.organizationId, componentId, values);
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_component',
        componentId,
        'Ticket-Preisbestandteil geändert',
      );
      await this.audit(
        database,
        access,
        'ticket_price_component.updated',
        'ticket_price_component',
        componentId,
        {
          eventId: current.eventId,
          previousVersion: version,
          newVersion: version + 1,
          amountType: values.amountType,
          allocationCount: values.allocations.length,
          guestPays: values.guestPays,
        },
      );
      return this.findMappedComponent(database, access, current.eventId, componentId);
    });
  }

  setComponentStatus(
    access: AccessContext,
    componentId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findComponentSource(database, access, componentId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      const result = await database.ticketPriceComponent.updateMany({
        where: { id: componentId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_component',
        componentId,
        status === 'ARCHIVED'
          ? 'Ticket-Preisbestandteil archiviert'
          : 'Ticket-Preisbestandteil reaktiviert',
      );
      await this.audit(
        database,
        access,
        status === 'ARCHIVED'
          ? 'ticket_price_component.archived'
          : 'ticket_price_component.reactivated',
        'ticket_price_component',
        componentId,
        { eventId: current.eventId, previousVersion: version, newVersion: version + 1 },
      );
      return this.findMappedComponent(database, access, current.eventId, componentId);
    });
  }

  createAdditionalRevenue(access: AccessContext, eventId: string, values: AdditionalRevenueValues) {
    return this.prisma.transaction(async (database) => {
      const calculation = await this.lockCalculationForEvent(database, access, eventId);
      const lastRevenue = await database.additionalRevenue.aggregate({
        where: { organizationId: access.organizationId, eventId },
        _max: { sortOrder: true },
      });
      const revenue = await database.additionalRevenue.create({
        data: {
          organizationId: access.organizationId,
          eventId,
          calculationId: calculation.id,
          ...values,
          sortOrder: (lastRevenue._max.sortOrder ?? -1) + 1,
        },
      });
      await this.touchCalculation(
        database,
        access,
        calculation,
        'additional_revenue',
        revenue.id,
        'Weiterer Erlös angelegt',
      );
      await this.audit(
        database,
        access,
        'additional_revenue.created',
        'additional_revenue',
        revenue.id,
        {
          eventId,
          calculationType: values.calculationType,
          confirmationStatus: values.confirmationStatus,
        },
      );
      return (await this.requirePlan(database, access, eventId)).additionalRevenues.find(
        (item) => item.id === revenue.id,
      )!;
    });
  }

  updateAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    values: AdditionalRevenueValues,
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findAdditionalSource(database, access, revenueId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      const { sortOrder: _sortOrder, ...revenueValues } = values;
      void _sortOrder;
      const result = await database.additionalRevenue.updateMany({
        where: { id: revenueId, organizationId: access.organizationId, version },
        data: { ...revenueValues, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'additional_revenue',
        revenueId,
        'Weiterer Erlös geändert',
      );
      await this.audit(
        database,
        access,
        'additional_revenue.updated',
        'additional_revenue',
        revenueId,
        {
          eventId: current.eventId,
          previousVersion: version,
          newVersion: version + 1,
          calculationType: values.calculationType,
          confirmationStatus: values.confirmationStatus,
        },
      );
      return (await this.requirePlan(database, access, current.eventId)).additionalRevenues.find(
        (item) => item.id === revenueId,
      );
    });
  }

  setAdditionalRevenueStatus(
    access: AccessContext,
    revenueId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findAdditionalSource(database, access, revenueId);
      if (!current) return undefined;
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      const result = await database.additionalRevenue.updateMany({
        where: { id: revenueId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'additional_revenue',
        revenueId,
        status === 'ARCHIVED' ? 'Weiterer Erlös archiviert' : 'Weiterer Erlös reaktiviert',
      );
      await this.audit(
        database,
        access,
        status === 'ARCHIVED' ? 'additional_revenue.archived' : 'additional_revenue.reactivated',
        'additional_revenue',
        revenueId,
        { eventId: current.eventId, previousVersion: version, newVersion: version + 1 },
      );
      return (await this.requirePlan(database, access, current.eventId)).additionalRevenues.find(
        (item) => item.id === revenueId,
      );
    });
  }

  moveTicketTier(access: AccessContext, tierId: string, version: number, direction: 'UP' | 'DOWN') {
    return this.prisma.transaction(async (database) => {
      const current = await this.findTierSource(database, access, tierId);
      if (!current || current.version !== version) return undefined;
      const rows = await database.ticketPriceTier.findMany({
        where: {
          organizationId: access.organizationId,
          eventId: current.eventId,
          status: 'ACTIVE',
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true },
      });
      const index = rows.findIndex(({ id }) => id === tierId);
      const nextIndex = direction === 'UP' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) {
        return (await this.requirePlan(database, access, current.eventId)).ticketTiers.find(
          (item) => item.id === tierId,
        );
      }
      [rows[index], rows[nextIndex]] = [rows[nextIndex]!, rows[index]!];
      await this.persistTierOrder(database, access.organizationId, rows);
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_tier',
        tierId,
        'Ticketstufen-Reihenfolge geändert',
      );
      await this.audit(
        database,
        access,
        'ticket_price_tier.reordered',
        'ticket_price_tier',
        tierId,
        { eventId: current.eventId, direction },
      );
      return (await this.requirePlan(database, access, current.eventId)).ticketTiers.find(
        (item) => item.id === tierId,
      );
    });
  }

  moveComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findComponentSource(database, access, componentId);
      if (!current || current.version !== version) return undefined;
      const rows = await database.ticketPriceComponent.findMany({
        where: {
          organizationId: access.organizationId,
          ticketPriceTierId: current.tierId,
          status: 'ACTIVE',
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true },
      });
      const index = rows.findIndex(({ id }) => id === componentId);
      const nextIndex = direction === 'UP' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) {
        return this.findMappedComponent(database, access, current.eventId, componentId);
      }
      [rows[index], rows[nextIndex]] = [rows[nextIndex]!, rows[index]!];
      await this.persistComponentOrder(database, access.organizationId, rows);
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      await this.touchCalculation(
        database,
        access,
        calculation,
        'ticket_price_component',
        componentId,
        'Preisstruktur-Reihenfolge geändert',
      );
      await this.audit(
        database,
        access,
        'ticket_price_component.reordered',
        'ticket_price_component',
        componentId,
        { eventId: current.eventId, ticketPriceTierId: current.tierId, direction },
      );
      return this.findMappedComponent(database, access, current.eventId, componentId);
    });
  }

  moveAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.findAdditionalSource(database, access, revenueId);
      if (!current || current.version !== version) return undefined;
      const rows = await database.additionalRevenue.findMany({
        where: {
          organizationId: access.organizationId,
          eventId: current.eventId,
          status: 'ACTIVE',
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true },
      });
      const index = rows.findIndex(({ id }) => id === revenueId);
      const nextIndex = direction === 'UP' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) {
        return (await this.requirePlan(database, access, current.eventId)).additionalRevenues.find(
          (item) => item.id === revenueId,
        );
      }
      [rows[index], rows[nextIndex]] = [rows[nextIndex]!, rows[index]!];
      await this.persistAdditionalRevenueOrder(database, access.organizationId, rows);
      const calculation = await this.lockCalculationForEvent(database, access, current.eventId);
      await this.touchCalculation(
        database,
        access,
        calculation,
        'additional_revenue',
        revenueId,
        'Erlös-Reihenfolge geändert',
      );
      await this.audit(
        database,
        access,
        'additional_revenue.reordered',
        'additional_revenue',
        revenueId,
        { eventId: current.eventId, direction },
      );
      return (await this.requirePlan(database, access, current.eventId)).additionalRevenues.find(
        (item) => item.id === revenueId,
      );
    });
  }

  private async persistTierOrder(
    database: TransactionClient,
    organizationId: string,
    rows: Array<{ id: string; sortOrder: number }>,
  ) {
    for (const [sortOrder, row] of rows.entries()) {
      if (row.sortOrder !== sortOrder)
        await database.ticketPriceTier.update({
          where: { id: row.id, organizationId },
          data: { sortOrder, version: { increment: 1 } },
        });
    }
  }

  private async persistComponentOrder(
    database: TransactionClient,
    organizationId: string,
    rows: Array<{ id: string; sortOrder: number }>,
  ) {
    for (const [sortOrder, row] of rows.entries()) {
      if (row.sortOrder !== sortOrder)
        await database.ticketPriceComponent.update({
          where: { id: row.id, organizationId },
          data: { sortOrder, version: { increment: 1 } },
        });
    }
  }

  private async persistAdditionalRevenueOrder(
    database: TransactionClient,
    organizationId: string,
    rows: Array<{ id: string; sortOrder: number }>,
  ) {
    for (const [sortOrder, row] of rows.entries()) {
      if (row.sortOrder !== sortOrder)
        await database.additionalRevenue.update({
          where: { id: row.id, organizationId },
          data: { sortOrder, version: { increment: 1 } },
        });
    }
  }

  private async findPlanWith(
    database: Database,
    access: AccessContext,
    eventId: string,
  ): Promise<RevenuePlanRecord | undefined> {
    const row = await database.eventCalculation.findFirst({
      where: {
        organizationId: access.organizationId,
        eventId,
        ...(access.locationScope === 'SELECTED'
          ? { event: { locationId: { in: access.locationIds } } }
          : {}),
      },
      include: planInclude,
    });
    return row ? this.mapPlan(row) : undefined;
  }

  private async requirePlan(database: Database, access: AccessContext, eventId: string) {
    const plan = await this.findPlanWith(database, access, eventId);
    if (!plan) this.referenceNotFound('REVENUE_PLAN_NOT_FOUND', 'Erlösplanung nicht gefunden');
    return plan!;
  }

  private mapPlan(row: PlanRow): RevenuePlanRecord {
    const blockers: RevenueApprovalBlocker[] = [];
    const tiers = row.ticketPriceTiers.map((tier) => this.mapTier(tier, blockers));
    const activeTiers = tiers.filter((tier) => tier.status === 'ACTIVE');
    const ticketBaseNet = activeTiers.reduce(
      (sum, tier) => sum + BigInt(tier.totalBaseNetMinor ?? '0'),
      0n,
    );
    const ticketBaseGross = activeTiers.reduce(
      (sum, tier) => sum + BigInt(tier.totalBaseGrossMinor ?? '0'),
      0n,
    );
    const expectedTickets = activeTiers.reduce((sum, tier) => sum + tier.expectedQuantity, 0);
    const expectedPayingTickets = activeTiers.reduce(
      (sum, tier) =>
        sum +
        (tier.endCustomerUnitGrossMinor !== null && BigInt(tier.endCustomerUnitGrossMinor) > 0n
          ? tier.expectedQuantity
          : 0),
      0,
    );
    const additional = row.additionalRevenues.map((revenue) =>
      this.mapAdditionalRevenue(
        revenue,
        {
          expectedGuests: row.event.expectedGuestCount,
          payingTickets: expectedPayingTickets,
          ticketBaseNetMinor: ticketBaseNet,
        },
        blockers,
      ),
    );
    const totals = this.calculateTotals(
      row,
      activeTiers,
      additional,
      blockers,
      expectedTickets,
      expectedPayingTickets,
      ticketBaseNet,
      ticketBaseGross,
    );
    return {
      calculationId: row.id,
      calculationVersion: row.version,
      calculationStatus: row.status,
      eventId: row.eventId,
      eventVersion: row.event.version,
      eventName: row.event.name,
      expectedGuestCount: row.event.expectedGuestCount,
      currency: 'EUR',
      ticketTiers: tiers,
      additionalRevenues: additional,
      totals,
    };
  }

  private mapTier(tier: TierRow, blockers: RevenueApprovalBlocker[]): TicketTierRecord {
    const base: NetGrossPair | null =
      tier.baseNetUnitMinor === null || tier.baseGrossUnitMinor === null
        ? null
        : { netMinor: tier.baseNetUnitMinor, grossMinor: tier.baseGrossUnitMinor };
    if (tier.status === 'ACTIVE' && base === null) {
      blockers.push({
        code: 'TICKET_BASE_PRICE_MISSING',
        message: `Für „${tier.name}“ fehlen Ticketgrundpreis oder Umsatzsteuersatz.`,
        targetType: 'TICKET_TIER',
        targetId: tier.id,
      });
    }
    const components = tier.components.map((component) =>
      this.mapComponent(component, base?.grossMinor ?? null, tier.status === 'ACTIVE', blockers),
    );
    const activeGuestComponents = components.filter(
      (component) => component.status === 'ACTIVE' && component.guestPays,
    );
    const componentsResolved = activeGuestComponents.every(
      (component) => component.grossUnitMinor !== null,
    );
    const endCustomerUnitGross =
      base === null || !componentsResolved
        ? null
        : activeGuestComponents.reduce(
            (sum, component) => sum + BigInt(component.grossUnitMinor!),
            base.grossMinor,
          );
    return {
      id: tier.id,
      name: tier.name,
      expectedQuantity: tier.expectedQuantity,
      baseInputType: tier.baseInputType,
      baseInputMinor: tier.baseInputMinor?.toString() ?? null,
      baseNetUnitMinor: base?.netMinor.toString() ?? null,
      baseGrossUnitMinor: base?.grossMinor.toString() ?? null,
      baseTaxRateBasisPoints: tier.baseTaxRateBasisPoints,
      baseTaxRateTemplateId: tier.baseTaxRateTemplateId,
      baseTaxRateTemplateVersion: tier.baseTaxRateTemplateVersion,
      baseTaxRateNameSnapshot: tier.baseTaxRateNameSnapshot,
      sourceTicketProviderTemplateId: tier.sourceTicketProviderTemplateId,
      sourceTicketProviderTemplateVersion: tier.sourceTicketProviderTemplateVersion,
      sourceTicketProviderNameSnapshot: tier.sourceTicketProviderNameSnapshot,
      endCustomerUnitGrossMinor: endCustomerUnitGross?.toString() ?? null,
      totalBaseNetMinor:
        base === null ? null : (base.netMinor * BigInt(tier.expectedQuantity)).toString(),
      totalBaseGrossMinor:
        base === null ? null : (base.grossMinor * BigInt(tier.expectedQuantity)).toString(),
      totalEndCustomerGrossMinor:
        endCustomerUnitGross === null
          ? null
          : (endCustomerUnitGross * BigInt(tier.expectedQuantity)).toString(),
      components,
      sortOrder: tier.sortOrder,
      status: tier.status,
      version: tier.version,
    };
  }

  private mapComponent(
    component: ComponentRow,
    baseGrossMinor: bigint | null,
    activeTier: boolean,
    blockers: RevenueApprovalBlocker[],
  ): TicketComponentRecord {
    const amount = resolveComponentAmount(baseGrossMinor, {
      amountType: component.amountType,
      inputType: component.inputType,
      inputAmountMinor: component.inputAmountMinor,
      percentageRateBasisPoints: component.percentageRateBasisPoints,
      taxRateBasisPoints: component.taxRateBasisPoints,
    });
    const allocationResult = resolveAllocations(
      amount,
      component.allocations.map((allocation) => ({
        id: allocation.id,
        recipientType: allocation.recipientType,
        allocationType: allocation.allocationType,
        fixedAmountMinor: allocation.fixedAmountMinor,
        percentageBasisPoints: allocation.percentageBasisPoints,
      })),
    );
    if (activeTier && component.status === 'ACTIVE' && amount === null) {
      blockers.push({
        code: 'COMPONENT_AMOUNT_MISSING',
        message: `Der Preisbestandteil „${component.name}“ kann ohne vollständige Berechnungsbasis nicht berechnet werden.`,
        targetType: 'TICKET_COMPONENT',
        targetId: component.id,
      });
    }
    if (activeTier && component.status === 'ACTIVE' && !allocationResult.complete) {
      blockers.push({
        code: 'COMPONENT_ALLOCATION_INCOMPLETE',
        message:
          allocationResult.differenceGrossMinor === null
            ? `Für „${component.name}“ fehlt eine vollständige Empfänger-Aufteilung.`
            : `Die Empfänger-Aufteilung für „${component.name}“ weicht um ${allocationResult.differenceGrossMinor.toString()} Minor Units vom Preisbestandteil ab.`,
        targetType: 'TICKET_COMPONENT',
        targetId: component.id,
      });
    }
    return {
      id: component.id,
      name: component.name,
      amountType: component.amountType,
      percentageBasis: component.percentageBasis,
      percentageRateBasisPoints: component.percentageRateBasisPoints,
      inputType: component.inputType,
      inputAmountMinor: component.inputAmountMinor?.toString() ?? null,
      taxRateBasisPoints: component.taxRateBasisPoints,
      taxRateTemplateId: component.taxRateTemplateId,
      taxRateTemplateVersion: component.taxRateTemplateVersion,
      taxRateNameSnapshot: component.taxRateNameSnapshot,
      guestPays: component.guestPays,
      netUnitMinor: amount?.netMinor.toString() ?? null,
      grossUnitMinor: amount?.grossMinor.toString() ?? null,
      allocationComplete: allocationResult.complete,
      allocationDifferenceGrossMinor: allocationResult.differenceGrossMinor?.toString() ?? null,
      allocations: component.allocations.map((allocation, index) => {
        const resolved = allocationResult.items[index]!;
        return {
          id: allocation.id,
          recipientType: allocation.recipientType,
          recipientId: allocation.artistId ?? allocation.businessPartnerId,
          recipientName:
            allocation.recipientType === 'ORGANIZATION'
              ? 'Eigene Organisation / Club'
              : allocation.recipientType === 'ARTIST'
                ? artistName(allocation.artist)
                : allocation.recipientType === 'BUSINESS_PARTNER'
                  ? (allocation.businessPartner?.companyName ?? 'Geschäftspartner')
                  : (allocation.externalRecipientName ?? 'Externer Dritter'),
          allocationType: allocation.allocationType,
          percentageBasisPoints: allocation.percentageBasisPoints,
          fixedAmountMinor: allocation.fixedAmountMinor?.toString() ?? null,
          resolvedNetUnitMinor: resolved.netAmountMinor?.toString() ?? null,
          resolvedGrossUnitMinor: resolved.grossAmountMinor?.toString() ?? null,
          sortOrder: allocation.sortOrder,
          status: allocation.status,
          version: allocation.version,
        };
      }),
      sortOrder: component.sortOrder,
      status: component.status,
      version: component.version,
    };
  }

  private mapAdditionalRevenue(
    revenue: AdditionalRevenueRow,
    basis: { expectedGuests: number | null; payingTickets: number; ticketBaseNetMinor: bigint },
    blockers: RevenueApprovalBlocker[],
  ): AdditionalRevenueRecord {
    const resolved = resolveAdditionalRevenue(
      {
        calculationType: revenue.calculationType,
        inputType: revenue.inputType,
        inputAmountMinor: revenue.inputAmountMinor,
        percentageRateBasisPoints: revenue.percentageRateBasisPoints,
        taxRateBasisPoints: revenue.taxRateBasisPoints,
      },
      basis,
    );
    if (
      revenue.status === 'ACTIVE' &&
      revenue.calculationType === 'PER_EXPECTED_GUEST' &&
      basis.expectedGuests === null
    ) {
      blockers.push({
        code: 'EXPECTED_GUEST_COUNT_MISSING',
        message: `„${revenue.name}“ benötigt eine erwartete Gästezahl.`,
        targetType: 'EVENT',
        targetId: revenue.eventId,
      });
    } else if (revenue.status === 'ACTIVE' && resolved === null) {
      blockers.push({
        code: 'ADDITIONAL_REVENUE_AMOUNT_MISSING',
        message: `„${revenue.name}“ kann noch nicht berechnet werden.`,
        targetType: 'ADDITIONAL_REVENUE',
        targetId: revenue.id,
      });
    }
    return {
      id: revenue.id,
      name: revenue.name,
      calculationType: revenue.calculationType,
      inputType: revenue.inputType,
      inputAmountMinor: revenue.inputAmountMinor?.toString() ?? null,
      percentageRateBasisPoints: revenue.percentageRateBasisPoints,
      taxRateBasisPoints: revenue.taxRateBasisPoints,
      taxRateTemplateId: revenue.taxRateTemplateId,
      taxRateTemplateVersion: revenue.taxRateTemplateVersion,
      taxRateNameSnapshot: revenue.taxRateNameSnapshot,
      confirmationStatus: revenue.confirmationStatus,
      note: revenue.note,
      resolvedQuantity: resolved?.quantity ?? null,
      calculationBasisMinor: resolved?.basisMinor?.toString() ?? null,
      totalNetMinor: resolved?.netMinor.toString() ?? null,
      totalGrossMinor: resolved?.grossMinor.toString() ?? null,
      sortOrder: revenue.sortOrder,
      status: revenue.status,
      version: revenue.version,
    };
  }

  private calculateTotals(
    row: PlanRow,
    tiers: TicketTierRecord[],
    additional: AdditionalRevenueRecord[],
    blockers: RevenueApprovalBlocker[],
    expectedTickets: number,
    expectedPayingTickets: number,
    ticketBaseNet: bigint,
    ticketBaseGross: bigint,
  ): RevenuePlanTotals {
    let ownNet = ticketBaseNet;
    let ownGross = ticketBaseGross;
    let artistPartnerNet = 0n;
    let artistPartnerGross = 0n;
    let externalNet = 0n;
    let externalGross = 0n;
    for (const tier of tiers) {
      for (const component of tier.components.filter(
        (item) => item.status === 'ACTIVE' && item.guestPays,
      )) {
        for (const allocation of component.allocations) {
          const net =
            BigInt(allocation.resolvedNetUnitMinor ?? '0') * BigInt(tier.expectedQuantity);
          const gross =
            BigInt(allocation.resolvedGrossUnitMinor ?? '0') * BigInt(tier.expectedQuantity);
          if (allocation.recipientType === 'ORGANIZATION') {
            ownNet += net;
            ownGross += gross;
          } else if (allocation.recipientType === 'EXTERNAL') {
            externalNet += net;
            externalGross += gross;
          } else {
            artistPartnerNet += net;
            artistPartnerGross += gross;
          }
        }
      }
    }
    const additionalActive = additional.filter((item) => item.status === 'ACTIVE');
    const additionalNet = additionalActive.reduce(
      (sum, item) => sum + BigInt(item.totalNetMinor ?? '0'),
      0n,
    );
    const additionalGross = additionalActive.reduce(
      (sum, item) => sum + BigInt(item.totalGrossMinor ?? '0'),
      0n,
    );
    const costs = this.phase7Costs(row);
    const ticketEndCustomerGross = tiers.reduce(
      (sum, tier) => sum + BigInt(tier.totalEndCustomerGrossMinor ?? '0'),
      0n,
    );
    return {
      expectedGuests: row.event.expectedGuestCount,
      expectedTickets,
      expectedPayingTickets,
      ticketEndCustomerGrossMinor: ticketEndCustomerGross.toString(),
      ticketBaseNetMinor: ticketBaseNet.toString(),
      ticketBaseGrossMinor: ticketBaseGross.toString(),
      ownTicketRevenueNetMinor: ownNet.toString(),
      ownTicketRevenueGrossMinor: ownGross.toString(),
      artistPartnerShareNetMinor: artistPartnerNet.toString(),
      artistPartnerShareGrossMinor: artistPartnerGross.toString(),
      externalPassThroughNetMinor: externalNet.toString(),
      externalPassThroughGrossMinor: externalGross.toString(),
      additionalRevenueNetMinor: additionalNet.toString(),
      additionalRevenueGrossMinor: additionalGross.toString(),
      phase7PlannedCostNetMinor: costs.toString(),
      operatingResultNetMinor: (ownNet + additionalNet - costs).toString(),
      costBasisLabel:
        'Phase-7-Kostenbasis: voraussichtliche Netto-Einkaufs- und Bookingkosten (geplant plus verbindlich).',
      incomplete: blockers.length > 0,
      approvalBlockers: blockers,
    };
  }

  private phase7Costs(row: PlanRow): bigint {
    let total = 0n;
    for (const position of row.positions.filter((item) => item.status === 'ACTIVE')) {
      if (position.purchaseUnitPriceMinor !== null) {
        total += calculateLineTotal(position.quantity.toString(), position.purchaseUnitPriceMinor);
      }
    }
    for (const booking of row.event.bookings) {
      if (booking.agreedFeeMinor !== null && booking.agreedFeeCurrency === 'EUR') {
        total += booking.agreedFeeMinor;
      }
      if (booking.travelCostMinor !== null && booking.travelCostCurrency === 'EUR') {
        total += booking.travelCostMinor;
      }
      if (
        booking.hotelArrangement === 'BUYOUT' &&
        booking.hotelBuyoutMinor !== null &&
        booking.hotelBuyoutCurrency === 'EUR'
      ) {
        total += booking.hotelBuyoutMinor;
      }
    }
    return total;
  }

  private async findTierSource(database: Database, access: AccessContext, tierId: string) {
    return database.ticketPriceTier.findFirst({
      where: {
        id: tierId,
        organizationId: access.organizationId,
        ...(access.locationScope === 'SELECTED'
          ? { event: { locationId: { in: access.locationIds } } }
          : {}),
      },
      select: { id: true, eventId: true, calculationId: true, version: true },
    });
  }

  private async findComponentSource(
    database: Database,
    access: AccessContext,
    componentId: string,
  ) {
    return database.ticketPriceComponent
      .findFirst({
        where: {
          id: componentId,
          organizationId: access.organizationId,
          ...(access.locationScope === 'SELECTED'
            ? { ticketPriceTier: { event: { locationId: { in: access.locationIds } } } }
            : {}),
        },
        select: {
          id: true,
          version: true,
          ticketPriceTierId: true,
          ticketPriceTier: { select: { eventId: true, calculationId: true } },
        },
      })
      .then((row) =>
        row
          ? {
              id: row.id,
              version: row.version,
              tierId: row.ticketPriceTierId,
              eventId: row.ticketPriceTier.eventId,
              calculationId: row.ticketPriceTier.calculationId,
            }
          : undefined,
      );
  }

  private async findAdditionalSource(database: Database, access: AccessContext, revenueId: string) {
    return database.additionalRevenue.findFirst({
      where: {
        id: revenueId,
        organizationId: access.organizationId,
        ...(access.locationScope === 'SELECTED'
          ? { event: { locationId: { in: access.locationIds } } }
          : {}),
      },
      select: { id: true, eventId: true, calculationId: true, version: true },
    });
  }

  private async findMappedComponent(
    database: Database,
    access: AccessContext,
    eventId: string,
    componentId: string,
  ) {
    const plan = await this.requirePlan(database, access, eventId);
    for (const tier of plan.ticketTiers) {
      const component = tier.components.find((item) => item.id === componentId);
      if (component) return component;
    }
    this.referenceNotFound('TICKET_COMPONENT_NOT_FOUND', 'Preisbestandteil nicht gefunden');
  }

  private async createAllocations(
    database: TransactionClient,
    organizationId: string,
    componentId: string,
    values: ComponentValues,
  ) {
    if (values.allocations.length === 0) return;
    await database.ticketComponentAllocation.createMany({
      data: values.allocations.map((allocation) => ({
        organizationId,
        ticketPriceComponentId: componentId,
        ...allocation,
      })),
    });
  }

  private async validateRecipients(
    database: TransactionClient,
    organizationId: string,
    values: ComponentValues,
  ) {
    const artistIds = [
      ...new Set(values.allocations.flatMap((item) => (item.artistId ? [item.artistId] : []))),
    ];
    const partnerIds = [
      ...new Set(
        values.allocations.flatMap((item) =>
          item.businessPartnerId ? [item.businessPartnerId] : [],
        ),
      ),
    ];
    const [artistCount, partnerCount] = await Promise.all([
      database.artist.count({ where: { organizationId, id: { in: artistIds }, status: 'ACTIVE' } }),
      database.businessPartner.count({
        where: { organizationId, id: { in: partnerIds }, status: 'ACTIVE' },
      }),
    ]);
    if (artistCount !== artistIds.length) {
      this.referenceNotFound(
        'ALLOCATION_ARTIST_NOT_FOUND',
        'Gewählter Artist nicht gefunden oder archiviert',
      );
    }
    if (partnerCount !== partnerIds.length) {
      this.referenceNotFound(
        'ALLOCATION_PARTNER_NOT_FOUND',
        'Gewählter Geschäftspartner nicht gefunden oder archiviert',
      );
    }
  }

  private async lockCalculationForEvent(
    database: TransactionClient,
    access: AccessContext,
    eventId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{ id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number }>
    >(Prisma.sql`
      SELECT calculation."id", calculation."status", calculation."version"
      FROM "event_calculation" calculation
      JOIN "event" event ON event."id" = calculation."event_id"
        AND event."organization_id" = calculation."organization_id"
      WHERE calculation."organization_id" = ${access.organizationId}::uuid
        AND calculation."event_id" = ${eventId}::uuid
        ${selectedLocationSql(access)}
      FOR UPDATE OF calculation
    `);
    const calculation = rows[0];
    if (!calculation) {
      this.referenceNotFound('REVENUE_PLAN_NOT_FOUND', 'Erlösplanung nicht gefunden');
    }
    return calculation!;
  }

  private async touchCalculation(
    database: TransactionClient,
    access: AccessContext,
    calculation: { id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number },
    sourceType: string,
    sourceId: string,
    reason: string,
  ) {
    if (calculation.status === 'APPROVED') {
      await database.eventCalculationStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          calculationId: calculation.id,
          previousStatus: 'APPROVED',
          newStatus: 'DRAFT',
          actorUserId: access.user.id,
          actorMembershipId: access.membershipId,
          reason,
          changedSourceType: sourceType,
          changedSourceId: sourceId,
        },
      });
    }
    await database.eventCalculation.update({
      where: { id: calculation.id },
      data: {
        status: calculation.status === 'APPROVED' ? 'DRAFT' : calculation.status,
        ...(calculation.status === 'APPROVED'
          ? { approvedAt: null, approvedByUserId: null, approvedByMembershipId: null }
          : {}),
        version: { increment: 1 },
      },
    });
    await this.audit(
      database,
      access,
      'event_calculation.source_changed',
      'event_calculation',
      calculation.id,
      {
        sourceType,
        sourceId,
        reason,
        resetFromApproved: calculation.status === 'APPROVED',
        previousVersion: calculation.version,
        newVersion: calculation.version + 1,
      },
    );
  }

  private audit(
    database: TransactionClient,
    access: AccessContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return this.auditWriter.append(database, access, action, targetType, targetId, metadata);
  }

  private referenceNotFound(code: string, message: string): never {
    throw new RevenuePlanningPersistenceError(code, message, 'REFERENCE');
  }
}

function selectedLocationSql(access: AccessContext) {
  if (access.locationScope !== 'SELECTED') return Prisma.empty;
  return access.locationIds.length === 0
    ? Prisma.sql`AND FALSE`
    : Prisma.sql`AND event."location_id" IN (${Prisma.join(access.locationIds.map((id) => Prisma.sql`${id}::uuid`))})`;
}

function artistName(
  artist: { stageName: string | null; firstName: string | null; lastName: string | null } | null,
) {
  if (!artist) return 'Artist';
  return (
    artist.stageName ?? ([artist.firstName, artist.lastName].filter(Boolean).join(' ') || 'Artist')
  );
}
