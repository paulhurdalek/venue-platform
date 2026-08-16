import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { createDtoValidationPipe } from '../../common/http/dto-validation.pipe.js';
import { CurrentAccess, RequirePermission } from '../../security/access.decorator.js';
import { AccessGuard } from '../../security/access.guard.js';
import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import { MasterDataService } from '../application/master-data.service.js';
import {
  ArtistDto,
  ArtistPageDto,
  AssignAssociationRolesDto,
  AssignBusinessPartnerRolesDto,
  BusinessPartnerDto,
  BusinessPartnerPageDto,
  ContactDto,
  ContactPageDto,
  CreateArtistDto,
  CreateBusinessPartnerDto,
  CreateContactAssociationDto,
  CreateContactDto,
  MasterDataListQueryDto,
  MasterDataRoleDto,
  UpdateArtistDto,
  UpdateBusinessPartnerDto,
  UpdateContactDto,
  UpdateEntityStatusDto,
  VersionQueryDto,
} from './master-data.dto.js';

@ApiTags('master data')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId', version: '1' })
export class MasterDataController {
  constructor(
    @Inject(MasterDataService)
    private readonly masterData: MasterDataService,
  ) {}

  @Get('artists')
  @RequirePermission(PERMISSIONS.ARTISTS_READ)
  @ApiMasterDataListQuery()
  @ApiOkResponse({ type: ArtistPageDto })
  listArtists(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(MasterDataListQueryDto)) query: MasterDataListQueryDto,
  ): Promise<ArtistPageDto> {
    return this.masterData.listArtists(access.organizationId, query);
  }

  @Post('artists')
  @RequirePermission(PERMISSIONS.ARTISTS_WRITE)
  @ApiBody({ type: CreateArtistDto })
  @ApiCreatedResponse({ type: ArtistDto })
  createArtist(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateArtistDto)) body: CreateArtistDto,
  ): Promise<ArtistDto> {
    return this.masterData.createArtist(access, body);
  }

  @Get('artists/:artistId')
  @RequirePermission(PERMISSIONS.ARTISTS_READ)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ArtistDto })
  artist(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ): Promise<ArtistDto> {
    return this.masterData.artist(access.organizationId, artistId);
  }

  @Patch('artists/:artistId')
  @RequirePermission(PERMISSIONS.ARTISTS_WRITE)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateArtistDto })
  @ApiOkResponse({ type: ArtistDto })
  updateArtist(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body(createDtoValidationPipe(UpdateArtistDto)) body: UpdateArtistDto,
  ): Promise<ArtistDto> {
    const { version, ...values } = body;
    return this.masterData.updateArtist(access, artistId, version, values);
  }

  @Patch('artists/:artistId/status')
  @RequirePermission(PERMISSIONS.ARTISTS_ARCHIVE)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: ArtistDto })
  setArtistStatus(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ): Promise<ArtistDto> {
    return this.masterData.setArtistStatus(access, artistId, body.version, body.status);
  }

  @Post('artists/:artistId/contacts')
  @RequirePermission(PERMISSIONS.ARTISTS_WRITE)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateContactAssociationDto })
  @ApiCreatedResponse({ type: ArtistDto })
  linkArtistContact(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body(createDtoValidationPipe(CreateContactAssociationDto)) body: CreateContactAssociationDto,
  ): Promise<ArtistDto> {
    return this.masterData.linkArtistContact(access, artistId, body.contactId, body.roleIds);
  }

  @Delete('artists/:artistId/contacts/:associationId')
  @RequirePermission(PERMISSIONS.ARTISTS_WRITE)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiParam({ name: 'associationId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'version', type: Number, minimum: 1 })
  @ApiOkResponse({ type: ArtistDto })
  unlinkArtistContact(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
    @Query(createDtoValidationPipe(VersionQueryDto)) query: VersionQueryDto,
  ): Promise<ArtistDto> {
    return this.masterData.unlinkArtistContact(access, artistId, associationId, query.version);
  }

  @Put('artists/:artistId/contacts/:associationId/roles')
  @RequirePermission(PERMISSIONS.ARTISTS_WRITE)
  @ApiParam({ name: 'artistId', type: String, format: 'uuid' })
  @ApiParam({ name: 'associationId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignAssociationRolesDto })
  @ApiOkResponse({ type: ArtistDto })
  setArtistContactRoles(
    @CurrentAccess() access: AccessContext,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
    @Body(createDtoValidationPipe(AssignAssociationRolesDto)) body: AssignAssociationRolesDto,
  ): Promise<ArtistDto> {
    return this.masterData.setArtistContactRoles(
      access,
      artistId,
      associationId,
      body.version,
      body.roleIds,
    );
  }

  @Get('contacts')
  @RequirePermission(PERMISSIONS.CONTACTS_READ)
  @ApiMasterDataListQuery()
  @ApiOkResponse({ type: ContactPageDto })
  listContacts(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(MasterDataListQueryDto)) query: MasterDataListQueryDto,
  ): Promise<ContactPageDto> {
    return this.masterData.listContacts(access.organizationId, query);
  }

  @Post('contacts')
  @RequirePermission(PERMISSIONS.CONTACTS_WRITE)
  @ApiBody({ type: CreateContactDto })
  @ApiCreatedResponse({ type: ContactDto })
  createContact(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateContactDto)) body: CreateContactDto,
  ): Promise<ContactDto> {
    return this.masterData.createContact(access, body);
  }

  @Get('contacts/:contactId')
  @RequirePermission(PERMISSIONS.CONTACTS_READ)
  @ApiParam({ name: 'contactId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ContactDto })
  contact(
    @CurrentAccess() access: AccessContext,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<ContactDto> {
    return this.masterData.contact(access.organizationId, contactId);
  }

  @Patch('contacts/:contactId')
  @RequirePermission(PERMISSIONS.CONTACTS_WRITE)
  @ApiParam({ name: 'contactId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateContactDto })
  @ApiOkResponse({ type: ContactDto })
  updateContact(
    @CurrentAccess() access: AccessContext,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(createDtoValidationPipe(UpdateContactDto)) body: UpdateContactDto,
  ): Promise<ContactDto> {
    const { version, ...values } = body;
    return this.masterData.updateContact(access, contactId, version, values);
  }

  @Patch('contacts/:contactId/status')
  @RequirePermission(PERMISSIONS.CONTACTS_ARCHIVE)
  @ApiParam({ name: 'contactId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: ContactDto })
  setContactStatus(
    @CurrentAccess() access: AccessContext,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ): Promise<ContactDto> {
    return this.masterData.setContactStatus(access, contactId, body.version, body.status);
  }

  @Get('business-partners')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_READ)
  @ApiMasterDataListQuery()
  @ApiOkResponse({ type: BusinessPartnerPageDto })
  listBusinessPartners(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(MasterDataListQueryDto)) query: MasterDataListQueryDto,
  ): Promise<BusinessPartnerPageDto> {
    return this.masterData.listBusinessPartners(access.organizationId, query);
  }

  @Post('business-partners')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiBody({ type: CreateBusinessPartnerDto })
  @ApiCreatedResponse({ type: BusinessPartnerDto })
  createBusinessPartner(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateBusinessPartnerDto)) body: CreateBusinessPartnerDto,
  ): Promise<BusinessPartnerDto> {
    const { roleIds, ...values } = body;
    return this.masterData.createBusinessPartner(access, values, roleIds);
  }

  @Get('business-partners/:businessPartnerId')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_READ)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: BusinessPartnerDto })
  businessPartner(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.businessPartner(access.organizationId, businessPartnerId);
  }

  @Patch('business-partners/:businessPartnerId')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateBusinessPartnerDto })
  @ApiOkResponse({ type: BusinessPartnerDto })
  updateBusinessPartner(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Body(createDtoValidationPipe(UpdateBusinessPartnerDto)) body: UpdateBusinessPartnerDto,
  ): Promise<BusinessPartnerDto> {
    const { version, ...values } = body;
    return this.masterData.updateBusinessPartner(access, businessPartnerId, version, values);
  }

  @Patch('business-partners/:businessPartnerId/status')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_ARCHIVE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: BusinessPartnerDto })
  setBusinessPartnerStatus(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.setBusinessPartnerStatus(
      access,
      businessPartnerId,
      body.version,
      body.status,
    );
  }

  @Put('business-partners/:businessPartnerId/roles')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignBusinessPartnerRolesDto })
  @ApiOkResponse({ type: BusinessPartnerDto })
  setBusinessPartnerRoles(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Body(createDtoValidationPipe(AssignBusinessPartnerRolesDto))
    body: AssignBusinessPartnerRolesDto,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.setBusinessPartnerRoles(
      access,
      businessPartnerId,
      body.version,
      body.roleIds,
    );
  }

  @Post('business-partners/:businessPartnerId/contacts')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateContactAssociationDto })
  @ApiCreatedResponse({ type: BusinessPartnerDto })
  linkBusinessPartnerContact(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Body(createDtoValidationPipe(CreateContactAssociationDto)) body: CreateContactAssociationDto,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.linkBusinessPartnerContact(
      access,
      businessPartnerId,
      body.contactId,
      body.roleIds,
    );
  }

  @Delete('business-partners/:businessPartnerId/contacts/:associationId')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiParam({ name: 'associationId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'version', type: Number, minimum: 1 })
  @ApiOkResponse({ type: BusinessPartnerDto })
  unlinkBusinessPartnerContact(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
    @Query(createDtoValidationPipe(VersionQueryDto)) query: VersionQueryDto,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.unlinkBusinessPartnerContact(
      access,
      businessPartnerId,
      associationId,
      query.version,
    );
  }

  @Put('business-partners/:businessPartnerId/contacts/:associationId/roles')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_WRITE)
  @ApiParam({ name: 'businessPartnerId', type: String, format: 'uuid' })
  @ApiParam({ name: 'associationId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignAssociationRolesDto })
  @ApiOkResponse({ type: BusinessPartnerDto })
  setBusinessPartnerContactRoles(
    @CurrentAccess() access: AccessContext,
    @Param('businessPartnerId', ParseUUIDPipe) businessPartnerId: string,
    @Param('associationId', ParseUUIDPipe) associationId: string,
    @Body(createDtoValidationPipe(AssignAssociationRolesDto)) body: AssignAssociationRolesDto,
  ): Promise<BusinessPartnerDto> {
    return this.masterData.setBusinessPartnerContactRoles(
      access,
      businessPartnerId,
      associationId,
      body.version,
      body.roleIds,
    );
  }

  @Get('contact-roles')
  @RequirePermission(PERMISSIONS.CONTACTS_READ)
  @ApiOkResponse({ type: [MasterDataRoleDto] })
  contactRoles(): Promise<MasterDataRoleDto[]> {
    return this.masterData.contactRoles();
  }

  @Get('business-partner-roles')
  @RequirePermission(PERMISSIONS.BUSINESS_PARTNERS_READ)
  @ApiOkResponse({ type: [MasterDataRoleDto] })
  businessPartnerRoles(): Promise<MasterDataRoleDto[]> {
    return this.masterData.businessPartnerRoles();
  }
}

function ApiMasterDataListQuery(): MethodDecorator {
  return applyDecorators(
    ApiQuery({ name: 'q', required: false, type: String, maxLength: 200 }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: ['ACTIVE', 'ARCHIVED', 'ALL'],
    }),
    ApiQuery({ name: 'incomplete', required: false, type: Boolean }),
    ApiQuery({ name: 'roleKey', required: false, type: String, maxLength: 80 }),
    ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 }),
    ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 }),
  );
}
