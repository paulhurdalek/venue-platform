CREATE TYPE "ServiceUnit" AS ENUM (
  'PIECE',
  'HOUR',
  'DAY',
  'PERSON',
  'FLAT_RATE',
  'PER_GUEST',
  'PER_TICKET'
);

CREATE TYPE "CalculationStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED');
CREATE TYPE "EventServicePositionSource" AS ENUM ('EVENT_FORMAT', 'SERVICE_CATALOG', 'CUSTOM');
CREATE TYPE "CostStatus" AS ENUM ('PLANNED', 'COMMITTED');

CREATE TABLE "service_category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalized_name" VARCHAR(160) NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_category_name_not_blank" CHECK (btrim("name") <> '' AND btrim("normalized_name") <> ''),
  CONSTRAINT "service_category_version_positive" CHECK ("version" > 0),
  CONSTRAINT "service_category_archive_consistent" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "service_category_id_organization_id_key"
  ON "service_category"("id", "organization_id");
CREATE UNIQUE INDEX "service_category_organization_id_normalized_name_key"
  ON "service_category"("organization_id", "normalized_name");
CREATE INDEX "service_category_tenant_status_name_idx"
  ON "service_category"("organization_id", "status", "name", "id");

ALTER TABLE "service_category" ADD CONSTRAINT "service_category_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "service" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "unit" "ServiceUnit" NOT NULL,
  "default_sales_price_minor" BIGINT,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "internal_note" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_name_not_blank" CHECK (btrim("name") <> '' AND btrim("normalized_name") <> ''),
  CONSTRAINT "service_sales_price_nonnegative" CHECK ("default_sales_price_minor" IS NULL OR "default_sales_price_minor" >= 0),
  CONSTRAINT "service_currency_eur" CHECK ("currency" = 'EUR'),
  CONSTRAINT "service_version_positive" CHECK ("version" > 0),
  CONSTRAINT "service_archive_consistent" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "service_id_organization_id_key" ON "service"("id", "organization_id");
CREATE UNIQUE INDEX "service_organization_id_normalized_name_key"
  ON "service"("organization_id", "normalized_name");
CREATE INDEX "service_tenant_category_status_name_idx"
  ON "service"("organization_id", "category_id", "status", "name", "id");
CREATE INDEX "service_tenant_status_name_idx"
  ON "service"("organization_id", "status", "name", "id");

ALTER TABLE "service" ADD CONSTRAINT "service_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service" ADD CONSTRAINT "service_category_tenant_fkey"
  FOREIGN KEY ("category_id", "organization_id") REFERENCES "service_category"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "service_provider_price" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "business_partner_id" UUID NOT NULL,
  "purchase_price_minor" BIGINT,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  "internal_note" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_provider_price_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_provider_price_purchase_nonnegative" CHECK ("purchase_price_minor" IS NULL OR "purchase_price_minor" >= 0),
  CONSTRAINT "service_provider_price_currency_eur" CHECK ("currency" = 'EUR'),
  CONSTRAINT "service_provider_price_version_positive" CHECK ("version" > 0),
  CONSTRAINT "service_provider_price_archive_consistent" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "service_provider_price_id_organization_id_key"
  ON "service_provider_price"("id", "organization_id");
CREATE UNIQUE INDEX "service_provider_price_active_partner_key"
  ON "service_provider_price"("organization_id", "service_id", "business_partner_id")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "service_provider_price_one_preferred_key"
  ON "service_provider_price"("organization_id", "service_id")
  WHERE "status" = 'ACTIVE' AND "preferred" = true;
CREATE INDEX "service_provider_price_tenant_service_idx"
  ON "service_provider_price"("organization_id", "service_id", "status", "preferred", "id");
CREATE INDEX "service_provider_price_tenant_partner_idx"
  ON "service_provider_price"("organization_id", "business_partner_id", "status");

