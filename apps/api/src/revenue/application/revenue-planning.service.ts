import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AccessContext } from '../../security/access.types.js';
import {
  assertBasisPoints,
  assertNonNegativeInteger,
  cleanOptionalRevenueText,
  cleanRevenueName,
  convertNetGross,
  parseRevenueMinor,
  RevenuePlanningValidationError,
  type AdditionalRevenueType,
  type AllocationType,
  type PriceInputType,
  type RecipientType,
  type RevenueAmountType,
} from '../domain/revenue-planning.rules.js';
import type {
  AdditionalRevenueValues,
  AllocationValues,
  ComponentValues,
  RevenueConfirmationStatus,
  TicketTierValues,
} from './revenue-planning.models.js';
import {
  REVENUE_PLANNING_REPOSITORY,
  RevenuePlanningPersistenceError,
  type RevenuePlanningRepository,
} from './revenue-planning.repository.js';
import {
  CalculationTemplateSnapshotError,
  type TemplateRecipientResolution,
} from '../infrastructure/calculation-template-snapshot.js';

export interface TicketTierInput {
  name?: string;
  expectedQuantity?: number;
  baseInputType?: PriceInputType | null;
  baseInputMinor?: string | null;
  baseTaxRateBasisPoints?: number | null;
  baseTaxRateTemplateId?: string | null;
  sourceTicketProviderTemplateId?: string | null;
  components?: ComponentInput[];
  sortOrder?: number;
}

export interface AllocationInput {
  recipientType?: RecipientType;
  artistId?: string | null;
  businessPartnerId?: string | null;
  externalRecipientName?: string | null;
  allocationType?: AllocationType;
  percentageBasisPoints?: number | null;
  fixedAmountMinor?: string | null;
  sortOrder?: number;
}

export interface ComponentInput {
  name?: string;
  amountType?: RevenueAmountType;
  percentageRateBasisPoints?: number | null;
  inputType?: PriceInputType;
  inputAmountMinor?: string | null;
  taxRateBasisPoints?: number;
  taxRateTemplateId?: string;
  guestPays?: boolean;
  sortOrder?: number;
  allocations?: AllocationInput[];
}

export interface AdditionalRevenueInput {
  name?: string;
  calculationType?: AdditionalRevenueType;
  inputType?: PriceInputType;
  inputAmountMinor?: string | null;
  percentageRateBasisPoints?: number | null;
  taxRateBasisPoints?: number;
  taxRateTemplateId?: string;
  confirmationStatus?: RevenueConfirmationStatus;
  note?: string | null;
  sortOrder?: number;
}

@Injectable()
export class RevenuePlanningService {
  constructor(
    @Inject(REVENUE_PLANNING_REPOSITORY)
    private readonly repository: RevenuePlanningRepository,
  ) {}

  async findPlan(access: AccessContext, eventId: string) {
    const plan = await this.repository.findPlan(access, eventId);
    if (!plan) this.notFound();
    return plan!;
  }

  previewCalculationTemplate(access: AccessContext, eventId: string, templateId: string) {
    return this.repository
      .previewCalculationTemplate(access, eventId, templateId)
      .catch((error) => this.rethrowKnown(error));
  }

  applyCalculationTemplate(
    access: AccessContext,
    eventId: string,
    templateId: string,
    calculationVersion: number,
    confirmReplacement: boolean,
    resolutions: TemplateRecipientResolution[],
  ) {
    return this.repository
      .applyCalculationTemplate(
        access,
        eventId,
        templateId,
        calculationVersion,
        confirmReplacement,
        resolutions,
      )
      .catch((error) => this.rethrowKnown(error));
  }

