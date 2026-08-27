import type { TransactionClient } from '@venue/database';

export interface TemplateRecipientResolution {
  allocationId: string;
  action: 'REMOVE' | 'REPLACE';
  recipientType?: 'ORGANIZATION' | 'ARTIST' | 'BUSINESS_PARTNER' | 'EXTERNAL';
  artistId?: string | null;
  businessPartnerId?: string | null;
  externalRecipientName?: string | null;
}

export class CalculationTemplateSnapshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CalculationTemplateSnapshotError';
  }
}

export interface CalculationTemplatePreview {
  templateId: string;
  templateName: string;
  templateVersion: number;
  expectedGuestCount: number | null;
  tierCount: number;
  componentCount: number;
  additionalRevenueCount: number;
  existingTierCount: number;
  existingAdditionalRevenueCount: number;
  replacementRequired: boolean;
  calculationId: string;
  calculationVersion: number;
  calculationStatus: 'DRAFT' | 'REVIEW' | 'APPROVED';
  invalidRecipients: Array<{
    allocationId: string;
    componentName: string;
    recipientType: 'ARTIST' | 'BUSINESS_PARTNER';
    recipientName: string;
    reason: 'RECIPIENT_ARCHIVED_OR_MISSING';
  }>;
}

const templateInclude = {
  tiers: {
    where: { status: 'ACTIVE' as const },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      components: {
        where: { status: 'ACTIVE' as const },
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        include: {
          allocations: {
            where: { status: 'ACTIVE' as const },
            orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
            include: {
              artist: {
                select: { status: true, stageName: true, firstName: true, lastName: true },
              },
              businessPartner: { select: { status: true, companyName: true } },
            },
          },
        },
      },
    },
  },
  additionalRevenues: {
    where: { status: 'ACTIVE' as const },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
};

export async function previewCalculationTemplate(
  database: TransactionClient,
  organizationId: string,
  eventId: string,
  templateId: string,
): Promise<CalculationTemplatePreview> {
  const [template, event] = await Promise.all([
    database.calculationTemplate.findFirst({
      where: { id: templateId, organizationId, status: 'ACTIVE' },
      include: templateInclude,
    }),
    database.event.findFirst({
      where: { id: eventId, organizationId },
      select: {
        id: true,
        calculation: {
          select: {
            id: true,
            version: true,
            status: true,
            _count: { select: { ticketPriceTiers: true, additionalRevenues: true } },
          },
        },
      },
    }),
  ]);
  if (!template)
    throw new CalculationTemplateSnapshotError(
      'CALCULATION_TEMPLATE_INVALID',
      'Die Kalkulationsvorlage ist nicht aktiv oder gehört nicht zur Organisation',
    );
  if (!event?.calculation)
    throw new CalculationTemplateSnapshotError(
      'REVENUE_PLAN_NOT_FOUND',
      'Die Erlösplanung wurde nicht gefunden',
    );
  const invalidRecipients = template.tiers.flatMap((tier) =>
    tier.components.flatMap((component) =>
      component.allocations
        .filter((allocation) =>
          allocation.recipientType === 'ARTIST'
            ? allocation.artist?.status !== 'ACTIVE'
            : allocation.recipientType === 'BUSINESS_PARTNER'
              ? allocation.businessPartner?.status !== 'ACTIVE'
              : false,
        )
        .map((allocation) => ({
          allocationId: allocation.id,
          componentName: component.name,
          recipientType: allocation.recipientType as 'ARTIST' | 'BUSINESS_PARTNER',
          recipientName:
            allocation.recipientType === 'ARTIST'
              ? artistName(allocation.artist)
              : (allocation.businessPartner?.companyName ?? 'Geschäftspartner'),
          reason: 'RECIPIENT_ARCHIVED_OR_MISSING' as const,
        })),
    ),
  );
  return {
    templateId: template.id,
    templateName: template.name,
    templateVersion: template.version,
    expectedGuestCount: template.expectedGuestCount,
    tierCount: template.tiers.length,
    componentCount: template.tiers.reduce((sum, tier) => sum + tier.components.length, 0),
    additionalRevenueCount: template.additionalRevenues.length,
    existingTierCount: event.calculation._count.ticketPriceTiers,
    existingAdditionalRevenueCount: event.calculation._count.additionalRevenues,
    replacementRequired:
      event.calculation._count.ticketPriceTiers > 0 ||
      event.calculation._count.additionalRevenues > 0,
    calculationId: event.calculation.id,
    calculationVersion: event.calculation.version,
    calculationStatus: event.calculation.status,
    invalidRecipients,
  };
}

