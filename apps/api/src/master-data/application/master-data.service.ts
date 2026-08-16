import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AccessContext } from '../../security/access.types.js';
import { artistHasIdentity, contactHasName, trimNullable } from '../domain/master-data.rules.js';
import type {
  ArtistRecord,
  ArtistValues,
  BusinessPartnerRecord,
  BusinessPartnerValues,
  ContactRecord,
  ContactValues,
  EntityStatus,
  ListQuery,
  PageResult,
  RoleReference,
} from './master-data.models.js';
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from './master-data.repository.js';

@Injectable()
export class MasterDataService {
  constructor(
    @Inject(MASTER_DATA_REPOSITORY)
    private readonly repository: MasterDataRepository,
  ) {}

  listArtists(organizationId: string, query: ListQuery): Promise<PageResult<ArtistRecord>> {
    return this.repository.listArtists(organizationId, query);
  }

  async artist(organizationId: string, artistId: string): Promise<ArtistRecord> {
    return this.requireRecord(await this.repository.artist(organizationId, artistId));
  }

  async createArtist(access: AccessContext, input: Partial<ArtistValues>): Promise<ArtistRecord> {
    const values = this.artistValues(input);
    if (!artistHasIdentity(values)) this.artistIdentityRequired();
    return this.repository.createArtist(access, values);
  }

  async updateArtist(
    access: AccessContext,
    artistId: string,
    version: number,
    input: Partial<ArtistValues>,
  ): Promise<ArtistRecord> {
    const current = await this.artist(access.organizationId, artistId);
    this.assertVersion(current.version, version);
    const values = this.partialArtistValues(input);
    const changedFields = Object.keys(values);
    if (changedFields.length === 0) this.noChanges();
    if (!artistHasIdentity({ ...current, ...values })) this.artistIdentityRequired();
    return this.requireUpdated(
      await this.repository.updateArtist(access, artistId, version, values, changedFields),
    );
  }

  async setArtistStatus(
    access: AccessContext,
    artistId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ArtistRecord> {
    const current = await this.artist(access.organizationId, artistId);
    this.assertVersion(current.version, version);
    if (current.status === status) this.noChanges();
    return this.requireUpdated(
      await this.repository.setArtistStatus(access, artistId, version, status),
    );
  }

  listContacts(organizationId: string, query: ListQuery): Promise<PageResult<ContactRecord>> {
    return this.repository.listContacts(organizationId, query);
  }

  async contact(organizationId: string, contactId: string): Promise<ContactRecord> {
    return this.requireRecord(await this.repository.contact(organizationId, contactId));
  }

  async createContact(
    access: AccessContext,
    input: Partial<ContactValues>,
  ): Promise<ContactRecord> {
    const values = this.contactValues(input);
    if (!contactHasName(values)) this.contactNameRequired();
    return this.repository.createContact(access, values);
  }

  async updateContact(
    access: AccessContext,
    contactId: string,
    version: number,
    input: Partial<ContactValues>,
  ): Promise<ContactRecord> {
    const current = await this.contact(access.organizationId, contactId);
    this.assertVersion(current.version, version);
    const values = this.partialContactValues(input);
    const changedFields = Object.keys(values);
    if (changedFields.length === 0) this.noChanges();
    if (!contactHasName({ ...current, ...values })) this.contactNameRequired();
    return this.requireUpdated(
      await this.repository.updateContact(access, contactId, version, values, changedFields),
    );
  }

  async setContactStatus(
    access: AccessContext,
    contactId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ContactRecord> {
    const current = await this.contact(access.organizationId, contactId);
    this.assertVersion(current.version, version);
    if (current.status === status) this.noChanges();
    return this.requireUpdated(
      await this.repository.setContactStatus(access, contactId, version, status),
    );
  }

  listBusinessPartners(
    organizationId: string,
    query: ListQuery,
  ): Promise<PageResult<BusinessPartnerRecord>> {
    return this.repository.listBusinessPartners(organizationId, query);
  }

  async businessPartner(
    organizationId: string,
    businessPartnerId: string,
  ): Promise<BusinessPartnerRecord> {
    return this.requireRecord(
      await this.repository.businessPartner(organizationId, businessPartnerId),
    );
  }

  async createBusinessPartner(
    access: AccessContext,
    input: Partial<BusinessPartnerValues>,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    const values = this.businessPartnerValues(input);
    if (!values.companyName) this.companyNameRequired();
    const normalizedRoleIds = await this.requireRoles(roleIds, 'business-partner');
    return this.repository.createBusinessPartner(access, values, normalizedRoleIds);
  }

  async updateBusinessPartner(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    input: Partial<BusinessPartnerValues>,
  ): Promise<BusinessPartnerRecord> {
    const current = await this.businessPartner(access.organizationId, businessPartnerId);
    this.assertVersion(current.version, version);
    const values = this.partialBusinessPartnerValues(input);
    const changedFields = Object.keys(values);
    if (changedFields.length === 0) this.noChanges();
    if ('companyName' in values && !values.companyName) this.companyNameRequired();
    return this.requireUpdated(
      await this.repository.updateBusinessPartner(
        access,
        businessPartnerId,
        version,
        values,
        changedFields,
      ),
    );
  }

  async setBusinessPartnerStatus(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    status: EntityStatus,
  ): Promise<BusinessPartnerRecord> {
    const current = await this.businessPartner(access.organizationId, businessPartnerId);
    this.assertVersion(current.version, version);
    if (current.status === status) this.noChanges();
    return this.requireUpdated(
      await this.repository.setBusinessPartnerStatus(access, businessPartnerId, version, status),
    );
  }

  async setBusinessPartnerRoles(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    const current = await this.businessPartner(access.organizationId, businessPartnerId);
    this.assertVersion(current.version, version);
    const normalized = await this.requireRoles(roleIds, 'business-partner');
    return this.requireUpdated(
      await this.repository.setBusinessPartnerRoles(access, businessPartnerId, version, normalized),
    );
  }

  contactRoles(): Promise<RoleReference[]> {
    return this.repository.contactRoles();
  }

  businessPartnerRoles(): Promise<RoleReference[]> {
    return this.repository.businessPartnerRoles();
  }

  async linkArtistContact(
    access: AccessContext,
    artistId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const contact = await this.contact(access.organizationId, contactId);
    this.requireActiveRelationshipTargets(artist.status, contact.status);
    if (artist.contacts.some((link) => link.contact.id === contactId)) this.relationshipExists();
    const normalized = await this.requireContactRoles(roleIds);
    return this.repository.linkArtistContact(access, artistId, contactId, normalized);
  }

  async unlinkArtistContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.contacts.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    return this.requireUpdated(
      await this.repository.unlinkArtistContact(access, artistId, associationId, version),
    );
  }

  async setArtistContactRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.contacts.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    const normalized = await this.requireContactRoles(roleIds);
    return this.requireUpdated(
      await this.repository.setArtistContactRoles(
        access,
        artistId,
        associationId,
        version,
        normalized,
      ),
    );
  }

