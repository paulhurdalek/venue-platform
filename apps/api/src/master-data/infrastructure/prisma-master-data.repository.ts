import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient, Prisma, TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import type {
  ArtistRecord,
  ArtistRepresentativeValues,
  ArtistValues,
  BusinessPartnerRecord,
  BusinessPartnerValues,
  ContactAssociation,
  ContactDuplicateMatch,
  ContactRecord,
  ContactReference,
  ContactValues,
  EntityStatus,
  ListQuery,
  PageResult,
  RoleReference,
} from '../application/master-data.models.js';
import type { MasterDataRepository } from '../application/master-data.repository.js';
import {
  artistIsIncomplete,
  contactIsIncomplete,
  contactMatchReasons,
} from '../domain/master-data.rules.js';

const associationInclude = {
  contact: true,
  roles: { include: { role: true }, orderBy: { role: { name: 'asc' as const } } },
} satisfies Prisma.ArtistContactInclude;

const artistBusinessPartnerInclude = {
  businessPartner: true,
  roles: {
    include: { role: true },
    orderBy: { role: { name: 'asc' as const } },
  },
  representatives: {
    include: {
      businessPartnerContact: { include: { contact: true } },
      roles: { include: { role: true }, orderBy: { role: { name: 'asc' as const } } },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ArtistBusinessPartnerInclude;

const artistInclude = {
  contacts: {
    include: associationInclude,
    orderBy: { createdAt: 'asc' as const },
  },
  businessPartners: {
    include: artistBusinessPartnerInclude,
    orderBy: { businessPartner: { companyName: 'asc' as const } },
  },
} satisfies Prisma.ArtistInclude;

const contactInclude = {
  artistLinks: {
    include: {
      artist: true,
      roles: { include: { role: true }, orderBy: { role: { name: 'asc' as const } } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  businessPartnerLinks: {
    include: {
      businessPartner: true,
      roles: { include: { role: true }, orderBy: { role: { name: 'asc' as const } } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ContactInclude;

const partnerInclude = {
  contacts: {
    include: associationInclude,
    orderBy: { createdAt: 'asc' as const },
  },
  roles: {
    include: { role: true },
    orderBy: { role: { name: 'asc' as const } },
  },
} satisfies Prisma.BusinessPartnerInclude;

type Database = DatabaseClient | TransactionClient;
type ArtistRow = Prisma.ArtistGetPayload<{ include: typeof artistInclude }>;
type ContactRow = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
type PartnerRow = Prisma.BusinessPartnerGetPayload<{ include: typeof partnerInclude }>;

@Injectable()
export class PrismaMasterDataRepository implements MasterDataRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly audit: AuditWriter,
  ) {}

  async listArtists(organizationId: string, query: ListQuery): Promise<PageResult<ArtistRecord>> {
    const searchTokens = query.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.ArtistWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(searchTokens.length
        ? {
            AND: searchTokens.map((token) => ({
              OR: [
                { stageName: { contains: token, mode: 'insensitive' } },
                { firstName: { contains: token, mode: 'insensitive' } },
                { lastName: { contains: token, mode: 'insensitive' } },
                { email: { contains: token, mode: 'insensitive' } },
              ],
            })),
          }
        : {}),
      ...(query.incomplete === undefined
        ? {}
        : query.incomplete
          ? this.incompleteArtistWhere()
          : { NOT: this.incompleteArtistWhere() }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.artist.findMany({
        where,
        include: artistInclude,
        orderBy: [{ stageName: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.artist.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapArtist(row)), total, ...this.page(query) };
  }

  async artist(organizationId: string, artistId: string): Promise<ArtistRecord | undefined> {
    return this.findArtist(this.prisma.database, organizationId, artistId);
  }

  async createArtist(access: AccessContext, values: ArtistValues): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const artist = await transaction.artist.create({
        data: { organizationId: access.organizationId, ...values },
      });
      await this.audit.append(transaction, access, 'artist.created', 'artist', artist.id, {});
      return (await this.findArtist(transaction, access.organizationId, artist.id))!;
    });
  }

  async updateArtist(
    access: AccessContext,
    artistId: string,
    version: number,
    values: Partial<ArtistValues>,
    changedFields: string[],
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.artist.updateMany({
        where: { id: artistId, organizationId: access.organizationId, version },
        data: { ...values, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(transaction, access, 'artist.updated', 'artist', artistId, {
        changedFields,
        previousVersion: version,
      });
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async setArtistStatus(
    access: AccessContext,
    artistId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.artist.updateMany({
        where: { id: artistId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(
        transaction,
        access,
        status === 'ARCHIVED' ? 'artist.archived' : 'artist.reactivated',
        'artist',
        artistId,
        { previousVersion: version },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async listContacts(organizationId: string, query: ListQuery): Promise<PageResult<ContactRecord>> {
    const incompleteWhere: Prisma.ContactWhereInput = {
      email: null,
      phone: null,
      mobile: null,
    };
    const where: Prisma.ContactWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { label: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.incomplete === undefined
        ? {}
        : query.incomplete
          ? incompleteWhere
          : { NOT: incompleteWhere }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.contact.findMany({
        where,
        include: contactInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.contact.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapContact(row)), total, ...this.page(query) };
  }

  async contact(organizationId: string, contactId: string): Promise<ContactRecord | undefined> {
    return this.findContact(this.prisma.database, organizationId, contactId);
  }

  async createContact(access: AccessContext, values: ContactValues): Promise<ContactRecord> {
    return this.prisma.transaction(async (transaction) => {
      const contact = await transaction.contact.create({
        data: { organizationId: access.organizationId, ...values },
      });
      await this.audit.append(transaction, access, 'contact.created', 'contact', contact.id, {});
      return (await this.findContact(transaction, access.organizationId, contact.id))!;
    });
  }

  async findContactMatches(
    organizationId: string,
    values: ContactValues,
  ): Promise<ContactDuplicateMatch[]> {
    const contacts = await this.prisma.database.contact.findMany({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return contacts.flatMap((contact) => {
      const reasons = contactMatchReasons(contact, values);
      if (reasons.length === 0) return [];
      return [
        {
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            label: contact.label,
            email: contact.email,
            phone: contact.phone,
            mobile: contact.mobile,
            status: contact.status,
            incomplete: contactIsIncomplete(contact),
          },
          reasons,
          strength: reasons.some((reason) => reason === 'EMAIL' || reason === 'PHONE')
            ? ('STRONG' as const)
            : ('WEAK' as const),
        },
      ];
    });
  }

  async updateContact(
    access: AccessContext,
    contactId: string,
    version: number,
    values: Partial<ContactValues>,
    changedFields: string[],
  ): Promise<ContactRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.contact.updateMany({
        where: { id: contactId, organizationId: access.organizationId, version },
        data: { ...values, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(transaction, access, 'contact.updated', 'contact', contactId, {
        changedFields,
        previousVersion: version,
      });
      return this.findContact(transaction, access.organizationId, contactId);
    });
  }

  async setContactStatus(
    access: AccessContext,
    contactId: string,
    version: number,
    status: EntityStatus,
  ): Promise<ContactRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.contact.updateMany({
        where: { id: contactId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(
        transaction,
        access,
        status === 'ARCHIVED' ? 'contact.archived' : 'contact.reactivated',
        'contact',
        contactId,
        { previousVersion: version },
      );
      return this.findContact(transaction, access.organizationId, contactId);
    });
  }

  async listBusinessPartners(
    organizationId: string,
    query: ListQuery,
  ): Promise<PageResult<BusinessPartnerRecord>> {
    const where: Prisma.BusinessPartnerWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.q
        ? {
            OR: [
              { companyName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { vatId: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.roleKey ? { roles: { some: { role: { key: query.roleKey } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.businessPartner.findMany({
        where,
        include: partnerInclude,
        orderBy: [{ companyName: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.businessPartner.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapPartner(row)), total, ...this.page(query) };
  }

  async businessPartner(
    organizationId: string,
    businessPartnerId: string,
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.findPartner(this.prisma.database, organizationId, businessPartnerId);
  }

  async createBusinessPartner(
    access: AccessContext,
    values: BusinessPartnerValues,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    return this.prisma.transaction(async (transaction) => {
      const partner = await transaction.businessPartner.create({
        data: { organizationId: access.organizationId, ...values },
      });
      if (roleIds.length > 0) {
        await transaction.businessPartnerRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({
            organizationId: access.organizationId,
            businessPartnerId: partner.id,
            roleId,
          })),
        });
      }
      await this.audit.append(
        transaction,
        access,
        'business_partner.created',
        'business_partner',
        partner.id,
        { roleIds },
      );
      return (await this.findPartner(transaction, access.organizationId, partner.id))!;
    });
  }

  async updateBusinessPartner(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    values: Partial<BusinessPartnerValues>,
    changedFields: string[],
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.businessPartner.updateMany({
        where: { id: businessPartnerId, organizationId: access.organizationId, version },
        data: { ...values, version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(
        transaction,
        access,
        'business_partner.updated',
        'business_partner',
        businessPartnerId,
        { changedFields, previousVersion: version },
      );
      return this.findPartner(transaction, access.organizationId, businessPartnerId);
    });
  }

  async setBusinessPartnerStatus(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    status: EntityStatus,
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.businessPartner.updateMany({
        where: { id: businessPartnerId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.audit.append(
        transaction,
        access,
        status === 'ARCHIVED' ? 'business_partner.archived' : 'business_partner.reactivated',
        'business_partner',
        businessPartnerId,
        { previousVersion: version },
      );
      return this.findPartner(transaction, access.organizationId, businessPartnerId);
    });
  }

  async setBusinessPartnerRoles(
    access: AccessContext,
    businessPartnerId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.businessPartner.updateMany({
        where: { id: businessPartnerId, organizationId: access.organizationId, version },
        data: { version: { increment: 1 } },
      });
      if (result.count !== 1) return undefined;
      await transaction.businessPartnerRoleAssignment.deleteMany({
        where: { organizationId: access.organizationId, businessPartnerId },
      });
      if (roleIds.length > 0) {
        await transaction.businessPartnerRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({
            organizationId: access.organizationId,
            businessPartnerId,
            roleId,
          })),
        });
      }
      await this.audit.append(
        transaction,
        access,
        'business_partner.roles_updated',
        'business_partner',
        businessPartnerId,
        { roleIds, previousVersion: version },
      );
      return this.findPartner(transaction, access.organizationId, businessPartnerId);
    });
  }

  async contactRoles(): Promise<RoleReference[]> {
    return this.prisma.database.contactRole.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  async businessPartnerRoles(): Promise<RoleReference[]> {
    return this.prisma.database.businessPartnerRole.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async linkArtistContact(
    access: AccessContext,
    artistId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const link = await transaction.artistContact.create({
        data: { organizationId: access.organizationId, artistId, contactId },
      });
      await transaction.artistContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistContactId: link.id,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.contact_linked',
        'artist_contact',
        link.id,
        { artistId, contactId, roleIds },
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async createArtistContact(
    access: AccessContext,
    artistId: string,
    values: ContactValues,
    roleIds: string[],
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const contactId = await this.createContactInTransaction(transaction, access, values);
      const link = await transaction.artistContact.create({
        data: { organizationId: access.organizationId, artistId, contactId },
      });
      await transaction.artistContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistContactId: link.id,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.contact_linked',
        'artist_contact',
        link.id,
        {
          artistId,
          contactId,
          roleIds,
        },
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async unlinkArtistContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistContact.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          artistId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      const association = await transaction.artistContact.findUniqueOrThrow({
        where: { id: associationId },
      });
      await transaction.artistContactRole.deleteMany({ where: { artistContactId: associationId } });
      await transaction.artistContact.delete({ where: { id: associationId } });
      await this.audit.append(
        transaction,
        access,
        'artist.contact_unlinked',
        'artist_contact',
        associationId,
        { artistId, contactId: association.contactId },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async setArtistContactRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistContact.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          artistId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      await transaction.artistContactRole.deleteMany({ where: { artistContactId: associationId } });
      await transaction.artistContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistContactId: associationId,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.contact_roles_updated',
        'artist_contact',
        associationId,
        { artistId, roleIds, previousVersion: version },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async linkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    businessPartnerId: string,
    roleIds: string[],
    representatives: ArtistRepresentativeValues[],
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const link = await transaction.artistBusinessPartner.create({
        data: { organizationId: access.organizationId, artistId, businessPartnerId },
      });
      await transaction.artistBusinessPartnerRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistBusinessPartnerId: link.id,
          roleId,
        })),
      });
      for (const representative of representatives) {
        const contact = await transaction.artistBusinessPartnerContact.create({
          data: {
            organizationId: access.organizationId,
            artistBusinessPartnerId: link.id,
            businessPartnerId,
            businessPartnerContactId: representative.businessPartnerContactId,
            isPrimary: representative.isPrimary,
          },
        });
        await transaction.artistBusinessPartnerContactRole.createMany({
          data: representative.roleIds.map((roleId) => ({
            organizationId: access.organizationId,
            artistBusinessPartnerContactId: contact.id,
            roleId,
          })),
        });
      }
      await this.audit.append(
        transaction,
        access,
        'artist.business_partner_linked',
        'artist_business_partner',
        link.id,
        {
          artistId,
          businessPartnerId,
          roleIds,
          representatives: representatives.map((representative) => ({
            businessPartnerContactId: representative.businessPartnerContactId,
            roleIds: representative.roleIds,
            isPrimary: representative.isPrimary,
          })),
        },
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async linkArtistBusinessPartnerWithContact(
    access: AccessContext,
    artistId: string,
    businessPartnerId: string,
    roleIds: string[],
    contact: ContactReference,
    contactRoleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const contactId =
        'contactId' in contact
          ? contact.contactId
          : await this.createContactInTransaction(transaction, access, contact.contact);
      const source = await this.ensureBusinessPartnerContact(
        transaction,
        access,
        businessPartnerId,
        contactId,
        contactRoleIds,
      );
      const association = await transaction.artistBusinessPartner.create({
        data: { organizationId: access.organizationId, artistId, businessPartnerId },
      });
      await transaction.artistBusinessPartnerRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistBusinessPartnerId: association.id,
          roleId,
        })),
      });
      const representative = await this.createArtistRepresentativeInTransaction(
        transaction,
        access,
        association.id,
        businessPartnerId,
        source.id,
        contactRoleIds,
        isPrimary,
      );
      await this.audit.append(
        transaction,
        access,
        'artist.business_partner_linked',
        'artist_business_partner',
        association.id,
        {
          artistId,
          businessPartnerId,
          roleIds,
          representativeIds: [representative.id],
        },
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async setArtistBusinessPartnerRoles(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistBusinessPartner.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          artistId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      await transaction.artistBusinessPartnerRole.deleteMany({
        where: { artistBusinessPartnerId: associationId },
      });
      await transaction.artistBusinessPartnerRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistBusinessPartnerId: associationId,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.business_partner_roles_updated',
        'artist_business_partner',
        associationId,
        { artistId, roleIds, previousVersion: version },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async unlinkArtistBusinessPartner(
    access: AccessContext,
    artistId: string,
    associationId: string,
    version: number,
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistBusinessPartner.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          artistId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      const link = await transaction.artistBusinessPartner.findUniqueOrThrow({
        where: { id: associationId },
      });
      const representatives = await transaction.artistBusinessPartnerContact.findMany({
        where: { artistBusinessPartnerId: associationId },
        select: { id: true },
      });
      const representativeIds = representatives.map(({ id }) => id);
      await transaction.artistBusinessPartnerContactRole.deleteMany({
        where: { artistBusinessPartnerContactId: { in: representativeIds } },
      });
      await transaction.artistBusinessPartnerContact.deleteMany({
        where: { artistBusinessPartnerId: associationId },
      });
      await transaction.artistBusinessPartnerRole.deleteMany({
        where: { artistBusinessPartnerId: associationId },
      });
      await transaction.artistBusinessPartner.delete({ where: { id: associationId } });
      await this.audit.append(
        transaction,
        access,
        'artist.business_partner_unlinked',
        'artist_business_partner',
        associationId,
        { artistId, businessPartnerId: link.businessPartnerId, previousVersion: version },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async addArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    businessPartnerId: string,
    representative: ArtistRepresentativeValues,
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const link = await transaction.artistBusinessPartnerContact.create({
        data: {
          organizationId: access.organizationId,
          artistBusinessPartnerId: associationId,
          businessPartnerId,
          businessPartnerContactId: representative.businessPartnerContactId,
          isPrimary: representative.isPrimary,
        },
      });
      await transaction.artistBusinessPartnerContactRole.createMany({
        data: representative.roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistBusinessPartnerContactId: link.id,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.representative_linked',
        'artist_business_partner_contact',
        link.id,
        {
          artistId,
          artistBusinessPartnerId: associationId,
          businessPartnerId,
          businessPartnerContactId: representative.businessPartnerContactId,
          roleIds: representative.roleIds,
          isPrimary: representative.isPrimary,
        },
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async addArtistRepresentativeWithContact(
    access: AccessContext,
    artistId: string,
    associationId: string,
    businessPartnerId: string,
    contact: ContactReference,
    contactRoleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord> {
    return this.prisma.transaction(async (transaction) => {
      const contactId =
        'contactId' in contact
          ? contact.contactId
          : await this.createContactInTransaction(transaction, access, contact.contact);
      const source = await this.ensureBusinessPartnerContact(
        transaction,
        access,
        businessPartnerId,
        contactId,
        contactRoleIds,
      );
      await this.createArtistRepresentativeInTransaction(
        transaction,
        access,
        associationId,
        businessPartnerId,
        source.id,
        contactRoleIds,
        isPrimary,
      );
      return (await this.findArtist(transaction, access.organizationId, artistId))!;
    });
  }

  async updateArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
    roleIds: string[],
    isPrimary: boolean,
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistBusinessPartnerContact.updateMany({
        where: {
          id: representativeId,
          organizationId: access.organizationId,
          artistBusinessPartnerId: associationId,
          version,
        },
        data: { isPrimary, version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      await transaction.artistBusinessPartnerContactRole.deleteMany({
        where: { artistBusinessPartnerContactId: representativeId },
      });
      await transaction.artistBusinessPartnerContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          artistBusinessPartnerContactId: representativeId,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'artist.representative_updated',
        'artist_business_partner_contact',
        representativeId,
        {
          artistId,
          artistBusinessPartnerId: associationId,
          roleIds,
          isPrimary,
          previousVersion: version,
        },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async unlinkArtistRepresentative(
    access: AccessContext,
    artistId: string,
    associationId: string,
    representativeId: string,
    version: number,
  ): Promise<ArtistRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.artistBusinessPartnerContact.updateMany({
        where: {
          id: representativeId,
          organizationId: access.organizationId,
          artistBusinessPartnerId: associationId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      const representative = await transaction.artistBusinessPartnerContact.findUniqueOrThrow({
        where: { id: representativeId },
      });
      await transaction.artistBusinessPartnerContactRole.deleteMany({
        where: { artistBusinessPartnerContactId: representativeId },
      });
      await transaction.artistBusinessPartnerContact.delete({ where: { id: representativeId } });
      await this.audit.append(
        transaction,
        access,
        'artist.representative_unlinked',
        'artist_business_partner_contact',
        representativeId,
        {
          artistId,
          artistBusinessPartnerId: associationId,
          businessPartnerContactId: representative.businessPartnerContactId,
          previousVersion: version,
        },
      );
      return this.findArtist(transaction, access.organizationId, artistId);
    });
  }

  async linkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    return this.prisma.transaction(async (transaction) => {
      const link = await transaction.businessPartnerContact.create({
        data: { organizationId: access.organizationId, businessPartnerId, contactId },
      });
      await transaction.businessPartnerContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          businessPartnerContactId: link.id,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'business_partner.contact_linked',
        'business_partner_contact',
        link.id,
        { businessPartnerId, contactId, roleIds },
      );
      return (await this.findPartner(transaction, access.organizationId, businessPartnerId))!;
    });
  }

  async createBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    values: ContactValues,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord> {
    return this.prisma.transaction(async (transaction) => {
      const contactId = await this.createContactInTransaction(transaction, access, values);
      await this.ensureBusinessPartnerContact(
        transaction,
        access,
        businessPartnerId,
        contactId,
        roleIds,
      );
      return (await this.findPartner(transaction, access.organizationId, businessPartnerId))!;
    });
  }

  async unlinkBusinessPartnerContact(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.businessPartnerContact.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          businessPartnerId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      const association = await transaction.businessPartnerContact.findUniqueOrThrow({
        where: { id: associationId },
      });
      await transaction.businessPartnerContactRole.deleteMany({
        where: { businessPartnerContactId: associationId },
      });
      await transaction.businessPartnerContact.delete({ where: { id: associationId } });
      await this.audit.append(
        transaction,
        access,
        'business_partner.contact_unlinked',
        'business_partner_contact',
        associationId,
        { businessPartnerId, contactId: association.contactId },
      );
      return this.findPartner(transaction, access.organizationId, businessPartnerId);
    });
  }

  async setBusinessPartnerContactRoles(
    access: AccessContext,
    businessPartnerId: string,
    associationId: string,
    version: number,
    roleIds: string[],
  ): Promise<BusinessPartnerRecord | undefined> {
    return this.prisma.transaction(async (transaction) => {
      const updated = await transaction.businessPartnerContact.updateMany({
        where: {
          id: associationId,
          organizationId: access.organizationId,
          businessPartnerId,
          version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      await transaction.businessPartnerContactRole.deleteMany({
        where: { businessPartnerContactId: associationId },
      });
      await transaction.businessPartnerContactRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          businessPartnerContactId: associationId,
          roleId,
        })),
      });
      await this.audit.append(
        transaction,
        access,
        'business_partner.contact_roles_updated',
        'business_partner_contact',
        associationId,
        { businessPartnerId, roleIds, previousVersion: version },
      );
      return this.findPartner(transaction, access.organizationId, businessPartnerId);
    });
  }

  async businessPartnerContactIsRepresentative(
    organizationId: string,
    associationId: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.database.artistBusinessPartnerContact.count({
        where: { organizationId, businessPartnerContactId: associationId },
      })) > 0
    );
  }

  private async createContactInTransaction(
    transaction: TransactionClient,
    access: AccessContext,
    values: ContactValues,
  ): Promise<string> {
    const contact = await transaction.contact.create({
      data: { organizationId: access.organizationId, ...values },
    });
    await this.audit.append(transaction, access, 'contact.created', 'contact', contact.id, {});
    return contact.id;
  }

  private async ensureBusinessPartnerContact(
    transaction: TransactionClient,
    access: AccessContext,
    businessPartnerId: string,
    contactId: string,
    roleIds: string[],
  ): Promise<{ id: string }> {
    const existing = await transaction.businessPartnerContact.findFirst({
      where: { organizationId: access.organizationId, businessPartnerId, contactId },
      select: { id: true },
    });
    if (existing) return existing;
    const link = await transaction.businessPartnerContact.create({
      data: { organizationId: access.organizationId, businessPartnerId, contactId },
    });
    await transaction.businessPartnerContactRole.createMany({
      data: roleIds.map((roleId) => ({
        organizationId: access.organizationId,
        businessPartnerContactId: link.id,
        roleId,
      })),
    });
    await this.audit.append(
      transaction,
      access,
      'business_partner.contact_linked',
      'business_partner_contact',
      link.id,
      { businessPartnerId, contactId, roleIds },
    );
    return link;
  }

  private async createArtistRepresentativeInTransaction(
    transaction: TransactionClient,
    access: AccessContext,
    associationId: string,
    businessPartnerId: string,
    businessPartnerContactId: string,
    roleIds: string[],
    isPrimary: boolean,
  ): Promise<{ id: string }> {
    const link = await transaction.artistBusinessPartnerContact.create({
      data: {
        organizationId: access.organizationId,
        artistBusinessPartnerId: associationId,
        businessPartnerId,
        businessPartnerContactId,
        isPrimary,
      },
    });
    await transaction.artistBusinessPartnerContactRole.createMany({
      data: roleIds.map((roleId) => ({
        organizationId: access.organizationId,
        artistBusinessPartnerContactId: link.id,
        roleId,
      })),
    });
    await this.audit.append(
      transaction,
      access,
      'artist.representative_linked',
      'artist_business_partner_contact',
      link.id,
      {
        artistBusinessPartnerId: associationId,
        businessPartnerId,
        businessPartnerContactId,
        roleIds,
        isPrimary,
      },
    );
    return link;
  }

  private async findArtist(
    database: Database,
    organizationId: string,
    artistId: string,
  ): Promise<ArtistRecord | undefined> {
    const row = await database.artist.findFirst({
      where: { id: artistId, organizationId },
      include: artistInclude,
    });
    return row ? this.mapArtist(row) : undefined;
  }

  private async findContact(
    database: Database,
    organizationId: string,
    contactId: string,
  ): Promise<ContactRecord | undefined> {
    const row = await database.contact.findFirst({
      where: { id: contactId, organizationId },
      include: contactInclude,
    });
    return row ? this.mapContact(row) : undefined;
  }

  private async findPartner(
    database: Database,
    organizationId: string,
    businessPartnerId: string,
  ): Promise<BusinessPartnerRecord | undefined> {
    const row = await database.businessPartner.findFirst({
      where: { id: businessPartnerId, organizationId },
      include: partnerInclude,
    });
    return row ? this.mapPartner(row) : undefined;
  }

  private mapArtist(row: ArtistRow): ArtistRecord {
    const contacts = row.contacts.map((association) => this.mapAssociation(association));
    const businessPartners = row.businessPartners.map((association) =>
      this.mapArtistBusinessPartner(association),
    );
    return {
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      incomplete: artistIsIncomplete(row, [
        ...contacts.map(({ contact }) => contact),
        ...businessPartners.flatMap(({ representatives }) =>
          representatives.map(({ contact }) => contact),
        ),
      ]),
      contacts,
      businessPartners,
    };
  }

  private mapArtistBusinessPartner(
    association: ArtistRow['businessPartners'][number],
  ): ArtistRecord['businessPartners'][number] {
    return {
      id: association.id,
      version: association.version,
      businessPartner: {
        id: association.businessPartner.id,
        companyName: association.businessPartner.companyName,
        email: association.businessPartner.email,
        phone: association.businessPartner.phone,
        status: association.businessPartner.status,
      },
      roles: association.roles.map(({ role }) => role),
      representatives: association.representatives.map((representative) => {
        const contact = representative.businessPartnerContact.contact;
        return {
          id: representative.id,
          version: representative.version,
          businessPartnerContactId: representative.businessPartnerContactId,
          isPrimary: representative.isPrimary,
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            label: contact.label,
            email: contact.email,
            phone: contact.phone,
            mobile: contact.mobile,
            status: contact.status,
            incomplete: contactIsIncomplete(contact),
          },
          roles: representative.roles.map(({ role }) => role),
        };
      }),
    };
  }

  private mapContact(row: ContactRow): ContactRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      firstName: row.firstName,
      lastName: row.lastName,
      label: row.label,
      email: row.email,
      phone: row.phone,
      mobile: row.mobile,
      notes: row.notes,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      incomplete: contactIsIncomplete(row),
      artistLinks: row.artistLinks.map((link) => ({
        id: link.id,
        entityId: link.artistId,
        name: this.artistName(link.artist),
        roles: link.roles.map(({ role }) => role),
      })),
      businessPartnerLinks: row.businessPartnerLinks.map((link) => ({
        id: link.id,
        entityId: link.businessPartnerId,
        name: link.businessPartner.companyName,
        roles: link.roles.map(({ role }) => role),
      })),
    };
  }

  private mapPartner(row: PartnerRow): BusinessPartnerRecord {
    return {
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      roles: row.roles.map(({ role }) => role),
      contacts: row.contacts.map((association) => this.mapAssociation(association)),
    };
  }

  private mapAssociation(association: {
    id: string;
    version: number;
    contact: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      label: string | null;
      email: string | null;
      phone: string | null;
      mobile: string | null;
      status: EntityStatus;
    };
    roles: Array<{ role: RoleReference }>;
  }): ContactAssociation {
    return {
      id: association.id,
      version: association.version,
      contact: {
        id: association.contact.id,
        firstName: association.contact.firstName,
        lastName: association.contact.lastName,
        label: association.contact.label,
        email: association.contact.email,
        phone: association.contact.phone,
        mobile: association.contact.mobile,
        status: association.contact.status,
        incomplete: contactIsIncomplete(association.contact),
      },
      roles: association.roles.map(({ role }) => role),
    };
  }

  private artistName(artist: {
    stageName: string | null;
    firstName: string | null;
    lastName: string | null;
  }): string {
    return artist.stageName ?? [artist.firstName, artist.lastName].filter(Boolean).join(' ');
  }

  private incompleteArtistWhere(): Prisma.ArtistWhereInput {
    return {
      email: null,
      phone: null,
      instagram: null,
      contacts: {
        none: {
          contact: {
            status: 'ACTIVE',
            OR: [{ email: { not: null } }, { phone: { not: null } }, { mobile: { not: null } }],
          },
        },
      },
    };
  }

  private page(query: ListQuery): Pick<PageResult<never>, 'limit' | 'offset'> {
    return { limit: query.limit, offset: query.offset };
  }
}
