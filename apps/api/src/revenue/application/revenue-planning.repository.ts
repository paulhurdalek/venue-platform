import type { AccessContext } from '../../security/access.types.js';
import type {
  AdditionalRevenueRecord,
  AdditionalRevenueValues,
  ComponentValues,
  RevenuePlanRecord,
  TicketComponentRecord,
  TicketTierRecord,
  TicketTierValues,
} from './revenue-planning.models.js';
import type { TemplateRecipientResolution } from '../infrastructure/calculation-template-snapshot.js';

export const REVENUE_PLANNING_REPOSITORY = Symbol('REVENUE_PLANNING_REPOSITORY');

export interface RevenuePlanningRepository {
  findActiveTaxRateTemplate(
    access: AccessContext,
    templateId: string,
  ): Promise<{ id: string; name: string; version: number; rateBasisPoints: number } | undefined>;
  findPlan(access: AccessContext, eventId: string): Promise<RevenuePlanRecord | undefined>;
  previewCalculationTemplate(
    access: AccessContext,
    eventId: string,
    templateId: string,
  ): Promise<object>;
  applyCalculationTemplate(
    access: AccessContext,
    eventId: string,
    templateId: string,
    calculationVersion: number,
    confirmReplacement: boolean,
    resolutions: TemplateRecipientResolution[],
  ): Promise<RevenuePlanRecord>;
  setExpectedGuests(
    access: AccessContext,
    eventId: string,
    eventVersion: number,
    expectedGuestCount: number | null,
  ): Promise<RevenuePlanRecord | undefined>;
  createTicketTier(
    access: AccessContext,
    eventId: string,
    values: TicketTierValues,
  ): Promise<TicketTierRecord>;
  updateTicketTier(
    access: AccessContext,
    tierId: string,
    version: number,
    values: TicketTierValues,
  ): Promise<TicketTierRecord | undefined>;
  setTicketTierStatus(
    access: AccessContext,
    tierId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<TicketTierRecord | undefined>;
  createComponent(
    access: AccessContext,
    tierId: string,
    values: ComponentValues,
  ): Promise<TicketComponentRecord>;
  updateComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    values: ComponentValues,
  ): Promise<TicketComponentRecord | undefined>;
  setComponentStatus(
    access: AccessContext,
    componentId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<TicketComponentRecord | undefined>;
  createAdditionalRevenue(
    access: AccessContext,
    eventId: string,
    values: AdditionalRevenueValues,
  ): Promise<AdditionalRevenueRecord>;
  updateAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    values: AdditionalRevenueValues,
  ): Promise<AdditionalRevenueRecord | undefined>;
  setAdditionalRevenueStatus(
    access: AccessContext,
    revenueId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<AdditionalRevenueRecord | undefined>;
  moveTicketTier(
    access: AccessContext,
    tierId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ): Promise<TicketTierRecord | undefined>;
  moveComponent(
    access: AccessContext,
    componentId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ): Promise<TicketComponentRecord | undefined>;
  moveAdditionalRevenue(
    access: AccessContext,
    revenueId: string,
    version: number,
    direction: 'UP' | 'DOWN',
  ): Promise<AdditionalRevenueRecord | undefined>;
}

export class RevenuePlanningPersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: 'NOT_FOUND' | 'CONFLICT' | 'REFERENCE' = 'CONFLICT',
  ) {
    super(message);
    this.name = 'RevenuePlanningPersistenceError';
  }
}