ALTER TABLE "service_provider_price" ADD CONSTRAINT "service_provider_price_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_provider_price" ADD CONSTRAINT "service_provider_price_service_tenant_fkey"
  FOREIGN KEY ("service_id", "organization_id") REFERENCES "service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_provider_price" ADD CONSTRAINT "service_provider_price_partner_tenant_fkey"
  FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_format_service" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_format_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "provider_business_partner_id" UUID,
  "purchase_price_override_minor" BIGINT,
  "sales_price_override_minor" BIGINT,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_format_service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_format_service_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "event_format_service_purchase_nonnegative" CHECK ("purchase_price_override_minor" IS NULL OR "purchase_price_override_minor" >= 0),
  CONSTRAINT "event_format_service_sales_nonnegative" CHECK ("sales_price_override_minor" IS NULL OR "sales_price_override_minor" >= 0),
  CONSTRAINT "event_format_service_currency_eur" CHECK ("currency" = 'EUR'),
  CONSTRAINT "event_format_service_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "event_format_service_version_positive" CHECK ("version" > 0),
  CONSTRAINT "event_format_service_archive_consistent" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "event_format_service_id_organization_id_key"
  ON "event_format_service"("id", "organization_id");
CREATE UNIQUE INDEX "event_format_service_active_service_key"
  ON "event_format_service"("organization_id", "event_format_id", "service_id")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "event_format_service_active_order_key"
  ON "event_format_service"("organization_id", "event_format_id", "sort_order")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "event_format_service_tenant_format_idx"
  ON "event_format_service"("organization_id", "event_format_id", "status", "sort_order", "id");
CREATE INDEX "event_format_service_tenant_service_idx"
  ON "event_format_service"("organization_id", "service_id", "status");
CREATE INDEX "event_format_service_tenant_provider_idx"
  ON "event_format_service"("organization_id", "provider_business_partner_id");

