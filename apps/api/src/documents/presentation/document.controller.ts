import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentAccess, RequirePermission } from '../../security/access.decorator.js';
import { AccessGuard } from '../../security/access.guard.js';
import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import { createDtoValidationPipe } from '../../common/http/dto-validation.pipe.js';
import { DocumentService } from '../application/document.service.js';
import {
  CreateDocumentDto,
  DocumentRevisionDto,
  DocumentDto,
  DocumentTemplateDto,
  DocumentTemplateInputDto,
  ListDocumentsQueryDto,
  ListDocumentTemplatesQueryDto,
  PublishDocumentDto,
  SetDocumentStatusDto,
  SetDocumentTemplateStatusDto,
  UpdateDocumentDto,
  UpdateDocumentTemplateDto,
} from './document.dto.js';

@ApiTags('documents')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'eventId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events/:eventId/documents', version: '1' })
export class EventDocumentController {
  constructor(@Inject(DocumentService) private readonly documents: DocumentService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DOCUMENTS_READ)
  @ApiOkResponse({ type: [DocumentDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<DocumentDto[]> {
    return this.documents.listForEvent(access, eventId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiBody({ type: CreateDocumentDto })
  @ApiCreatedResponse({ type: DocumentDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(CreateDocumentDto)) body: CreateDocumentDto,
  ): Promise<DocumentDto> {
    return this.documents.create(access, eventId, body);
  }
}

@ApiTags('documents')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/documents', version: '1' })
export class DocumentController {
  constructor(@Inject(DocumentService) private readonly documents: DocumentService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DOCUMENTS_READ)
  @ApiQuery({ name: 'type', required: false, enum: ['OFFER', 'PRODUCTION_INFORMATION'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'ENTWURF',
      'ERSTELLT',
      'UEBERGEBEN',
      'ANGENOMMEN',
      'ABGELEHNT',
      'ABGELAUFEN',
      'FREIGEGEBEN',
      'ARCHIVIERT',
    ],
  })
  @ApiQuery({ name: 'eventId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date' })
  @ApiOkResponse({ type: [DocumentDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(ListDocumentsQueryDto)) query: ListDocumentsQueryDto,
  ): Promise<DocumentDto[]> {
    return this.documents.list(access, query);
  }

  @Get(':documentId')
  @RequirePermission(PERMISSIONS.DOCUMENTS_READ)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: DocumentDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentDto> {
    return this.documents.find(access, documentId);
  }

  @Patch(':documentId')
  @RequirePermission(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiOkResponse({ type: DocumentDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(UpdateDocumentDto)) body: UpdateDocumentDto,
  ): Promise<DocumentDto> {
    return this.documents.update(access, documentId, body);
  }

  @Patch(':documentId/status')
  @RequirePermission(PERMISSIONS.DOCUMENTS_PUBLISH)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: SetDocumentStatusDto })
  @ApiOkResponse({ type: DocumentDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(SetDocumentStatusDto)) body: SetDocumentStatusDto,
  ): Promise<DocumentDto> {
    return this.documents.setStatus(access, documentId, body.revision, body.status);
  }

  @Post(':documentId/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.DOCUMENTS_READ)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Nicht persistierte PDF-Vorschau' })
  async preview(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.documents.preview(access, documentId);
    this.sendPdf(response, file.pdf, file.filename, 'inline');
  }

  @Post(':documentId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.DOCUMENTS_PUBLISH)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: PublishDocumentDto })
  @ApiOkResponse({ type: DocumentDto })
  publish(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(PublishDocumentDto)) body: PublishDocumentDto,
  ): Promise<DocumentDto> {
    return this.documents.publish(access, documentId, body.revision);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.DOCUMENTS_WRITE)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: DocumentRevisionDto })
  async deleteDraft(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(DocumentRevisionDto)) body: DocumentRevisionDto,
  ): Promise<void> {
    await this.documents.deleteDraft(access, documentId, body.revision);
  }

  @Post(':documentId/archive')
  @RequirePermission(PERMISSIONS.DOCUMENTS_PUBLISH)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: DocumentRevisionDto })
  @ApiOkResponse({ type: DocumentDto })
  archive(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(DocumentRevisionDto)) body: DocumentRevisionDto,
  ): Promise<DocumentDto> {
    return this.documents.archive(access, documentId, body.revision);
  }

  @Post(':documentId/restore')
  @RequirePermission(PERMISSIONS.DOCUMENTS_PUBLISH)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiBody({ type: DocumentRevisionDto })
  @ApiOkResponse({ type: DocumentDto })
  restore(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(createDtoValidationPipe(DocumentRevisionDto)) body: DocumentRevisionDto,
  ): Promise<DocumentDto> {
    return this.documents.restore(access, documentId, body.revision);
  }

  @Get(':documentId/versions/:versionId/pdf')
  @RequirePermission(PERMISSIONS.DOCUMENTS_READ)
  @ApiParam({ name: 'documentId', type: String, format: 'uuid' })
  @ApiParam({ name: 'versionId', type: String, format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Archivierte PDF-Dokumentversion' })
  async download(
    @CurrentAccess() access: AccessContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.documents.downloadVersion(access, documentId, versionId);
    response.setHeader('ETag', `"${file.sha256}"`);
    this.sendPdf(response, file.pdf, file.filename, 'attachment');
  }

  private sendPdf(
    response: Response,
    pdf: Buffer,
    filename: string,
    disposition: 'inline' | 'attachment',
  ): void {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', pdf.length.toString());
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    );
    response.send(pdf);
  }
}

