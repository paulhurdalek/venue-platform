import { Module } from '@nestjs/common';

import { DealsModule } from '../deals/deals.module.js';
import { DocumentService } from './application/document.service.js';
import {
  DocumentController,
  DocumentTemplateController,
  EventDocumentController,
} from './presentation/document.controller.js';

@Module({
  imports: [DealsModule],
  controllers: [EventDocumentController, DocumentController, DocumentTemplateController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentsModule {}
