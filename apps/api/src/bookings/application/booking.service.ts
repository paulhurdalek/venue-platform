import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import {
  assertStatusTransition,
  BookingValidationError,
  cleanNullable,
  normalizeCustomRole,
  normalizeMoney,
  type BookingStatus,
  type HotelArrangement,
  type LineupRole,
  type ProgramItemKind,
} from '../domain/booking.rules.js';
import type {
  BookingRecord,
  BookingValues,
  EventProgramItemValues,
  LineupRequirementRecord,
  LineupRequirementValues,
} from './booking.models.js';
import {
  BOOKING_REPOSITORY,
  BookingPersistenceConflictError,
  BookingReferenceError,
  type BookingRepository,
} from './booking.repository.js';

export interface BookingInput {
  artistId?: string;
  role?: LineupRole;
  customRoleLabel?: string | null;
  status?: BookingStatus;
  performanceStartMinutes?: number | null;
  performanceDurationMinutes?: number | null;
  internalNote?: string | null;
  businessPartnerId?: string | null;
  contactId?: string | null;
  agreedFeeMinor?: string | null;
  agreedFeeCurrency?: string | null;
  travelArrangement?: string | null;
  travelCostMinor?: string | null;
  travelCostCurrency?: string | null;
  hotelRequired?: boolean;
  hotelArrangement?: HotelArrangement;
  hotelBuyoutMinor?: string | null;
  hotelBuyoutCurrency?: string | null;
  hotelNote?: string | null;
  confirmDuplicateArtist?: boolean;
}

export interface ProgramItemInput {
  bookingId?: string | null;
  kind: ProgramItemKind;
  label?: string | null;
  durationMinutes?: number | null;
}

export interface UpdateProgramItemInput {
  label?: string | null;
  durationMinutes?: number | null;
}

export interface LineupRequirementInput {
  id?: string;
  version?: number;
  role: LineupRole;
  customRoleLabel?: string | null;
  requiredCount: number;
  defaultFeeMinor?: string | null;
  defaultFeeCurrency?: string | null;
}

