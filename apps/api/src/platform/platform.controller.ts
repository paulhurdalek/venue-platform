import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { createDtoValidationPipe } from '../common/http/dto-validation.pipe.js';
import { CurrentAccess, RequirePermission } from '../security/access.decorator.js';
import { AccessGuard } from '../security/access.guard.js';
import type { AccessContext } from '../security/access.types.js';
import { PERMISSIONS } from '../security/security.constants.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import {
  AcceptInvitationDto,
  AcceptInvitationResultDto,
  AssignLocationScopeDto,
  AssignRolesDto,
  AuditEntryDto,
  AuditQueryDto,
  CreateInvitationDto,
  CreatedInvitationDto,
  InvitationDto,
  InvitationValidationDto,
  LocationDto,
  MembershipDto,
  OrganizationDto,
  RoleDto,
  SessionContextDto,
  TokenQueryDto,
  UpdateLocationDto,
  UpdateMembershipStatusDto,
  UpdateOrganizationDto,
} from './platform.dto.js';
import { PlatformService } from './platform.service.js';

@ApiTags('session')
@Controller({ path: 'session', version: '1' })
export class SessionController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  @ApiOperation({ summary: 'Return the current user and all organization memberships' })
  @ApiOkResponse({ type: SessionContextDto })
  context(@Req() request: Request): Promise<SessionContextDto> {
    return this.platform.sessionContext(request);
  }
}