  async linkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    const partner = await this.businessPartner(access.organizationId, businessPartnerId);
    const contact = await this.contact(access.organizationId, contactId);
    this.requireActiveRelationshipTargets(partner.status, contact.status);
    if (partner.contacts.some((link) => link.contact.id === contactId)) this.relationshipExists();
    const normalized = await this.requireContactRoles(roleIds);
    return this.repository.linkBusinessPartnerContact(
      access,
      businessPartnerId,
      contactId,
      normalized,
    );
  }

  async unlinkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
  ): Promise<BusinessPartnerRecord> {
    const partner = await this.businessPartner(access.organizationId, businessPartnerId);
    const association = partner.contacts.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    return this.requireUpdated(
      await this.repository.unlinkBusinessPartnerContact(
        access,
        businessPartnerId,
        associationId,
        version,
      ),
    );
  }

  async setBusinessPartnerContactRoles(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    const partner = await this.businessPartner(access.organizationId, businessPartnerId);
    const association = partner.contacts.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    const normalized = await this.requireContactRoles(roleIds);
    return this.requireUpdated(
      await this.repository.setBusinessPartnerContactRoles(
        access,
        businessPartnerId,
        associationId,
        version,
        normalized,
      ),
    );
  }

  private artistValues(input: Partial<ArtistValues>): ArtistValues {
    return {
      stageName: this.string(input.stageName),
      firstName: this.string(input.firstName),
      lastName: this.string(input.lastName),
      addressLine1: this.string(input.addressLine1),
      addressLine2: this.string(input.addressLine2),
      postalCode: this.string(input.postalCode),
      city: this.string(input.city),
      state: this.string(input.state),
      countryCode: this.countryCode(input.countryCode),
      email: this.string(input.email),
      phone: this.string(input.phone),
      instagram: this.string(input.instagram),
      website: this.string(input.website),
      notes: this.string(input.notes),
    };
  }

  private partialArtistValues(input: Partial<ArtistValues>): Partial<ArtistValues> {
    return this.partialValues(input, ['countryCode']);
  }

  private contactValues(input: Partial<ContactValues>): ContactValues {
    return {
      firstName: this.string(input.firstName),
      lastName: this.string(input.lastName),
      label: this.string(input.label),
      email: this.string(input.email),
      phone: this.string(input.phone),
      mobile: this.string(input.mobile),
      notes: this.string(input.notes),
    };
  }

  private partialContactValues(input: Partial<ContactValues>): Partial<ContactValues> {
    return this.partialValues(input, []);
  }

  private businessPartnerValues(input: Partial<BusinessPartnerValues>): BusinessPartnerValues {
    return {
      companyName: this.requiredString(input.companyName),
      addressLine1: this.string(input.addressLine1),
      addressLine2: this.string(input.addressLine2),
      postalCode: this.string(input.postalCode),
      city: this.string(input.city),
      state: this.string(input.state),
      countryCode: this.countryCode(input.countryCode),
      billingAddressLine1: this.string(input.billingAddressLine1),
      billingAddressLine2: this.string(input.billingAddressLine2),
      billingPostalCode: this.string(input.billingPostalCode),
      billingCity: this.string(input.billingCity),
      billingState: this.string(input.billingState),
      billingCountryCode: this.countryCode(input.billingCountryCode),
      vatId: this.string(input.vatId),
      email: this.string(input.email),
      phone: this.string(input.phone),
      website: this.string(input.website),
      notes: this.string(input.notes),
    };
  }

  private partialBusinessPartnerValues(
    input: Partial<BusinessPartnerValues>,
  ): Partial<BusinessPartnerValues> {
    return this.partialValues(input, ['countryCode', 'billingCountryCode']);
  }

  private partialValues<T extends object>(input: T, countryFields: string[]): Partial<T> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      result[key] = countryFields.includes(key)
        ? this.countryCode(value as string | null)
        : trimNullable(value as string | null);
    }
    return result as Partial<T>;
  }

  private string(value: string | null | undefined): string | null {
    return trimNullable(value) ?? null;
  }

  private requiredString(value: string | null | undefined): string {
    return trimNullable(value) ?? '';
  }

  private countryCode(value: string | null | undefined): string | null {
    return this.string(value)?.toUpperCase() ?? null;
  }

  private async requireContactRoles(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) {
      throw new UnprocessableEntityException({
        code: 'ASSOCIATION_ROLE_REQUIRED',
        message: 'Mindestens eine Rolle für die Zuordnung ist erforderlich',
      });
    }
    return this.requireRoles(roleIds, 'contact');
  }

  private async requireRoles(
    roleIds: string[],
    type: 'contact' | 'business-partner',
  ): Promise<string[]> {
    const normalized = [...new Set(roleIds)];
    const available =
      type === 'contact'
        ? await this.repository.contactRoles()
        : await this.repository.businessPartnerRoles();
    const availableIds = new Set(available.map(({ id }) => id));
    if (!normalized.every((id) => availableIds.has(id))) this.notFound();
    return normalized;
  }

  private requireActiveRelationshipTargets(...statuses: EntityStatus[]): void {
    if (statuses.some((status) => status !== 'ACTIVE')) {
      throw new ConflictException({
        code: 'ARCHIVED_RELATION_TARGET',
        message: 'Archivierte Stammdaten können nicht neu verknüpft werden',
      });
    }
  }

  private assertVersion(current: number, supplied: number): void {
    if (current !== supplied) this.versionConflict();
  }

  private requireRecord<T>(record: T | undefined): T {
    if (!record) this.notFound();
    return record!;
  }

  private requireUpdated<T>(record: T | undefined): T {
    if (!record) this.versionConflict();
    return record!;
  }

  private artistIdentityRequired(): never {
    throw new UnprocessableEntityException({
      code: 'ARTIST_IDENTITY_REQUIRED',
      message: 'Künstlername oder Personenname ist erforderlich',
    });
  }

  private contactNameRequired(): never {
    throw new UnprocessableEntityException({
      code: 'CONTACT_NAME_REQUIRED',
      message: 'Vorname oder Nachname ist erforderlich',
    });
  }

  private companyNameRequired(): never {
    throw new UnprocessableEntityException({
      code: 'COMPANY_NAME_REQUIRED',
      message: 'Firmenname ist erforderlich',
    });
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private relationshipExists(): never {
    throw new ConflictException({
      code: 'RELATIONSHIP_EXISTS',
      message: 'Dieser Kontakt ist bereits verknüpft',
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Ressource nicht gefunden',
    });
  }
}
