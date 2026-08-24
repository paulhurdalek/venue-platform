import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS, type PermissionKey } from '../../security/security.constants.js';
import {
  artistHasIdentity,
  contactHasName,
  hasAtMostOnePrimaryRepresentative,
  hasUniqueRepresentativeContacts,
  trimNullable,
} from '../domain/master-data.rules.js';
import type {
  ArtistRecord,
  ArtistRepresentativeValues,
  ArtistValues,
  BusinessPartnerRecord,
  BusinessPartnerValues,
  ContactRecord,
  ContactDuplicateMatch,
  ContactReference,
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

  async listArtists(
    organizationId: string,
    query: ListQuery,
    access?: AccessContext,
  ): Promise<PageResult<ArtistRecord>> {
    const result = await this.repository.listArtists(organizationId, query);
    return access
      ? { ...result, items: result.items.map((artist) => this.redactArtist(access, artist)) }
      : result;
  }

  async artist(
    organizationId: string,
    artistId: string,
    access?: AccessContext,
  ): Promise<ArtistRecord> {
    const artist = this.requireRecord(await this.repository.artist(organizationId, artistId));
    return access ? this.redactArtist(access, artist) : artist;
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
    allowNameDuplicate = false,
  ): Promise<ContactRecord> {
    const values = this.contactValues(input);
    if (!contactHasName(values)) this.contactNameRequired();
    await this.requireNoContactDuplicate(access.organizationId, values, allowNameDuplicate);
    return this.repository.createContact(access, values);
  }

  async contactMatches(
    organizationId: string,
    input: Partial<ContactValues>,
  ): Promise<ContactDuplicateMatch[]> {
    const values = this.contactValues(input);
    if (!contactHasName(values)) this.contactNameRequired();
    return this.repository.findContactMatches(organizationId, values);
  }

  async createArtistContact(
    access: AccessContext,
    artistId: string,
    input: Partial<ContactValues>,
    roleIds: string[],
    allowNameDuplicate = false,
  ): Promise<ArtistRecord> {
    this.requirePermission(access, PERMISSIONS.CONTACTS_WRITE);
    const artist = await this.artist(access.organizationId, artistId);
    this.requireActiveRelationshipTargets(artist.status);
    const values = this.contactValues(input);
    if (!contactHasName(values)) this.contactNameRequired();
    await this.requireNoContactDuplicate(access.organizationId, values, allowNameDuplicate);
    const normalized = await this.requireContactRoles(roleIds);
    return this.repository.createArtistContact(access, artistId, values, normalized);
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
    if (this.artistRepresentativeContactIds(artist).has(contactId)) this.artistContactConflict();
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

  async linkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    businessPartnerId: string,
    roleIds: string[],
    representatives: ArtistRepresentativeValues[],
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const partner = await this.businessPartner(access.organizationId, businessPartnerId);
    this.requireActiveRelationshipTargets(artist.status, partner.status);
    if (artist.businessPartners.some((link) => link.businessPartner.id === businessPartnerId)) {
      this.relationshipExists();
    }
    const normalizedRoleIds = await this.requireBusinessPartnerAssociationRoles(roleIds);
    const normalizedRepresentatives = await this.normalizeRepresentatives(partner, representatives);
    const directContactIds = new Set(artist.contacts.map(({ contact }) => contact.id));
    if (
      normalizedRepresentatives.some((representative) => {
        const source = partner.contacts.find(
          ({ id }) => id === representative.businessPartnerContactId,
        );
        return source && directContactIds.has(source.contact.id);
      })
    ) {
      this.artistContactConflict();
    }
    return this.repository.linkArtistBusinessPartner(
      access,
      artistId,
      businessPartnerId,
      normalizedRoleIds,
      normalizedRepresentatives,
    );
  }

  async linkArtistBusinessPartnerWithContact(
    access: AccessContext,
    artistId: string,
    input: {
      businessPartnerId: string;
      roleIds: string[];
      contactId?: string;
      contact?: Partial<ContactValues>;
      contactRoleIds: string[];
      isPrimary: boolean;
      allowNameDuplicate?: boolean;
    },
  ): Promise<ArtistRecord> {
    this.requirePermission(access, PERMISSIONS.CONTACTS_WRITE);
    this.requirePermission(access, PERMISSIONS.BUSINESS_PARTNERS_WRITE);
    const artist = await this.artist(access.organizationId, artistId);
    const partner = await this.businessPartner(access.organizationId, input.businessPartnerId);
    this.requireActiveRelationshipTargets(artist.status, partner.status);
    if (artist.businessPartners.some(({ businessPartner }) => businessPartner.id === partner.id)) {
      this.relationshipExists();
    }
    const reference = await this.contactReference(
      access.organizationId,
      input.contactId,
      input.contact,
      input.allowNameDuplicate ?? false,
    );
    if (
      'contactId' in reference &&
      new Set(artist.contacts.map(({ contact }) => contact.id)).has(reference.contactId)
    ) {
      this.artistContactConflict();
    }
    const roleIds = await this.requireBusinessPartnerAssociationRoles(input.roleIds);
    const contactRoleIds = await this.requireContactRoles(input.contactRoleIds);
    return this.repository.linkArtistBusinessPartnerWithContact(
      access,
      artistId,
      partner.id,
      roleIds,
      reference,
      contactRoleIds,
      input.isPrimary,
    );
  }

  async setArtistBusinessPartnerRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    const normalized = await this.requireBusinessPartnerAssociationRoles(roleIds);
    if (this.sameIds(association!.roles, normalized)) this.noChanges();
    return this.requireUpdated(
      await this.repository.setArtistBusinessPartnerRoles(
        access,
        artistId,
        associationId,
        version,
        normalized,
      ),
    );
  }

  async unlinkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find((link) => link.id === associationId);
    if (!association) this.notFound();
    this.assertVersion(association!.version, version);
    return this.requireUpdated(
      await this.repository.unlinkArtistBusinessPartner(access, artistId, associationId, version),
    );
  }

  async addArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    input: ArtistRepresentativeValues,
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find((link) => link.id === associationId);
    if (!association) this.notFound();
    const partner = await this.businessPartner(
      access.organizationId,
      association!.businessPartner.id,
    );
    this.requireActiveRelationshipTargets(artist.status, partner.status);
    if (
      association!.representatives.some(
        ({ businessPartnerContactId }) =>
          businessPartnerContactId === input.businessPartnerContactId,
      )
    ) {
      this.relationshipExists();
    }
    if (input.isPrimary && association!.representatives.some(({ isPrimary }) => isPrimary)) {
      this.primaryRepresentativeExists();
    }
    const source = partner.contacts.find(({ id }) => id === input.businessPartnerContactId);
    if (source && artist.contacts.some(({ contact }) => contact.id === source.contact.id)) {
      this.artistContactConflict();
    }
    const [representative] = await this.normalizeRepresentatives(partner, [input]);
    return this.repository.addArtistRepresentative(
      access,
      artistId,
      associationId,
      partner.id,
      representative!,
    );
  }

  async addArtistRepresentativeWithContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    input: {
      contactId?: string;
      contact?: Partial<ContactValues>;
      roleIds: string[];
      isPrimary: boolean;
      allowNameDuplicate?: boolean;
    },
  ): Promise<ArtistRecord> {
    this.requirePermission(access, PERMISSIONS.CONTACTS_WRITE);
    this.requirePermission(access, PERMISSIONS.BUSINESS_PARTNERS_WRITE);
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find(({ id }) => id === associationId);
    if (!association) this.notFound();
    const partner = await this.businessPartner(
      access.organizationId,
      association!.businessPartner.id,
    );
    this.requireActiveRelationshipTargets(artist.status, partner.status);
    if (input.isPrimary && association!.representatives.some(({ isPrimary }) => isPrimary)) {
      this.primaryRepresentativeExists();
    }
    const reference = await this.contactReference(
      access.organizationId,
      input.contactId,
      input.contact,
      input.allowNameDuplicate ?? false,
    );
    if ('contactId' in reference) {
      if (artist.contacts.some(({ contact }) => contact.id === reference.contactId)) {
        this.artistContactConflict();
      }
      if (association!.representatives.some(({ contact }) => contact.id === reference.contactId)) {
        this.relationshipExists();
      }
    }
    const roleIds = await this.requireContactRoles(input.roleIds);
    return this.repository.addArtistRepresentativeWithContact(
      access,
      artistId,
      associationId,
      partner.id,
      reference,
      roleIds,
      input.isPrimary,
    );
  }

  async updateArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
    roleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find((link) => link.id === associationId);
    if (!association) this.notFound();
    const representative = association!.representatives.find(({ id }) => id === representativeId);
    if (!representative) this.notFound();
    this.assertVersion(representative!.version, version);
    if (
      isPrimary &&
      association!.representatives.some(
        (candidate) => candidate.id !== representativeId && candidate.isPrimary,
      )
    ) {
      this.primaryRepresentativeExists();
    }
    const normalized = await this.requireContactRoles(roleIds);
    if (
      representative!.isPrimary === isPrimary &&
      this.sameIds(representative!.roles, normalized)
    ) {
      this.noChanges();
    }
    return this.requireUpdated(
      await this.repository.updateArtistRepresentative(
        access,
        artistId,
        associationId,
        representativeId,
        version,
        normalized,
        isPrimary,
      ),
    );
  }

  async unlinkArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
  ): Promise<ArtistRecord> {
    const artist = await this.artist(access.organizationId, artistId);
    const association = artist.businessPartners.find((link) => link.id === associationId);
    if (!association) this.notFound();
    const representative = association!.representatives.find(({ id }) => id === representativeId);
    if (!representative) this.notFound();
    this.assertVersion(representative!.version, version);
    if (association!.representatives.length === 1) this.lastRepresentativeRequired();
    return this.requireUpdated(
      await this.repository.unlinkArtistRepresentative(
        access,
        artistId,
        associationId,
        representativeId,
        version,
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

  async createBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    input: Partial<ContactValues>,
    roleIds: string[],
    allowNameDuplicate = false,
  ): Promise<BusinessPartnerRecord> {
    this.requirePermission(access, PERMISSIONS.CONTACTS_WRITE);
    const partner = await this.businessPartner(access.organizationId, businessPartnerId);
    this.requireActiveRelationshipTargets(partner.status);
    const values = this.contactValues(input);
    if (!contactHasName(values)) this.contactNameRequired();
    await this.requireNoContactDuplicate(access.organizationId, values, allowNameDuplicate);
    const normalized = await this.requireContactRoles(roleIds);
    return this.repository.createBusinessPartnerContact(
      access,
      businessPartnerId,
      values,
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
    if (
      await this.repository.businessPartnerContactIsRepresentative(
        access.organizationId,
        associationId,
      )
    ) {
      this.relationshipInUse();
    }
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

  private async requireBusinessPartnerAssociationRoles(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) {
      throw new UnprocessableEntityException({
        code: 'ASSOCIATION_ROLE_REQUIRED',
        message: 'Mindestens eine Rolle für die Zuordnung ist erforderlich',
      });
    }
    return this.requireRoles(roleIds, 'business-partner');
  }

  private async normalizeRepresentatives(
    partner: BusinessPartnerRecord,
    representatives: ArtistRepresentativeValues[],
  ): Promise<ArtistRepresentativeValues[]> {
    if (representatives.length === 0) this.representativeRequired();
    if (!hasUniqueRepresentativeContacts(representatives)) this.duplicateRepresentative();
    if (!hasAtMostOnePrimaryRepresentative(representatives)) this.primaryRepresentativeExists();
    return Promise.all(
      representatives.map(async (representative) => {
        const source = partner.contacts.find(
          ({ id }) => id === representative.businessPartnerContactId,
        );
        if (!source) this.notFound();
        this.requireActiveRelationshipTargets(source!.contact.status);
        return {
          businessPartnerContactId: representative.businessPartnerContactId,
          roleIds: await this.requireContactRoles(representative.roleIds),
          isPrimary: representative.isPrimary,
        };
      }),
    );
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

  private async contactReference(
    organizationId: string,
    contactId: string | undefined,
    input: Partial<ContactValues> | undefined,
    allowNameDuplicate: boolean,
  ): Promise<ContactReference> {
    if ((contactId && input) || (!contactId && !input)) {
      throw new UnprocessableEntityException({
        code: 'CONTACT_REFERENCE_REQUIRED',
        message: 'Genau ein vorhandener oder neuer Kontakt muss angegeben werden',
      });
    }
    if (contactId) {
      const contact = await this.contact(organizationId, contactId);
      this.requireActiveRelationshipTargets(contact.status);
      return { contactId };
    }
    const values = this.contactValues(input!);
    if (!contactHasName(values)) this.contactNameRequired();
    await this.requireNoContactDuplicate(organizationId, values, allowNameDuplicate);
    return { contact: values };
  }

  private async requireNoContactDuplicate(
    organizationId: string,
    values: ContactValues,
    allowNameDuplicate: boolean,
  ): Promise<void> {
    const matches = await this.repository.findContactMatches(organizationId, values);
    const strong = matches.filter(({ strength }) => strength === 'STRONG');
    if (strong.length > 0) {
      throw new ConflictException({
        code: 'CONTACT_DUPLICATE_MATCH',
        message:
          'Ein Kontakt mit derselben E-Mail-Adresse oder Telefonnummer ist bereits vorhanden',
        matches: strong,
      });
    }
    if (!allowNameDuplicate && matches.length > 0) {
      throw new ConflictException({
        code: 'CONTACT_NAME_MATCH',
        message: 'Ein Kontakt mit demselben Vor- und Nachnamen ist bereits vorhanden',
        matches,
      });
    }
  }

  private artistRepresentativeContactIds(artist: ArtistRecord): Set<string> {
    return new Set(
      artist.businessPartners.flatMap(({ representatives }) =>
        representatives.map(({ contact }) => contact.id),
      ),
    );
  }

  private requirePermission(access: AccessContext, permission: PermissionKey): void {
    if (!access.permissions.includes(permission)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Für diese Aktion fehlt die erforderliche Berechtigung',
      });
    }
  }

  private redactArtist(access: AccessContext, artist: ArtistRecord): ArtistRecord {
    const canReadContacts = access.permissions.includes(PERMISSIONS.CONTACTS_READ);
    const canReadPartners = access.permissions.includes(PERMISSIONS.BUSINESS_PARTNERS_READ);
    return {
      ...artist,
      contacts: canReadContacts ? artist.contacts : [],
      businessPartners: canReadPartners
        ? artist.businessPartners.map((association) => ({
            ...association,
            representatives: canReadContacts ? association.representatives : [],
          }))
        : [],
    };
  }

  private requireActiveRelationshipTargets(...statuses: EntityStatus[]): void {
    if (statuses.some((status) => status !== 'ACTIVE')) {
      throw new ConflictException({
        code: 'ARCHIVED_RELATION_TARGET',
        message: 'Archivierte Stammdaten können nicht neu verknüpft werden',
      });
    }
  }

  private sameIds(current: RoleReference[], supplied: string[]): boolean {
    const currentIds = current.map(({ id }) => id).sort();
    const suppliedIds = [...supplied].sort();
    return (
      currentIds.length === suppliedIds.length &&
      currentIds.every((id, index) => id === suppliedIds[index])
    );
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
      message: 'Diese Zuordnung besteht bereits',
    });
  }

  private artistContactConflict(): never {
    throw new ConflictException({
      code: 'ARTIST_CONTACT_ASSIGNMENT_CONFLICT',
      message: 'Dieser Kontakt ist für den Artist bereits in der anderen Zuordnungsart hinterlegt',
    });
  }

  private representativeRequired(): never {
    throw new UnprocessableEntityException({
      code: 'REPRESENTATIVE_REQUIRED',
      message: 'Mindestens ein zuständiger Ansprechpartner ist erforderlich',
    });
  }

  private duplicateRepresentative(): never {
    throw new UnprocessableEntityException({
      code: 'DUPLICATE_REPRESENTATIVE',
      message: 'Ein Ansprechpartner darf innerhalb einer Vertretung nur einmal ausgewählt werden',
    });
  }

  private primaryRepresentativeExists(): never {
    throw new ConflictException({
      code: 'PRIMARY_REPRESENTATIVE_EXISTS',
      message: 'Für diese Unternehmensvertretung ist bereits ein Hauptansprechpartner festgelegt',
    });
  }

  private lastRepresentativeRequired(): never {
    throw new ConflictException({
      code: 'LAST_REPRESENTATIVE_REQUIRED',
      message: 'Der letzte Ansprechpartner kann nur mit der gesamten Vertretung gelöst werden',
    });
  }

  private relationshipInUse(): never {
    throw new ConflictException({
      code: 'RELATIONSHIP_IN_USE',
      message: 'Die Zuordnung wird als Ansprechpartner einer Artist-Vertretung verwendet',
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