@ApiTags('document-templates')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/document-templates', version: '1' })
export class DocumentTemplateController {
  constructor(@Inject(DocumentService) private readonly documents: DocumentService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DOCUMENT_TEMPLATES_READ)
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiQuery({ name: 'type', required: false, enum: ['OFFER', 'PRODUCTION_INFORMATION'] })
  @ApiOkResponse({ type: [DocumentTemplateDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(ListDocumentTemplatesQueryDto))
    query: ListDocumentTemplatesQueryDto,
  ): Promise<DocumentTemplateDto[]> {
    return this.documents.listTemplates(access, query.status ?? 'ACTIVE', query.type);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DOCUMENT_TEMPLATES_WRITE)
  @ApiBody({ type: DocumentTemplateInputDto })
  @ApiCreatedResponse({ type: DocumentTemplateDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(DocumentTemplateInputDto)) body: DocumentTemplateInputDto,
  ): Promise<DocumentTemplateDto> {
    return this.documents.createTemplate(access, body);
  }

  @Get(':templateId')
  @RequirePermission(PERMISSIONS.DOCUMENT_TEMPLATES_READ)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: DocumentTemplateDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<DocumentTemplateDto> {
    return this.documents.findTemplate(access, templateId);
  }

  @Patch(':templateId')
  @RequirePermission(PERMISSIONS.DOCUMENT_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDocumentTemplateDto })
  @ApiOkResponse({ type: DocumentTemplateDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(createDtoValidationPipe(UpdateDocumentTemplateDto)) body: UpdateDocumentTemplateDto,
  ): Promise<DocumentTemplateDto> {
    const { version, ...input } = body;
    return this.documents.updateTemplate(access, templateId, version, input);
  }

  @Patch(':templateId/status')
  @RequirePermission(PERMISSIONS.DOCUMENT_TEMPLATES_ARCHIVE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: SetDocumentTemplateStatusDto })
  @ApiOkResponse({ type: DocumentTemplateDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(createDtoValidationPipe(SetDocumentTemplateStatusDto)) body: SetDocumentTemplateStatusDto,
  ): Promise<DocumentTemplateDto> {
    return this.documents.setTemplateStatus(access, templateId, body.version, body.status);
  }
}