  async setExpectedGuests(
    access: AccessContext,
    eventId: string,
    eventVersion: number,
    expectedGuestCount: number | null,
  ) {
    try {
      if (expectedGuestCount !== null) {
        assertNonNegativeInteger(expectedGuestCount, 'Die erwartete Gästezahl');
      }
      const result = await this.repository.setExpectedGuests(
        access,
        eventId,
        eventVersion,
        expectedGuestCount,
      );
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async createTicketTier(access: AccessContext, eventId: string, input: TicketTierInput) {
    try {
      return await this.repository.createTicketTier(
        access,
        eventId,
        await this.ticketTierValues(access, input),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateTicketTier(
    access: AccessContext,
    tierId: string,
    version: number,
    input: TicketTierInput,
  ) {
    try {
      const result = await this.repository.updateTicketTier(
        access,
        tierId,
        version,
        await this.ticketTierValues(access, input),
      );
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setTicketTierStatus(
    access: AccessContext,
    tierId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const result = await this.repository.setTicketTierStatus(access, tierId, version, status);
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async createComponent(access: AccessContext, tierId: string, input: ComponentInput) {
    try {
      return await this.repository.createComponent(
        access,
        tierId,
        await this.componentValues(access, input),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    input: ComponentInput,
  ) {
    try {
      const result = await this.repository.updateComponent(
        access,
        componentId,
        version,
        await this.componentValues(access, input),
      );
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setComponentStatus(
    access: AccessContext,
    componentId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const result = await this.repository.setComponentStatus(access, componentId, version, status);
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async createAdditionalRevenue(
    access: AccessContext,
    eventId: string,
    input: AdditionalRevenueInput,
  ) {
    try {
      return await this.repository.createAdditionalRevenue(
        access,
        eventId,
        await this.additionalRevenueValues(access, input),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    input: AdditionalRevenueInput,
  ) {
    try {
      const result = await this.repository.updateAdditionalRevenue(
        access,
        revenueId,
        version,
        await this.additionalRevenueValues(access, input),
      );
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setAdditionalRevenueStatus(
    access: AccessContext,
    revenueId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const result = await this.repository.setAdditionalRevenueStatus(
        access,
        revenueId,
        version,
        status,
      );
      if (!result) this.versionConflict();
      return result!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async moveTicketTier(
    access: AccessContext,
    tierId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    const result = await this.repository.moveTicketTier(access, tierId, version, direction);
    if (!result) this.versionConflict();
    return result!;
  }

  async moveComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    const result = await this.repository.moveComponent(access, componentId, version, direction);
    if (!result) this.versionConflict();
    return result!;
  }

  async moveAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ) {
    const result = await this.repository.moveAdditionalRevenue(
      access,
      revenueId,
      version,
      direction,
    );
    if (!result) this.versionConflict();
    return result!;
  }

  private async ticketTierValues(
    access: AccessContext,
    input: TicketTierInput,
  ): Promise<TicketTierValues> {
    const name = cleanRevenueName(input.name ?? '', 'Die Ticketstufen-Bezeichnung');
    const expectedQuantity = assertNonNegativeInteger(
      input.expectedQuantity ?? 0,
      'Die erwartete Ticketmenge',
    );
    const sortOrder = assertNonNegativeInteger(input.sortOrder ?? 0, 'Die Reihenfolge');
    const baseInputMinor = parseRevenueMinor(input.baseInputMinor, 'Der Ticketgrundpreis');
    const baseInputType = input.baseInputType ?? null;
    const tax = input.baseTaxRateTemplateId
      ? await this.taxSnapshot(access, input.baseTaxRateTemplateId)
      : null;
    if (baseInputMinor === null && baseInputType === null && tax === null) {
      return {
        name,
        expectedQuantity,
        baseInputType: null,
        baseInputMinor: null,
        baseNetUnitMinor: null,
        baseGrossUnitMinor: null,
        baseTaxRateBasisPoints: null,
        baseTaxRateTemplateId: null,
        baseTaxRateTemplateVersion: null,
        baseTaxRateNameSnapshot: null,
        sortOrder,
        sourceTicketProviderTemplateId: input.sourceTicketProviderTemplateId ?? null,
        components: await Promise.all(
          (input.components ?? []).map((component) => this.componentValues(access, component)),
        ),
      };
    }
    if (baseInputMinor === null || baseInputType === null || tax === null) {
      throw new RevenuePlanningValidationError(
        'TICKET_BASE_PRICE_INCOMPLETE',
        'Ticketgrundpreis, Eingabeart und Umsatzsteuersatz müssen gemeinsam angegeben werden',
      );
    }
    const converted = convertNetGross(baseInputMinor, baseInputType, tax.rateBasisPoints);
    return {
      name,
      expectedQuantity,
      baseInputType,
      baseInputMinor,
      baseNetUnitMinor: converted.netMinor,
      baseGrossUnitMinor: converted.grossMinor,
      baseTaxRateBasisPoints: tax.rateBasisPoints,
      baseTaxRateTemplateId: tax.id,
      baseTaxRateTemplateVersion: tax.version,
      baseTaxRateNameSnapshot: tax.name,
      sortOrder,
      sourceTicketProviderTemplateId: input.sourceTicketProviderTemplateId ?? null,
      components: await Promise.all(
        (input.components ?? []).map((component) => this.componentValues(access, component)),
      ),
    };
  }

  private async componentValues(
    access: AccessContext,
    input: ComponentInput,
  ): Promise<ComponentValues> {
    const amountType = input.amountType ?? 'FIXED';
    const inputType = input.inputType ?? 'GROSS';
    const inputAmountMinor = parseRevenueMinor(input.inputAmountMinor, 'Der Preisbestandteil');
    const percentageRateBasisPoints = input.percentageRateBasisPoints ?? null;
    if (amountType === 'FIXED' && inputAmountMinor === null) {
      throw new RevenuePlanningValidationError(
        'COMPONENT_AMOUNT_REQUIRED',
        'Für einen festen Preisbestandteil ist ein Betrag erforderlich',
      );
    }
    if (amountType === 'PERCENTAGE' && percentageRateBasisPoints === null) {
      throw new RevenuePlanningValidationError(
        'COMPONENT_PERCENTAGE_REQUIRED',
        'Für einen prozentualen Preisbestandteil ist ein Prozentsatz erforderlich',
      );
    }
    if (percentageRateBasisPoints !== null) {
      assertBasisPoints(percentageRateBasisPoints, 'Der Prozentsatz');
    }
    const tax = await this.taxSnapshot(access, input.taxRateTemplateId ?? '');
    const allocations = input.allocations ?? [];
    if (allocations.length > 100) {
      throw new RevenuePlanningValidationError(
        'TOO_MANY_ALLOCATIONS',
        'Ein Preisbestandteil darf höchstens 100 Empfänger-Aufteilungen besitzen',
      );
    }
    return {
      name: cleanRevenueName(input.name ?? '', 'Die Preisbestandteil-Bezeichnung'),
      amountType,
      percentageRateBasisPoints: amountType === 'PERCENTAGE' ? percentageRateBasisPoints : null,
      inputType,
      inputAmountMinor: amountType === 'FIXED' ? inputAmountMinor : null,
      taxRateBasisPoints: tax.rateBasisPoints,
      taxRateTemplateId: tax.id,
      taxRateTemplateVersion: tax.version,
      taxRateNameSnapshot: tax.name,
      guestPays: input.guestPays ?? true,
      sortOrder: assertNonNegativeInteger(input.sortOrder ?? 0, 'Die Reihenfolge'),
      allocations: allocations.map((allocation, index) => this.allocationValues(allocation, index)),
    };
  }

  private allocationValues(input: AllocationInput, index: number): AllocationValues {
    const recipientType = input.recipientType ?? 'ORGANIZATION';
    const allocationType = input.allocationType ?? 'PERCENTAGE';
    const artistId = input.artistId ?? null;
    const businessPartnerId = input.businessPartnerId ?? null;
    const externalRecipientName =
      recipientType === 'EXTERNAL'
        ? cleanRevenueName(input.externalRecipientName ?? '', 'Der externe Empfänger')
        : null;
    if (recipientType === 'ARTIST' && !artistId) {
      throw new RevenuePlanningValidationError(
        'ALLOCATION_ARTIST_REQUIRED',
        'Für einen Artist-Anteil muss ein vorhandener Artist gewählt werden',
      );
    }
    if (recipientType === 'BUSINESS_PARTNER' && !businessPartnerId) {
      throw new RevenuePlanningValidationError(
        'ALLOCATION_PARTNER_REQUIRED',
        'Für einen Partner-Anteil muss ein vorhandener Geschäftspartner gewählt werden',
      );
    }
    const fixedAmountMinor = parseRevenueMinor(
      input.fixedAmountMinor,
      'Der feste Empfänger-Anteil',
    );
    const percentageBasisPoints = input.percentageBasisPoints ?? null;
    if (allocationType === 'FIXED' && fixedAmountMinor === null) {
      throw new RevenuePlanningValidationError(
        'ALLOCATION_FIXED_AMOUNT_REQUIRED',
        'Für eine feste Aufteilung ist ein Betrag erforderlich',
      );
    }
    if (allocationType === 'PERCENTAGE' && percentageBasisPoints === null) {
      throw new RevenuePlanningValidationError(
        'ALLOCATION_PERCENTAGE_REQUIRED',
        'Für eine prozentuale Aufteilung ist ein Prozentsatz erforderlich',
      );
    }
    if (percentageBasisPoints !== null) {
      assertBasisPoints(percentageBasisPoints, 'Der Aufteilungs-Prozentsatz', 10_000);
    }
    return {
      recipientType,
      artistId: recipientType === 'ARTIST' ? artistId : null,
      businessPartnerId: recipientType === 'BUSINESS_PARTNER' ? businessPartnerId : null,
      externalRecipientName,
      allocationType,
      percentageBasisPoints: allocationType === 'PERCENTAGE' ? percentageBasisPoints : null,
      fixedAmountMinor: allocationType === 'FIXED' ? fixedAmountMinor : null,
      sortOrder: assertNonNegativeInteger(input.sortOrder ?? index, 'Die Reihenfolge'),
    };
  }

  private async additionalRevenueValues(
    access: AccessContext,
    input: AdditionalRevenueInput,
  ): Promise<AdditionalRevenueValues> {
    const calculationType = input.calculationType ?? 'FIXED';
    const inputAmountMinor = parseRevenueMinor(input.inputAmountMinor, 'Der weitere Erlös');
    const percentageRateBasisPoints = input.percentageRateBasisPoints ?? null;
    if (calculationType === 'PERCENT_TICKET_BASE_NET' && percentageRateBasisPoints === null) {
      throw new RevenuePlanningValidationError(
        'ADDITIONAL_REVENUE_PERCENTAGE_REQUIRED',
        'Für den prozentualen Erlös ist ein Prozentsatz erforderlich',
      );
    }
    if (calculationType !== 'PERCENT_TICKET_BASE_NET' && inputAmountMinor === null) {
      throw new RevenuePlanningValidationError(
        'ADDITIONAL_REVENUE_AMOUNT_REQUIRED',
        'Für diesen Erlös ist ein Betrag erforderlich',
      );
    }
    if (percentageRateBasisPoints !== null) {
      assertBasisPoints(percentageRateBasisPoints, 'Der Prozentsatz');
    }
    const tax = await this.taxSnapshot(access, input.taxRateTemplateId ?? '');
    return {
      name: cleanRevenueName(input.name ?? '', 'Die Erlösbezeichnung'),
      calculationType,
      inputType: input.inputType ?? 'NET',
      inputAmountMinor: calculationType === 'PERCENT_TICKET_BASE_NET' ? null : inputAmountMinor,
      percentageRateBasisPoints:
        calculationType === 'PERCENT_TICKET_BASE_NET' ? percentageRateBasisPoints : null,
      taxRateBasisPoints: tax.rateBasisPoints,
      taxRateTemplateId: tax.id,
      taxRateTemplateVersion: tax.version,
      taxRateNameSnapshot: tax.name,
      confirmationStatus: input.confirmationStatus ?? 'PLANNED',
      note: cleanOptionalRevenueText(input.note),
      sortOrder: assertNonNegativeInteger(input.sortOrder ?? 0, 'Die Reihenfolge'),
    };
  }

  private async taxSnapshot(access: AccessContext, templateId: string) {
    if (!templateId) {
      throw new RevenuePlanningValidationError(
        'TAX_RATE_TEMPLATE_REQUIRED',
        'Eine aktive Steuersatzvorlage muss gewählt werden',
      );
    }
    const tax = await this.repository.findActiveTaxRateTemplate(access, templateId);
    if (!tax) {
      throw new RevenuePlanningValidationError(
        'TAX_RATE_TEMPLATE_INVALID',
        'Die Steuersatzvorlage ist nicht aktiv oder gehört nicht zur Organisation',
      );
    }
    return tax;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'REVENUE_PLAN_NOT_FOUND',
      message: 'Erlösplanung nicht gefunden',
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof RevenuePlanningValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error instanceof RevenuePlanningPersistenceError) {
      if (error.kind === 'NOT_FOUND') {
        throw new NotFoundException({ code: error.code, message: error.message });
      }
      if (error.kind === 'REFERENCE') {
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
      }
      throw new ConflictException({ code: error.code, message: error.message });
    }
    if (error instanceof CalculationTemplateSnapshotError) {
      if (error.code === 'VERSION_CONFLICT') this.versionConflict();
      if (error.code === 'REVENUE_PLAN_NOT_FOUND') this.notFound();
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    throw error;
  }
}