@ApiTags('organizations')
@ApiExtraModels(AuditQueryDto)
@UseGuards(AccessGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationController {
  constructor(
    @Inject(PlatformService)
    private readonly platform: PlatformService,
    @Inject(RateLimitService)
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [OrganizationDto] })
  list(@Req() request: Request): Promise<OrganizationDto[]> {
    return this.platform.organizations(request);
  }

  @Get(':organizationId')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: OrganizationDto })
  get(@Param('organizationId', ParseUUIDPipe) organizationId: string): Promise<OrganizationDto> {
    return this.platform.organization(organizationId);
  }

  @Patch(':organizationId')
  @RequirePermission(PERMISSIONS.ORGANIZATION_EDIT)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiOkResponse({ type: OrganizationDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(UpdateOrganizationDto)) body: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.platform.updateOrganization(access, body);
  }

  @Get(':organizationId/locations')
  @RequirePermission(PERMISSIONS.LOCATION_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: [LocationDto] })
  locations(@CurrentAccess() access: AccessContext): Promise<LocationDto[]> {
    return this.platform.locations(access);
  }

  @Get(':organizationId/locations/:locationId')
  @RequirePermission(PERMISSIONS.LOCATION_READ, 'locationId')
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'locationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: LocationDto })
  location(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<LocationDto> {
    return this.platform.location(organizationId, locationId);
  }

  @Patch(':organizationId/locations/:locationId')
  @RequirePermission(PERMISSIONS.LOCATION_EDIT, 'locationId')
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'locationId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateLocationDto })
  @ApiOkResponse({ type: LocationDto })
  updateLocation(
    @CurrentAccess() access: AccessContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body(createDtoValidationPipe(UpdateLocationDto)) body: UpdateLocationDto,
  ): Promise<LocationDto> {
    return this.platform.updateLocation(access, locationId, body);
  }

  @Get(':organizationId/members')
  @RequirePermission(PERMISSIONS.MEMBERSHIPS_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: [MembershipDto] })
  members(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<MembershipDto[]> {
    return this.platform.members(organizationId);
  }

  @Patch(':organizationId/members/:membershipId/status')
  @RequirePermission(PERMISSIONS.MEMBERSHIPS_STATUS)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'membershipId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateMembershipStatusDto })
  @ApiOkResponse({ type: MembershipDto })
  updateMembershipStatus(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body(createDtoValidationPipe(UpdateMembershipStatusDto)) body: UpdateMembershipStatusDto,
  ): Promise<MembershipDto> {
    return this.platform.updateMembershipStatus(access, membershipId, body);
  }

  @Put(':organizationId/members/:membershipId/roles')
  @RequirePermission(PERMISSIONS.MEMBERSHIPS_ROLES)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'membershipId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignRolesDto })
  @ApiOkResponse({ type: MembershipDto })
  assignRoles(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body(createDtoValidationPipe(AssignRolesDto)) body: AssignRolesDto,
  ): Promise<MembershipDto> {
    return this.platform.assignRoles(access, membershipId, body);
  }

  @Put(':organizationId/members/:membershipId/location-scope')
  @RequirePermission(PERMISSIONS.MEMBERSHIPS_LOCATION_ACCESS)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'membershipId', type: String, format: 'uuid' })
  @ApiBody({ type: AssignLocationScopeDto })
  @ApiOkResponse({ type: MembershipDto })
  assignLocationScope(
    @CurrentAccess() access: AccessContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body(createDtoValidationPipe(AssignLocationScopeDto)) body: AssignLocationScopeDto,
  ): Promise<MembershipDto> {
    return this.platform.assignLocationScope(access, membershipId, body);
  }

  @Get(':organizationId/roles')
  @RequirePermission(PERMISSIONS.ROLES_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: [RoleDto] })
  roles(@Param('organizationId', ParseUUIDPipe) organizationId: string): Promise<RoleDto[]> {
    return this.platform.roles(organizationId);
  }

  @Get(':organizationId/invitations')
  @RequirePermission(PERMISSIONS.MEMBERSHIPS_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: [InvitationDto] })
  invitations(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<InvitationDto[]> {
    return this.platform.invitations(organizationId);
  }

  @Post(':organizationId/invitations')
  @RequirePermission(PERMISSIONS.INVITATIONS_CREATE)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateInvitationDto })
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  async createInvitation(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateInvitationDto)) body: CreateInvitationDto,
    @Ip() ip: string,
  ): Promise<CreatedInvitationDto> {
    await this.rateLimit.consume('invitation-create', `${access.user.id}:${ip}`);
    return this.platform.createInvitation(access, body);
  }

  @Delete(':organizationId/invitations/:invitationId')
  @RequirePermission(PERMISSIONS.INVITATIONS_REVOKE)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiParam({ name: 'invitationId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: InvitationDto })
  revokeInvitation(
    @CurrentAccess() access: AccessContext,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationDto> {
    return this.platform.revokeInvitation(access, invitationId);
  }

  @Get(':organizationId/audit')
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ type: [AuditEntryDto] })
  audit(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query(createDtoValidationPipe(AuditQueryDto)) query: AuditQueryDto,
  ): Promise<AuditEntryDto[]> {
    return this.platform.auditEntries(organizationId, query.limit);
  }
}

@ApiTags('invitations')
@ApiExtraModels(TokenQueryDto)
@Controller({ path: 'invitations', version: '1' })
export class InvitationAcceptanceController {
  constructor(
    @Inject(PlatformService)
    private readonly platform: PlatformService,
    @Inject(RateLimitService)
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('validate')
  @ApiQuery({ name: 'token', type: String, minLength: 20 })
  @ApiOkResponse({ type: InvitationValidationDto })
  async validate(
    @Query(createDtoValidationPipe(TokenQueryDto)) query: TokenQueryDto,
    @Ip() ip: string,
  ): Promise<InvitationValidationDto> {
    await this.rateLimit.consume('invitation-validate', `${ip}:${query.token}`);
    return this.platform.validateInvitation(query.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: AcceptInvitationDto })
  @ApiOkResponse({ type: AcceptInvitationResultDto })
  async accept(
    @Req() request: Request,
    @Body(createDtoValidationPipe(AcceptInvitationDto)) body: AcceptInvitationDto,
    @Ip() ip: string,
  ): Promise<AcceptInvitationResultDto> {
    await this.rateLimit.consume('invitation-accept', `${ip}:${body.token}`);
    return this.platform.acceptInvitation(request, body);
  }
}