ALTER TABLE "event_format_service" ADD CONSTRAINT "event_format_service_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_format_service" ADD CONSTRAINT "event_format_service_format_tenant_fkey"
  FOREIGN KEY ("event_format_id", "organization_id") REFERENCES "event_format"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_format_service" ADD CONSTRAINT "event_format_service_service_tenant_fkey"
  FOREIGN KEY ("service_id", "organization_id") REFERENCES "service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_format_service" ADD CONSTRAINT "event_format_service_provider_tenant_fkey"
  FOREIGN KEY ("provider_business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_calculation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "status" "CalculationStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "approved_at" TIMESTAMP(3),
  "approved_by_user_id" UUID,
  "approved_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_calculation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_calculation_version_positive" CHECK ("version" > 0),
  CONSTRAINT "event_calculation_approval_consistent" CHECK (
    ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "approved_by_user_id" IS NOT NULL AND "approved_by_membership_id" IS NOT NULL)
    OR ("status" <> 'APPROVED' AND "approved_at" IS NULL AND "approved_by_user_id" IS NULL AND "approved_by_membership_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "event_calculation_event_id_key" ON "event_calculation"("event_id");
CREATE UNIQUE INDEX "event_calculation_id_organization_id_key"
  ON "event_calculation"("id", "organization_id");
CREATE UNIQUE INDEX "event_calculation_id_tenant_event_key"
  ON "event_calculation"("id", "organization_id", "event_id");
CREATE UNIQUE INDEX "event_calculation_event_id_organization_id_key"
  ON "event_calculation"("event_id", "organization_id");
CREATE INDEX "event_calculation_tenant_event_status_idx"
  ON "event_calculation"("organization_id", "event_id", "status");
CREATE INDEX "event_calculation_approver_user_idx" ON "event_calculation"("approved_by_user_id");
CREATE INDEX "event_calculation_approver_membership_idx" ON "event_calculation"("approved_by_membership_id");

ALTER TABLE "event_calculation" ADD CONSTRAINT "event_calculation_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation" ADD CONSTRAINT "event_calculation_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation" ADD CONSTRAINT "event_calculation_approver_user_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation" ADD CONSTRAINT "event_calculation_approver_membership_tenant_fkey"
  FOREIGN KEY ("approved_by_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_calculation_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "calculation_id" UUID NOT NULL,
  "previous_status" "CalculationStatus" NOT NULL,
  "new_status" "CalculationStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "note" TEXT,
  "reason" VARCHAR(200),
  "changed_source_type" VARCHAR(80),
  "changed_source_id" UUID,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_calculation_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_calculation_status_history_changed" CHECK ("previous_status" <> "new_status")
);

CREATE UNIQUE INDEX "event_calculation_status_history_id_organization_id_key"
  ON "event_calculation_status_history"("id", "organization_id");
CREATE INDEX "event_calculation_status_history_calculation_idx"
  ON "event_calculation_status_history"("organization_id", "calculation_id", "changed_at", "id");
CREATE INDEX "event_calculation_status_history_actor_user_idx"
  ON "event_calculation_status_history"("actor_user_id");
CREATE INDEX "event_calculation_status_history_actor_membership_idx"
  ON "event_calculation_status_history"("actor_membership_id");

ALTER TABLE "event_calculation_status_history" ADD CONSTRAINT "event_calculation_status_history_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation_status_history" ADD CONSTRAINT "event_calculation_status_history_calculation_tenant_fkey"
  FOREIGN KEY ("calculation_id", "organization_id") REFERENCES "event_calculation"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation_status_history" ADD CONSTRAINT "event_calculation_status_history_actor_user_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_calculation_status_history" ADD CONSTRAINT "event_calculation_status_history_actor_membership_tenant_fkey"
  FOREIGN KEY ("actor_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_service_position" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "calculation_id" UUID NOT NULL,
  "source" "EventServicePositionSource" NOT NULL,
  "source_service_id" UUID,
  "source_service_version" INTEGER,
  "source_event_format_service_id" UUID,
  "source_event_format_service_version" INTEGER,
  "name_snapshot" VARCHAR(200) NOT NULL,
  "category_name_snapshot" VARCHAR(160) NOT NULL,
  "unit" "ServiceUnit" NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "provider_business_partner_id" UUID,
  "provider_name_snapshot" VARCHAR(200),
  "purchase_unit_price_minor" BIGINT,
  "sales_unit_price_minor" BIGINT,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "cost_status" "CostStatus" NOT NULL DEFAULT 'PLANNED',
  "sort_order" INTEGER NOT NULL,
  "note" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_service_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_service_position_source_consistent" CHECK (
    ("source" = 'CUSTOM' AND "source_service_id" IS NULL AND "source_service_version" IS NULL AND "source_event_format_service_id" IS NULL AND "source_event_format_service_version" IS NULL)
    OR ("source" = 'SERVICE_CATALOG' AND "source_service_id" IS NOT NULL AND "source_service_version" IS NOT NULL AND "source_event_format_service_id" IS NULL AND "source_event_format_service_version" IS NULL)
    OR ("source" = 'EVENT_FORMAT' AND "source_service_id" IS NOT NULL AND "source_service_version" IS NOT NULL AND "source_event_format_service_id" IS NOT NULL AND "source_event_format_service_version" IS NOT NULL)
  ),
  CONSTRAINT "event_service_position_source_versions_positive" CHECK (
    ("source_service_version" IS NULL OR "source_service_version" > 0)
    AND ("source_event_format_service_version" IS NULL OR "source_event_format_service_version" > 0)
  ),
  CONSTRAINT "event_service_position_names_not_blank" CHECK (btrim("name_snapshot") <> '' AND btrim("category_name_snapshot") <> ''),
  CONSTRAINT "event_service_position_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "event_service_position_provider_consistent" CHECK (("provider_business_partner_id" IS NULL) = ("provider_name_snapshot" IS NULL)),
  CONSTRAINT "event_service_position_purchase_nonnegative" CHECK ("purchase_unit_price_minor" IS NULL OR "purchase_unit_price_minor" >= 0),
  CONSTRAINT "event_service_position_sales_nonnegative" CHECK ("sales_unit_price_minor" IS NULL OR "sales_unit_price_minor" >= 0),
  CONSTRAINT "event_service_position_currency_eur" CHECK ("currency" = 'EUR'),
  CONSTRAINT "event_service_position_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "event_service_position_version_positive" CHECK ("version" > 0),
  CONSTRAINT "event_service_position_archive_consistent" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "event_service_position_id_organization_id_key"
  ON "event_service_position"("id", "organization_id");
CREATE INDEX "event_service_position_tenant_event_idx"
  ON "event_service_position"("organization_id", "event_id", "status", "sort_order", "id");
CREATE INDEX "event_service_position_tenant_calculation_idx"
  ON "event_service_position"("organization_id", "calculation_id", "status", "sort_order", "id");
CREATE INDEX "event_service_position_tenant_service_idx"
  ON "event_service_position"("organization_id", "source_service_id");
CREATE INDEX "event_service_position_tenant_format_service_idx"
  ON "event_service_position"("organization_id", "source_event_format_service_id");
CREATE INDEX "event_service_position_tenant_provider_idx"
  ON "event_service_position"("organization_id", "provider_business_partner_id");

ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_calculation_tenant_event_fkey"
  FOREIGN KEY ("calculation_id", "organization_id", "event_id") REFERENCES "event_calculation"("id", "organization_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_service_tenant_fkey"
  FOREIGN KEY ("source_service_id", "organization_id") REFERENCES "service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_format_service_tenant_fkey"
  FOREIGN KEY ("source_event_format_service_id", "organization_id") REFERENCES "event_format_service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_position" ADD CONSTRAINT "event_service_position_provider_tenant_fkey"
  FOREIGN KEY ("provider_business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "event_calculation" ("organization_id", "event_id", "created_at", "updated_at")
SELECT "organization_id", "id", "created_at", CURRENT_TIMESTAMP
FROM "event"
ON CONFLICT ("event_id") DO NOTHING;

INSERT INTO "permission" ("key", "description") VALUES
  ('services.read', 'Leistungskategorien und Leistungskatalog ansehen'),
  ('services.write', 'Leistungskategorien, Leistungen und Dienstleisterpreise bearbeiten'),
  ('services.archive', 'Leistungskategorien, Leistungen und Dienstleisterpreise archivieren oder reaktivieren'),
  ('calculations.read', 'Kalkulationsstruktur und nichtfinanzielle Angaben ansehen'),
  ('calculations.write', 'Veranstaltungspositionen und Kalkulationsstatus bearbeiten'),
  ('calculations.purchase', 'Einkaufspreise und Kosten ansehen und bearbeiten'),
  ('calculations.sales', 'Verkaufspreise und Marge ansehen und bearbeiten'),
  ('calculations.approve', 'Veranstaltungskalkulationen freigeben')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'services.read'),
    ('administrator', 'services.write'),
    ('administrator', 'services.archive'),
    ('administrator', 'calculations.read'),
    ('administrator', 'calculations.write'),
    ('administrator', 'calculations.purchase'),
    ('administrator', 'calculations.sales'),
    ('administrator', 'calculations.approve'),
    ('management_finance', 'services.read'),
    ('management_finance', 'services.write'),
    ('management_finance', 'services.archive'),
    ('management_finance', 'calculations.read'),
    ('management_finance', 'calculations.write'),
    ('management_finance', 'calculations.purchase'),
    ('management_finance', 'calculations.sales'),
    ('management_finance', 'calculations.approve'),
    ('booking', 'services.read'),
    ('production', 'services.read'),
    ('production', 'calculations.read'),
    ('read_only', 'services.read'),
    ('read_only', 'calculations.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
