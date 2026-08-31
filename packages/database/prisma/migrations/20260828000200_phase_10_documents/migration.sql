CREATE TYPE "DocumentType" AS ENUM ('OFFER', 'PRODUCTION_INFORMATION');
CREATE TYPE "DocumentStatus" AS ENUM ('ENTWURF', 'ERSTELLT', 'UEBERGEBEN', 'ANGENOMMEN', 'ABGELEHNT', 'ABGELAUFEN', 'FREIGEGEBEN', 'ARCHIVIERT');
CREATE TYPE "DocumentPositionSource" AS ENUM ('DEAL_COMPONENT', 'DEAL_SERVICE', 'CUSTOM');

CREATE TABLE "document_template" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "type" "DocumentType" NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "introduction" TEXT,
  "standard_terms" TEXT,
  "closing" TEXT,
  "footer" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "archived_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_template_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_template_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_template_text_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND NULLIF(BTRIM("title"), '') IS NOT NULL),
  CONSTRAINT "document_template_version_valid" CHECK ("version" > 0),
  CONSTRAINT "document_template_archive_consistent" CHECK (("status" = 'ACTIVE' AND "archived_at" IS NULL) OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_template_org_type_name_key" ON "document_template"("organization_id", "type", "normalized_name");
CREATE INDEX "document_template_org_type_status_idx" ON "document_template"("organization_id", "type", "status", "name", "id");

CREATE TABLE "document_template_block" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "heading" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "document_template_block_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_template_block_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_template_block_valid" CHECK (NULLIF(BTRIM("heading"), '') IS NOT NULL AND "sort_order" >= 0)
);
CREATE INDEX "document_template_block_order_idx" ON "document_template_block"("organization_id", "template_id", "sort_order", "id");

