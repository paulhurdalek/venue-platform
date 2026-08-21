import type { AccessContext } from '../../security/access.types.js';
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

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY');

export interface MasterDataRepository {
  listArtists(organizationId: string, query: ListQuery): Promise<PageResult<ArtistRecord>>;
  artist(organizationId: string, artistId: string): Promise<ArtistRecord | undefined>;
  createArtist(access: AccessContext, values: ArtistValues): Promise<ArtistRecord>;
  updateArtist(
    access: AccessContext,
    artistId: string,
    version: number,
    values: Partial<ArtistValues>,
    changedFields: string[],
  ): Promise<ArtistRecord | undefined>;
  setArtistStatus(
    access: AccessContext,
    artistId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ArtistRecord | undefined>;

  listContacts(organizationId: string, query: ListQuery): Promise<PageResult<ContactRecord>>;
  contact(organizationId: string, contactId: string): Promise<ContactRecord | undefined>;
  createContact(access: AccessContext, values: ContactValues): Promise<ContactRecord>;
  findContactMatches(
    organizationId: string,
    values: ContactValues,
  ): Promise<ContactDuplicateMatch[]>;
  updateContact(
    access: AccessContext,
    contactId: string,
    version: number,
    values: Partial<ContactValues>,
    changedFields: string[],
  ): Promise<ContactRecord | undefined>;
  setContactStatus(
    access: AccessContext,
    contactId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ContactRecord | undefined>;

  listBusinessPartners(
    organizationId: string,
    query: ListQuery,
  ): Promise<PageResult<BusinessPartnerRecord>>;
  businessPartner(
    organizationId: string,
    businessPartnerId: string,
  ): Promise<BusinessPartnerRecord | undefined>;
  createBusinessPartner(
    access: AccessContext,
    values: BusinessPartnerValues,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord>;
  updateBusinessPartner(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    values: Partial<BusinessPartnerValues>,
    changedFields: string[],
  ): Promise<BusinessPartnerRecord | undefined>;
  setBusinessPartnerStatus(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    status: EntityStatus,
  ): Promise<BusinessPartnerRecord | undefined>;
  setBusinessPartnerRoles(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord | undefined>;

  contactRoles(): Promise<RoleReference[]>;
  businessPartnerRoles(): Promise<RoleReference[]>;
  linkArtistContact(
    access: AccessContext,
    artistId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<ArtistRecord>;
  createArtistContact(
    access: AccessContext,
    artistId: string,
    values: ContactValues,
    roleIds: string[],
  ): Promise<ArtistRecord>;
  unlinkArtistContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord | undefined>;
  setArtistContactRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord | undefined>;
  linkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    businessPartnerId: string,
    roleIds: string[],
    representatives: ArtistRepresentativeValues[],
  ): Promise<ArtistRecord>;
  linkArtistBusinessPartnerWithContact(
    access: AccessContext,
    artistId: string,
    businessPartnerId: string,
    roleIds: string[],
    contact: ContactReference,
    contactRoleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord>;
  setArtistBusinessPartnerRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord | undefined>;
  unlinkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord | undefined>;
  addArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    businessPartnerId: string,
    representative: ArtistRepresentativeValues,
  ): Promise<ArtistRecord>;
  addArtistRepresentativeWithContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    businessPartnerId: string,
    contact: ContactReference,
    contactRoleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord>;
  updateArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
    roleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord | undefined>;
  unlinkArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
  ): Promise<ArtistRecord | undefined>;
  linkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord>;
  createBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    values: ContactValues,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord>;
  unlinkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
  ): Promise<BusinessPartnerRecord | undefined>;
  setBusinessPartnerContactRoles(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord | undefined>;
  businessPartnerContactIsRepresentative(
    organizationId: string,
    associationId: string,
  ): Promise<boolean>;
}