@Injectable()
export class BookingService {
  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly repository: BookingRepository,
  ) {}

  async list(access: AccessContext, eventId: string, includeHistorical: boolean) {
    await this.requireEvent(access, eventId);
    const rows = await this.repository.list(access.organizationId, eventId, includeHistorical);
    return rows.map((row) => this.redactBooking(access, row));
  }

  async find(access: AccessContext, bookingId: string) {
    const booking = this.requireBooking(
      await this.repository.find(access.organizationId, bookingId),
    );
    await this.requireEvent(access, booking.eventId);
    return this.redactBooking(access, booking);
  }

  async progress(access: AccessContext, eventId: string) {
    await this.requireEvent(access, eventId);
    return this.repository.progress(access.organizationId, eventId);
  }

  async create(access: AccessContext, eventId: string, input: BookingInput) {
    await this.requireEvent(access, eventId);
    this.assertFinanceWrite(access, input);
    try {
      const status = input.status ?? 'SHORTLISTED';
      const values = this.bookingValues(input);
      return this.redactBooking(
        access,
        await this.repository.create(
          access,
          eventId,
          status,
          values,
          input.confirmDuplicateArtist ?? false,
        ),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async update(access: AccessContext, bookingId: string, version: number, input: BookingInput) {
    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof BookingInput] !== undefined,
    );
    if (changedFields.length === 0) this.noChanges();
    this.assertFinanceWrite(access, input);
    try {
      const current = this.requireBooking(
        await this.repository.find(access.organizationId, bookingId),
      );
      await this.requireEvent(access, current.eventId);
      this.assertVersion(current.version, version);
      const values = this.bookingValues(input, current);
      const updated = await this.repository.update(
        access,
        bookingId,
        version,
        values,
        changedFields,
      );
      if (!updated) this.versionConflict();
      return this.redactBooking(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setStatus(
    access: AccessContext,
    bookingId: string,
    version: number,
    newStatus: BookingStatus,
    note: string | null | undefined,
    confirmReactivation: boolean,
  ) {
    try {
      const current = this.requireBooking(
        await this.repository.find(access.organizationId, bookingId),
      );
      await this.requireEvent(access, current.eventId);
      this.assertVersion(current.version, version);
      assertStatusTransition(current.status, newStatus, confirmReactivation);
      const updated = await this.repository.setStatus(
        access,
        bookingId,
        version,
        current.status,
        newStatus,
        cleanNullable(note),
      );
      if (!updated) this.versionConflict();
      return this.redactBooking(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async reorder(
    access: AccessContext,
    eventId: string,
    items: Array<{ bookingId: string; version: number }>,
  ) {
    await this.requireEvent(access, eventId);
    try {
      const result = await this.repository.reorder(access, eventId, items);
      if (items.length > 0 && result.length === 0) this.versionConflict();
      return result.map((row) => this.redactBooking(access, row));
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async listProgramItems(access: AccessContext, eventId: string) {
    await this.requireEvent(access, eventId);
    return this.repository.listProgramItems(access.organizationId, eventId);
  }

  async createProgramItem(access: AccessContext, eventId: string, input: ProgramItemInput) {
    await this.requireEvent(access, eventId);
    try {
      return await this.repository.createProgramItem(
        access,
        eventId,
        this.programItemValues(input),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateProgramItem(
    access: AccessContext,
    itemId: string,
    version: number,
    input: UpdateProgramItemInput,
  ) {
    if (input.label === undefined && input.durationMinutes === undefined) this.noChanges();
    const current = await this.repository.findProgramItem(access.organizationId, itemId);
    if (!current) this.resourceNotFound();
    await this.requireEvent(access, current!.eventId);
    this.assertVersion(current!.version, version);
    const updated = await this.repository.updateProgramItem(access, itemId, version, {
      label: input.label === undefined ? current!.label : cleanNullable(input.label),
      durationMinutes:
        input.durationMinutes === undefined ? current!.durationMinutes : input.durationMinutes,
    });
    if (!updated) this.versionConflict();
    return updated!;
  }

  async deleteProgramItem(access: AccessContext, itemId: string, version: number) {
    const current = await this.repository.findProgramItem(access.organizationId, itemId);
    if (!current) this.resourceNotFound();
    await this.requireEvent(access, current!.eventId);
    this.assertVersion(current!.version, version);
    if (!(await this.repository.deleteProgramItem(access, itemId, version))) {
      this.versionConflict();
    }
  }

  async reorderProgramItems(
    access: AccessContext,
    eventId: string,
    items: Array<{ itemId: string; version: number }>,
  ) {
    await this.requireEvent(access, eventId);
    try {
      const result = await this.repository.reorderProgramItems(access, eventId, items);
      if (items.length > 0 && result.length === 0) this.versionConflict();
      return result;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async getFormatRequirements(access: AccessContext, eventFormatId: string) {
    const result = await this.repository.formatRequirements(access.organizationId, eventFormatId);
    if (!result) this.resourceNotFound();
    return this.redactRequirements(access, result!);
  }

  async getEventRequirements(access: AccessContext, eventId: string) {
    await this.requireEvent(access, eventId);
    const result = await this.repository.eventRequirements(access.organizationId, eventId);
    if (!result) this.resourceNotFound();
    return this.redactRequirements(access, result!);
  }

  async replaceFormatRequirements(
    access: AccessContext,
    eventFormatId: string,
    version: number,
    inputs: LineupRequirementInput[],
  ) {
    this.assertRequirementFinanceWrite(access, inputs);
    try {
      const values = this.requirementValues(inputs);
      const result = await this.repository.replaceFormatRequirements(
        access,
        eventFormatId,
        version,
        values,
      );
      if (!result) this.versionConflict();
      return this.redactRequirements(access, result!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async replaceEventRequirements(
    access: AccessContext,
    eventId: string,
    version: number,
    inputs: LineupRequirementInput[],
  ) {
    await this.requireEvent(access, eventId);
    this.assertRequirementFinanceWrite(access, inputs);
    try {
      const values = this.requirementValues(inputs);
      const result = await this.repository.replaceEventRequirements(
        access,
        eventId,
        version,
        values,
      );
      if (!result) this.versionConflict();
      return this.redactRequirements(access, result!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  private bookingValues(input: BookingInput, current?: BookingRecord): BookingValues {
    const artistId = current?.artistId ?? input.artistId;
    if (!artistId) {
      throw new BookingValidationError('ARTIST_REQUIRED', 'Ein Artist ist erforderlich');
    }
    const role = input.role ?? current?.role;
    if (!role)
      throw new BookingValidationError('BOOKING_ROLE_REQUIRED', 'Eine Rolle ist erforderlich');
    const roleValues = normalizeCustomRole(
      role,
      input.customRoleLabel === undefined ? current?.customRoleLabel : input.customRoleLabel,
    );
    const feeChanged =
      input.agreedFeeMinor !== undefined || input.agreedFeeCurrency !== undefined || !current;
    const fee = feeChanged
      ? normalizeMoney(
          input.agreedFeeMinor === undefined ? current?.agreedFeeMinor : input.agreedFeeMinor,
          input.agreedFeeMinor === null
            ? null
            : input.agreedFeeCurrency === undefined
              ? current?.agreedFeeCurrency
              : input.agreedFeeCurrency,
          'Die Gage',
        )
      : {
          minor: current?.agreedFeeMinor ? BigInt(current.agreedFeeMinor) : null,
          currency: current?.agreedFeeCurrency ?? null,
        };
    const travelCostChanged =
      input.travelCostMinor !== undefined || input.travelCostCurrency !== undefined || !current;
    const travelCost = travelCostChanged
      ? normalizeMoney(
          input.travelCostMinor === undefined ? current?.travelCostMinor : input.travelCostMinor,
          input.travelCostMinor === null
            ? null
            : input.travelCostCurrency === undefined
              ? current?.travelCostCurrency
              : input.travelCostCurrency,
          'Die Reisekosten',
        )
      : {
          minor: current?.travelCostMinor ? BigInt(current.travelCostMinor) : null,
          currency: current?.travelCostCurrency ?? null,
        };
    const hotelArrangement =
      input.hotelArrangement ??
      (input.hotelRequired === undefined
        ? (current?.hotelArrangement ?? (current?.hotelRequired ? 'REQUIRED' : 'NONE'))
        : input.hotelRequired
          ? 'REQUIRED'
          : 'NONE');
    const hotelBuyoutChanged =
      input.hotelBuyoutMinor !== undefined || input.hotelBuyoutCurrency !== undefined || !current;
    const hotelBuyout = hotelBuyoutChanged
      ? normalizeMoney(
          input.hotelBuyoutMinor === undefined ? current?.hotelBuyoutMinor : input.hotelBuyoutMinor,
          input.hotelBuyoutMinor === null
            ? null
            : input.hotelBuyoutCurrency === undefined
              ? current?.hotelBuyoutCurrency
              : input.hotelBuyoutCurrency,
          'Der Hotel-Buy-out',
        )
      : {
          minor: current?.hotelBuyoutMinor ? BigInt(current.hotelBuyoutMinor) : null,
          currency: current?.hotelBuyoutCurrency ?? null,
        };
    if (hotelArrangement !== 'BUYOUT' && input.hotelBuyoutMinor) {
      throw new BookingValidationError(
        'HOTEL_BUYOUT_ARRANGEMENT_REQUIRED',
        'Ein Hotel-Buy-out-Betrag ist nur bei der Hotelregelung Hotel-Buy-out zulässig',
      );
    }
    return {
      artistId,
      role,
      ...roleValues,
      performanceStartMinutes:
        input.performanceStartMinutes === undefined
          ? (current?.performanceStartMinutes ?? null)
          : input.performanceStartMinutes,
      performanceDurationMinutes:
        input.performanceDurationMinutes === undefined
          ? (current?.performanceDurationMinutes ?? null)
          : input.performanceDurationMinutes,
      internalNote:
        input.internalNote === undefined
          ? (current?.internalNote ?? null)
          : cleanNullable(input.internalNote),
      businessPartnerId:
        input.businessPartnerId === undefined
          ? (current?.businessPartnerId ?? null)
          : input.businessPartnerId,
      contactId: input.contactId === undefined ? (current?.contactId ?? null) : input.contactId,
      agreedFeeMinor: fee.minor,
      agreedFeeCurrency: fee.currency,
      travelArrangement:
        input.travelArrangement === undefined
          ? (current?.travelArrangement ?? null)
          : cleanNullable(input.travelArrangement),
      travelCostMinor: travelCost.minor,
      travelCostCurrency: travelCost.currency,
      hotelRequired: hotelArrangement === 'REQUIRED',
      hotelArrangement,
      hotelBuyoutMinor: hotelBuyout.minor,
      hotelBuyoutCurrency: hotelBuyout.currency,
      hotelNote:
        input.hotelNote === undefined
          ? (current?.hotelNote ?? null)
          : cleanNullable(input.hotelNote),
    };
  }

  private programItemValues(input: ProgramItemInput): EventProgramItemValues {
    const bookingId = input.bookingId ?? null;
    if (input.kind === 'PERFORMANCE' && !bookingId) {
      throw new BookingValidationError(
        'PROGRAM_BOOKING_REQUIRED',
        'Ein Auftritt benötigt ein zugehöriges Booking',
      );
    }
    if (input.kind === 'BREAK' && bookingId) {
      throw new BookingValidationError(
        'PROGRAM_BREAK_BOOKING_FORBIDDEN',
        'Eine Pause darf keinem Booking zugeordnet sein',
      );
    }
    return {
      bookingId,
      kind: input.kind,
      label: cleanNullable(input.label),
      durationMinutes: input.durationMinutes ?? null,
    };
  }

  private requirementValues(inputs: LineupRequirementInput[]): LineupRequirementValues[] {
    const values = inputs.map((input, index) => {
      const roleValues = normalizeCustomRole(input.role, input.customRoleLabel);
      const fee = normalizeMoney(
        input.defaultFeeMinor,
        input.defaultFeeCurrency,
        'Die Standardgage',
      );
      return {
        ...(input.id ? { id: input.id, version: input.version! } : {}),
        role: input.role,
        ...roleValues,
        requiredCount: input.requiredCount,
        defaultFeeMinor: fee.minor,
        defaultFeeCurrency: fee.currency,
        sortOrder: index + 1,
      };
    });
    const keys = values.map((value) => `${value.role}:${value.normalizedCustomRoleLabel ?? ''}`);
    if (new Set(keys).size !== keys.length) {
      throw new BookingValidationError(
        'LINEUP_REQUIREMENT_ROLE_DUPLICATE',
        'Jede aktive Line-up-Rolle darf nur einmal vorkommen',
      );
    }
    if (values.some((value) => Boolean(value.id) !== Boolean(value.version))) {
      throw new BookingValidationError(
        'LINEUP_REQUIREMENT_VERSION_REQUIRED',
        'Bestehende Line-up-Vorgaben benötigen ID und Version',
      );
    }
    return values;
  }

  private async requireEvent(access: AccessContext, eventId: string) {
    const event = await this.repository.event(
      access.organizationId,
      eventId,
      access.locationScope === 'SELECTED' ? access.locationIds : undefined,
    );
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Veranstaltung nicht gefunden',
      });
    }
    return event;
  }

  private requireBooking(booking: BookingRecord | undefined): BookingRecord {
    if (!booking) this.resourceNotFound();
    return booking!;
  }

  private redactBooking(access: AccessContext, booking: BookingRecord): BookingRecord {
    const redacted = { ...booking };
    if (!this.canFinance(access)) {
      delete redacted.agreedFeeMinor;
      delete redacted.agreedFeeCurrency;
      delete redacted.travelCostMinor;
      delete redacted.travelCostCurrency;
    }
    if (!access.permissions.includes(PERMISSIONS.BUSINESS_PARTNERS_READ)) {
      delete redacted.businessPartnerId;
      delete redacted.businessPartnerName;
      delete redacted.businessPartnerStatus;
      delete redacted.businessPartnerRoleNames;
    }
    if (!access.permissions.includes(PERMISSIONS.CONTACTS_READ)) {
      delete redacted.contactId;
      delete redacted.contactName;
      delete redacted.contactFunctionLabel;
      delete redacted.contactStatus;
      delete redacted.contactEmail;
      delete redacted.contactPhone;
      delete redacted.contactMobile;
      delete redacted.contactRoleNames;
      delete redacted.contactIsPrimary;
      delete redacted.additionalContacts;
    }
    if (!access.permissions.includes(PERMISSIONS.ARTISTS_READ)) {
      delete redacted.artistEmail;
      delete redacted.artistPhone;
    }
    if (!this.canFinance(access)) {
      delete redacted.hotelBuyoutMinor;
      delete redacted.hotelBuyoutCurrency;
    }
    return redacted;
  }

  private redactRequirements(
    access: AccessContext,
    result: { version: number; items: LineupRequirementRecord[] },
  ) {
    if (this.canFinance(access)) return result;
    return {
      ...result,
      items: result.items.map((item) => {
        const redacted = { ...item };
        delete redacted.defaultFeeMinor;
        delete redacted.defaultFeeCurrency;
        return redacted;
      }),
    };
  }

  private canFinance(access: AccessContext): boolean {
    return access.permissions.includes(PERMISSIONS.BOOKINGS_FINANCE);
  }

  private assertFinanceWrite(access: AccessContext, input: BookingInput): void {
    if (
      !this.canFinance(access) &&
      (input.agreedFeeMinor !== undefined ||
        input.agreedFeeCurrency !== undefined ||
        input.travelCostMinor !== undefined ||
        input.travelCostCurrency !== undefined ||
        input.hotelBuyoutMinor !== undefined ||
        input.hotelBuyoutCurrency !== undefined)
    ) {
      throw new ForbiddenException({
        code: 'BOOKING_FINANCE_PERMISSION_REQUIRED',
        message: 'Für Booking-Gagen, Reise- und Hotel-Buy-out-Kosten fehlt die Berechtigung',
      });
    }
  }

  private assertRequirementFinanceWrite(
    access: AccessContext,
    inputs: LineupRequirementInput[],
  ): void {
    if (
      !this.canFinance(access) &&
      inputs.some(
        (input) => input.defaultFeeMinor !== undefined || input.defaultFeeCurrency !== undefined,
      )
    ) {
      throw new ForbiddenException({
        code: 'BOOKING_FINANCE_PERMISSION_REQUIRED',
        message: 'Für Standardgagen fehlt die Berechtigung',
      });
    }
  }

  private assertVersion(current: number, supplied: number): void {
    if (current !== supplied) this.versionConflict();
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private resourceNotFound(): never {
    throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Ressource nicht gefunden',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof BookingValidationError || error instanceof BookingReferenceError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error instanceof BookingPersistenceConflictError) {
      throw new ConflictException({
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    throw error;
  }
}