CREATE TABLE "document" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "deal_id" UUID,
  "source_template_id" UUID NOT NULL,
  "source_template_version" INTEGER NOT NULL,
  "source_template_name_snapshot" VARCHAR(200) NOT NULL,
  "type" "DocumentType" NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'ENTWURF',
  "document_number" VARCHAR(64) NOT NULL,
  "published_version" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "title" VARCHAR(300) NOT NULL,
  "introduction" TEXT,
  "standard_terms" TEXT,
  "closing" TEXT,
  "footer" TEXT,
  "recipient_name" VARCHAR(200),
  "recipient_contact_name" VARCHAR(200),
  "recipient_email" VARCHAR(320),
  "recipient_address" TEXT,
  "valid_until" DATE,
  "internal_note" TEXT,
  "total_discount_type" "DealDiscountType",
  "total_discount_fixed_minor" BIGINT,
  "total_discount_percentage_basis_points" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "context_snapshot" JSONB NOT NULL,
  "last_published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_number_not_blank" CHECK (NULLIF(BTRIM("document_number"), '') IS NOT NULL),
  CONSTRAINT "document_values_valid" CHECK ("source_template_version" > 0 AND "published_version" >= 0 AND "revision" > 0 AND "currency" = 'EUR' AND NULLIF(BTRIM("title"), '') IS NOT NULL),
  CONSTRAINT "document_discount_consistent" CHECK (
    ("total_discount_type" IS NULL AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'FIXED' AND "total_discount_fixed_minor" >= 0 AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'PERCENTAGE' AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "document_type_status_consistent" CHECK (
    ("type" = 'OFFER' AND "status" IN ('ENTWURF', 'ERSTELLT', 'UEBERGEBEN', 'ANGENOMMEN', 'ABGELEHNT', 'ABGELAUFEN'))
    OR ("type" = 'PRODUCTION_INFORMATION' AND "status" IN ('ENTWURF', 'FREIGEGEBEN', 'ARCHIVIERT'))
  ),
  CONSTRAINT "document_publish_consistent" CHECK (("published_version" = 0 AND "last_published_at" IS NULL) OR ("published_version" > 0 AND "last_published_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_org_number_key" ON "document"("organization_id", "document_number");
CREATE INDEX "document_org_type_status_idx" ON "document"("organization_id", "type", "status", "created_at", "id");
CREATE INDEX "document_org_event_idx" ON "document"("organization_id", "event_id", "created_at", "id");
CREATE INDEX "document_org_location_idx" ON "document"("organization_id", "location_id", "created_at", "id");
CREATE INDEX "document_org_template_idx" ON "document"("organization_id", "source_template_id");
CREATE INDEX "document_org_deal_idx" ON "document"("organization_id", "deal_id");

CREATE TABLE "document_content_block" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "heading" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "document_content_block_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_content_block_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_content_block_valid" CHECK (NULLIF(BTRIM("heading"), '') IS NOT NULL AND "sort_order" >= 0)
);
CREATE INDEX "document_content_block_order_idx" ON "document_content_block"("organization_id", "document_id", "sort_order", "id");

CREATE TABLE "document_offer_position" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "source" "DocumentPositionSource" NOT NULL,
  "source_id" UUID,
  "source_snapshot" JSONB,
  "description" VARCHAR(300) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price_net_minor" BIGINT NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "discount_type" "DealDiscountType",
  "discount_fixed_minor" BIGINT,
  "discount_percentage_basis_points" INTEGER,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "document_offer_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_offer_position_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_offer_position_values_valid" CHECK (NULLIF(BTRIM("description"), '') IS NOT NULL AND "quantity" > 0 AND "unit_price_net_minor" >= 0 AND "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "sort_order" >= 0),
  CONSTRAINT "document_offer_position_source_consistent" CHECK (("source" = 'CUSTOM' AND "source_id" IS NULL AND "source_snapshot" IS NULL) OR ("source" <> 'CUSTOM' AND "source_id" IS NOT NULL AND "source_snapshot" IS NOT NULL)),
  CONSTRAINT "document_offer_position_discount_consistent" CHECK (
    ("discount_type" IS NULL AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" IS NULL)
    OR ("discount_type" = 'FIXED' AND "discount_fixed_minor" >= 0 AND "discount_percentage_basis_points" IS NULL)
    OR ("discount_type" = 'PERCENTAGE' AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" BETWEEN 0 AND 10000)
  )
);
CREATE INDEX "document_offer_position_order_idx" ON "document_offer_position"("organization_id", "document_id", "sort_order", "id");

CREATE TABLE "document_version" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "document_version" INTEGER NOT NULL,
  "document_number" VARCHAR(64) NOT NULL,
  "status" "DocumentStatus" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "pdf_data" BYTEA NOT NULL,
  "pdf_sha256" CHAR(64) NOT NULL,
  "pdf_size" INTEGER NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_by_membership_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "document_version_values_valid" CHECK ("document_version" > 0 AND "pdf_size" > 0 AND "pdf_sha256" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "document_version_number_key" ON "document_version"("organization_id", "document_id", "document_version");
CREATE INDEX "document_version_created_idx" ON "document_version"("organization_id", "document_id", "created_at", "id");
CREATE INDEX "document_version_user_idx" ON "document_version"("created_by_user_id");
CREATE INDEX "document_version_membership_idx" ON "document_version"("created_by_membership_id");

CREATE TABLE "document_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "previous_status" "DocumentStatus" NOT NULL,
  "new_status" "DocumentStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_status_history_tenant_key" UNIQUE ("id", "organization_id")
);
CREATE INDEX "document_status_history_order_idx" ON "document_status_history"("organization_id", "document_id", "changed_at", "id");
CREATE INDEX "document_status_history_user_idx" ON "document_status_history"("actor_user_id");
CREATE INDEX "document_status_history_membership_idx" ON "document_status_history"("actor_membership_id");

ALTER TABLE "document_template" ADD CONSTRAINT "document_template_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_template_block" ADD CONSTRAINT "document_template_block_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_template_block" ADD CONSTRAINT "document_template_block_template_tenant_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "document_template"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_location_tenant_fkey" FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_event_tenant_fkey" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_deal_tenant_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deal"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_template_tenant_fkey" FOREIGN KEY ("source_template_id", "organization_id") REFERENCES "document_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_content_block" ADD CONSTRAINT "document_content_block_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_content_block" ADD CONSTRAINT "document_content_block_document_tenant_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "document"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_offer_position" ADD CONSTRAINT "document_offer_position_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_offer_position" ADD CONSTRAINT "document_offer_position_document_tenant_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "document"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_tenant_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "document"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_user_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_membership_tenant_fkey" FOREIGN KEY ("created_by_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_status_history" ADD CONSTRAINT "document_status_history_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_status_history" ADD CONSTRAINT "document_status_history_document_tenant_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "document"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_status_history" ADD CONSTRAINT "document_status_history_user_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_status_history" ADD CONSTRAINT "document_status_history_membership_tenant_fkey" FOREIGN KEY ("actor_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("key", "description") VALUES
  ('documents.read', 'Dokumente ansehen und herunterladen'),
  ('documents.write', 'Dokumententwürfe anlegen und bearbeiten'),
  ('documents.publish', 'Dokumente erstellen, übergeben und freigeben'),
  ('document_templates.read', 'Dokumentvorlagen ansehen'),
  ('document_templates.write', 'Dokumentvorlagen anlegen und bearbeiten'),
  ('document_templates.archive', 'Dokumentvorlagen archivieren und reaktivieren')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM "role" role
CROSS JOIN "permission" permission
WHERE role."key" IN ('administrator', 'management_finance')
  AND permission."key" IN ('documents.read', 'documents.write', 'documents.publish', 'document_templates.read', 'document_templates.write', 'document_templates.archive')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM "role" role
CROSS JOIN "permission" permission
WHERE role."key" IN ('booking', 'production')
  AND permission."key" IN ('documents.read', 'documents.write', 'documents.publish', 'document_templates.read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM "role" role
CROSS JOIN "permission" permission
WHERE role."key" = 'read_only' AND permission."key" = 'documents.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