export async function applyCalculationTemplateSnapshot(
  database: TransactionClient,
  organizationId: string,
  eventId: string,
  templateId: string,
  options: {
    calculationVersion?: number;
    confirmReplacement: boolean;
    resolutions?: TemplateRecipientResolution[];
    userId?: string;
    membershipId?: string;
  },
): Promise<CalculationTemplatePreview> {
  const preview = await previewCalculationTemplate(database, organizationId, eventId, templateId);
  if (
    options.calculationVersion !== undefined &&
    preview.calculationVersion !== options.calculationVersion
  ) {
    throw new CalculationTemplateSnapshotError(
      'VERSION_CONFLICT',
      'Die Kalkulation wurde zwischenzeitlich geändert',
    );
  }
  if (preview.replacementRequired && !options.confirmReplacement) {
    throw new CalculationTemplateSnapshotError(
      'CALCULATION_TEMPLATE_REPLACEMENT_CONFIRMATION_REQUIRED',
      'Die vorhandene Erlösplanung muss ausdrücklich vollständig ersetzt werden',
    );
  }
  const resolutions = new Map(
    (options.resolutions ?? []).map((resolution) => [resolution.allocationId, resolution]),
  );
  const unresolved = preview.invalidRecipients.filter(
    ({ allocationId }) => !resolutions.has(allocationId),
  );
  if (unresolved.length) {
    throw new CalculationTemplateSnapshotError(
      'CALCULATION_TEMPLATE_RECIPIENTS_REQUIRE_CORRECTION',
      'Archivierte oder fehlende Empfänger müssen ersetzt oder entfernt werden',
    );
  }
  const template = await database.calculationTemplate.findFirstOrThrow({
    where: { id: templateId, organizationId, status: 'ACTIVE' },
    include: templateInclude,
  });
  await validateResolutions(database, organizationId, options.resolutions ?? []);

  const oldComponents = await database.ticketPriceComponent.findMany({
    where: { organizationId, ticketPriceTier: { eventId } },
    select: { id: true },
  });
  const oldComponentIds = oldComponents.map(({ id }) => id);
  if (oldComponentIds.length) {
    await database.ticketComponentAllocation.updateMany({
      where: { organizationId, ticketPriceComponentId: { in: oldComponentIds }, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
    });
  }
  await database.ticketPriceComponent.updateMany({
    where: { organizationId, ticketPriceTier: { eventId }, status: 'ACTIVE' },
    data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
  });
  await database.ticketPriceTier.updateMany({
    where: { organizationId, eventId, status: 'ACTIVE' },
    data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
  });
  await database.additionalRevenue.updateMany({
    where: { organizationId, eventId, status: 'ACTIVE' },
    data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
  });

  for (const [tierIndex, sourceTier] of template.tiers.entries()) {
    const tier = await database.ticketPriceTier.create({
      data: {
        organizationId,
        eventId,
        calculationId: preview.calculationId,
        name: sourceTier.name,
        expectedQuantity: sourceTier.expectedQuantity,
        baseInputType: sourceTier.baseInputType,
        baseInputMinor: sourceTier.baseInputMinor,
        baseNetUnitMinor: sourceTier.baseNetUnitMinor,
        baseGrossUnitMinor: sourceTier.baseGrossUnitMinor,
        baseTaxRateBasisPoints: sourceTier.baseTaxRateBasisPoints,
        baseTaxRateTemplateId: sourceTier.baseTaxRateTemplateId,
        baseTaxRateTemplateVersion: sourceTier.baseTaxRateTemplateVersion,
        baseTaxRateNameSnapshot: sourceTier.baseTaxRateNameSnapshot,
        sourceTicketProviderTemplateId: sourceTier.sourceTicketProviderTemplateId,
        sourceTicketProviderTemplateVersion: sourceTier.sourceTicketProviderTemplateVersion,
        sourceTicketProviderNameSnapshot: sourceTier.sourceTicketProviderNameSnapshot,
        sortOrder: tierIndex,
      },
    });
    for (const [componentIndex, sourceComponent] of sourceTier.components.entries()) {
      const component = await database.ticketPriceComponent.create({
        data: {
          organizationId,
          ticketPriceTierId: tier.id,
          name: sourceComponent.name,
          amountType: sourceComponent.amountType,
          percentageBasis: sourceComponent.percentageBasis,
          percentageRateBasisPoints: sourceComponent.percentageRateBasisPoints,
          inputType: sourceComponent.inputType,
          inputAmountMinor: sourceComponent.inputAmountMinor,
          taxRateBasisPoints: sourceComponent.taxRateBasisPoints,
          taxRateTemplateId: sourceComponent.taxRateTemplateId,
          taxRateTemplateVersion: sourceComponent.taxRateTemplateVersion,
          taxRateNameSnapshot: sourceComponent.taxRateNameSnapshot,
          guestPays: sourceComponent.guestPays,
          sortOrder: componentIndex,
        },
      });
      const allocationData = [];
      for (const [allocationIndex, sourceAllocation] of sourceComponent.allocations.entries()) {
        const resolution = resolutions.get(sourceAllocation.id);
        if (resolution?.action === 'REMOVE') continue;
        const recipient = resolution?.action === 'REPLACE' ? resolution : sourceAllocation;
        allocationData.push({
          organizationId,
          ticketPriceComponentId: component.id,
          recipientType: recipient.recipientType!,
          artistId: recipient.recipientType === 'ARTIST' ? (recipient.artistId ?? null) : null,
          businessPartnerId:
            recipient.recipientType === 'BUSINESS_PARTNER'
              ? (recipient.businessPartnerId ?? null)
              : null,
          externalRecipientName:
            recipient.recipientType === 'EXTERNAL'
              ? (recipient.externalRecipientName?.trim() ?? null)
              : null,
          allocationType: sourceAllocation.allocationType,
          percentageBasisPoints: sourceAllocation.percentageBasisPoints,
          fixedAmountMinor: sourceAllocation.fixedAmountMinor,
          sortOrder: allocationIndex,
        });
      }
      if (allocationData.length)
        await database.ticketComponentAllocation.createMany({ data: allocationData });
    }
  }
  if (template.additionalRevenues.length) {
    await database.additionalRevenue.createMany({
      data: template.additionalRevenues.map((source, sortOrder) => ({
        organizationId,
        eventId,
        calculationId: preview.calculationId,
        name: source.name,
        calculationType: source.calculationType,
        inputType: source.inputType,
        inputAmountMinor: source.inputAmountMinor,
        percentageRateBasisPoints: source.percentageRateBasisPoints,
        taxRateBasisPoints: source.taxRateBasisPoints,
        taxRateTemplateId: source.taxRateTemplateId,
        taxRateTemplateVersion: source.taxRateTemplateVersion,
        taxRateNameSnapshot: source.taxRateNameSnapshot,
        confirmationStatus: source.confirmationStatus,
        note: source.note,
        sortOrder,
      })),
    });
  }
  await database.event.update({
    where: { id: eventId },
    data: {
      expectedGuestCount: template.expectedGuestCount,
      sourceCalculationTemplateId: template.id,
      sourceCalculationTemplateVersion: template.version,
      calculationTemplateNameSnapshot: template.name,
      version: { increment: 1 },
    },
  });
  if (preview.calculationStatus === 'APPROVED') {
    await database.eventCalculationStatusHistory.create({
      data: {
        organizationId,
        calculationId: preview.calculationId,
        previousStatus: 'APPROVED',
        newStatus: 'DRAFT',
        actorUserId: optionsActor(options, 'userId'),
        actorMembershipId: optionsActor(options, 'membershipId'),
        reason: 'Kalkulationsvorlage übernommen',
        changedSourceType: 'calculation_template',
        changedSourceId: template.id,
      },
    });
  }
  await database.eventCalculation.update({
    where: { id: preview.calculationId },
    data: {
      status: preview.calculationStatus === 'APPROVED' ? 'DRAFT' : preview.calculationStatus,
      ...(preview.calculationStatus === 'APPROVED'
        ? { approvedAt: null, approvedByUserId: null, approvedByMembershipId: null }
        : {}),
      version: { increment: 1 },
    },
  });
  return preview;
}

async function validateResolutions(
  database: TransactionClient,
  organizationId: string,
  resolutions: TemplateRecipientResolution[],
) {
  for (const resolution of resolutions) {
    if (resolution.action === 'REMOVE') continue;
    if (!resolution.recipientType)
      throw new CalculationTemplateSnapshotError(
        'INVALID_RECIPIENT_RESOLUTION',
        'Für einen Ersatz muss ein Empfängertyp gewählt werden',
      );
    if (resolution.recipientType === 'ARTIST') {
      const valid =
        resolution.artistId &&
        (await database.artist.count({
          where: { id: resolution.artistId, organizationId, status: 'ACTIVE' },
        }));
      if (!valid)
        throw new CalculationTemplateSnapshotError(
          'INVALID_RECIPIENT_RESOLUTION',
          'Der Ersatz-Artist ist nicht aktiv oder gehört nicht zur Organisation',
        );
    }
    if (resolution.recipientType === 'BUSINESS_PARTNER') {
      const valid =
        resolution.businessPartnerId &&
        (await database.businessPartner.count({
          where: { id: resolution.businessPartnerId, organizationId, status: 'ACTIVE' },
        }));
      if (!valid)
        throw new CalculationTemplateSnapshotError(
          'INVALID_RECIPIENT_RESOLUTION',
          'Der Ersatz-Geschäftspartner ist nicht aktiv oder gehört nicht zur Organisation',
        );
    }
    if (resolution.recipientType === 'EXTERNAL' && !resolution.externalRecipientName?.trim()) {
      throw new CalculationTemplateSnapshotError(
        'INVALID_RECIPIENT_RESOLUTION',
        'Der externe Ersatz-Empfänger benötigt einen Namen',
      );
    }
  }
}

function optionsActor(options: object, key: 'userId' | 'membershipId'): string {
  const value = (options as Record<string, unknown>)[key];
  if (typeof value !== 'string')
    throw new CalculationTemplateSnapshotError(
      'ACTOR_REQUIRED',
      'Für die Statushistorie fehlen Akteurdaten',
    );
  return value;
}

function artistName(
  artist: { stageName: string | null; firstName: string | null; lastName: string | null } | null,
): string {
  return (
    artist?.stageName ??
    ([artist?.firstName, artist?.lastName].filter(Boolean).join(' ') || 'Artist')
  );
}
