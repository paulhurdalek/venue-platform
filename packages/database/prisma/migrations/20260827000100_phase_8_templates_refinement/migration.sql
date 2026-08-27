-- Phase 8 refinement: organization-wide tax, ticket-provider and calculation templates.
-- Existing event calculations remain independent snapshots. Templates are archived, never deleted.

ALTER TABLE "event_format" ADD COLUMN "default_calculation_template_id" UUID;

ALTER TABLE "event"
  ADD COLUMN "source_calculation_template_id" UUID,
  ADD COLUMN "source_calculation_template_version" INTEGER,
  ADD COLUMN "calculation_template_name_snapshot" VARCHAR(200);

ALTER TABLE "ticket_price_tier"
  ADD COLUMN "base_tax_rate_template_id" UUID,
  ADD COLUMN "base_tax_rate_template_version" INTEGER,
  ADD COLUMN "base_tax_rate_name_snapshot" VARCHAR(160),
  ADD COLUMN "source_ticket_provider_template_id" UUID,
  ADD COLUMN "source_ticket_provider_template_version" INTEGER,
  ADD COLUMN "source_ticket_provider_name_snapshot" VARCHAR(200);

ALTER TABLE "ticket_price_component"
  ADD COLUMN "tax_rate_template_id" UUID,
  ADD COLUMN "tax_rate_template_version" INTEGER,
  ADD COLUMN "tax_rate_name_snapshot" VARCHAR(160);

ALTER TABLE "additional_revenue"
  ADD COLUMN "tax_rate_template_id" UUID,
  ADD COLUMN "tax_rate_template_version" INTEGER,
  ADD COLUMN "tax_rate_name_snapshot" VARCHAR(160);

CREATE TABLE "tax_rate_template" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "normalized_name" VARCHAR(160) NOT NULL,
  "rate_basis_points" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_rate_template_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rate_template_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "tax_rate_template_name_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "tax_rate_template_values_valid" CHECK ("rate_basis_points" BETWEEN 0 AND 100000 AND "version" > 0)
);
CREATE UNIQUE INDEX "tax_rate_template_name_key" ON "tax_rate_template"("organization_id", "normalized_name");
CREATE INDEX "tax_rate_template_status_idx" ON "tax_rate_template"("organization_id", "status", "name", "id");

CREATE TABLE "ticket_provider_template" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_provider_template_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_provider_template_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_provider_template_name_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND "version" > 0)
);
CREATE UNIQUE INDEX "ticket_provider_template_name_key" ON "ticket_provider_template"("organization_id", "normalized_name");
CREATE INDEX "ticket_provider_template_status_idx" ON "ticket_provider_template"("organization_id", "status", "name", "id");

CREATE TABLE "ticket_provider_template_component" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_provider_template_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "amount_type" "RevenueAmountType" NOT NULL,
  "percentage_basis" "TicketPercentageBasis",
  "percentage_rate_basis_points" INTEGER,
  "input_type" "PriceInputType" NOT NULL,
  "input_amount_minor" BIGINT,
  "tax_rate_template_id" UUID NOT NULL,
  "tax_rate_template_version" INTEGER NOT NULL,
  "tax_rate_name_snapshot" VARCHAR(160) NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "guest_pays" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_provider_template_component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_provider_template_component_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_provider_template_component_value_consistent" CHECK (
    ("amount_type" = 'FIXED' AND "input_amount_minor" IS NOT NULL AND "input_amount_minor" >= 0 AND "percentage_rate_basis_points" IS NULL AND "percentage_basis" IS NULL)
    OR ("amount_type" = 'PERCENTAGE' AND "input_amount_minor" IS NULL AND "percentage_rate_basis_points" BETWEEN 0 AND 100000 AND "percentage_basis" = 'TICKET_BASE_GROSS')
  ),
  CONSTRAINT "ticket_provider_template_component_values_valid" CHECK (
    NULLIF(BTRIM("name"), '') IS NOT NULL AND "tax_rate_basis_points" BETWEEN 0 AND 100000
    AND "tax_rate_template_version" > 0 AND "sort_order" >= 0 AND "version" > 0
  )
);
CREATE INDEX "ticket_provider_template_component_parent_idx" ON "ticket_provider_template_component"("organization_id", "ticket_provider_template_id", "status", "sort_order", "id");
CREATE INDEX "ticket_provider_template_component_tax_idx" ON "ticket_provider_template_component"("organization_id", "tax_rate_template_id");

CREATE TABLE "ticket_provider_template_allocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_provider_template_component_id" UUID NOT NULL,
  "recipient_type" "RevenueRecipientType" NOT NULL,
  "artist_id" UUID,
  "business_partner_id" UUID,
  "external_recipient_name" VARCHAR(160),
  "allocation_type" "RevenueAllocationType" NOT NULL,
  "percentage_basis_points" INTEGER,
  "fixed_amount_minor" BIGINT,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_provider_template_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_provider_template_allocation_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_provider_template_allocation_recipient_consistent" CHECK (
    ("recipient_type" = 'ORGANIZATION' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'ARTIST' AND "artist_id" IS NOT NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'BUSINESS_PARTNER' AND "artist_id" IS NULL AND "business_partner_id" IS NOT NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'EXTERNAL' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND NULLIF(BTRIM("external_recipient_name"), '') IS NOT NULL)
  ),
  CONSTRAINT "ticket_provider_template_allocation_value_consistent" CHECK (
    ("allocation_type" = 'FIXED' AND "fixed_amount_minor" IS NOT NULL AND "fixed_amount_minor" >= 0 AND "percentage_basis_points" IS NULL)
    OR ("allocation_type" = 'PERCENTAGE' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "ticket_provider_template_allocation_values_valid" CHECK ("sort_order" >= 0 AND "version" > 0)
);
CREATE INDEX "ticket_provider_template_allocation_parent_idx" ON "ticket_provider_template_allocation"("organization_id", "ticket_provider_template_component_id", "status", "sort_order", "id");
CREATE INDEX "ticket_provider_template_allocation_artist_idx" ON "ticket_provider_template_allocation"("organization_id", "artist_id");
CREATE INDEX "ticket_provider_template_allocation_partner_idx" ON "ticket_provider_template_allocation"("organization_id", "business_partner_id");

CREATE TABLE "calculation_template" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "expected_guest_count" INTEGER,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_template_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_template_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "calculation_template_values_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND ("expected_guest_count" IS NULL OR "expected_guest_count" >= 0) AND "version" > 0)
);
CREATE UNIQUE INDEX "calculation_template_name_key" ON "calculation_template"("organization_id", "normalized_name");
CREATE INDEX "calculation_template_status_idx" ON "calculation_template"("organization_id", "status", "name", "id");

CREATE TABLE "calculation_template_tier" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "calculation_template_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "expected_quantity" INTEGER NOT NULL DEFAULT 0,
  "base_input_type" "PriceInputType",
  "base_input_minor" BIGINT,
  "base_net_unit_minor" BIGINT,
  "base_gross_unit_minor" BIGINT,
  "base_tax_rate_template_id" UUID,
  "base_tax_rate_template_version" INTEGER,
  "base_tax_rate_name_snapshot" VARCHAR(160),
  "base_tax_rate_basis_points" INTEGER,
  "source_ticket_provider_template_id" UUID,
  "source_ticket_provider_template_version" INTEGER,
  "source_ticket_provider_name_snapshot" VARCHAR(200),
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_template_tier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_template_tier_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "calculation_template_tier_base_consistent" CHECK (
    ("base_input_type" IS NULL AND "base_input_minor" IS NULL AND "base_net_unit_minor" IS NULL AND "base_gross_unit_minor" IS NULL AND "base_tax_rate_basis_points" IS NULL AND "base_tax_rate_template_id" IS NULL AND "base_tax_rate_template_version" IS NULL AND "base_tax_rate_name_snapshot" IS NULL)
    OR ("base_input_type" IS NOT NULL AND "base_input_minor" IS NOT NULL AND "base_input_minor" >= 0 AND "base_net_unit_minor" IS NOT NULL AND "base_gross_unit_minor" IS NOT NULL AND "base_tax_rate_basis_points" BETWEEN 0 AND 100000 AND "base_tax_rate_template_id" IS NOT NULL AND "base_tax_rate_template_version" > 0 AND NULLIF(BTRIM("base_tax_rate_name_snapshot"), '') IS NOT NULL)
  ),
  CONSTRAINT "calculation_template_tier_source_consistent" CHECK (
    ("source_ticket_provider_template_id" IS NULL AND "source_ticket_provider_template_version" IS NULL AND "source_ticket_provider_name_snapshot" IS NULL)
    OR ("source_ticket_provider_template_id" IS NOT NULL AND "source_ticket_provider_template_version" > 0 AND NULLIF(BTRIM("source_ticket_provider_name_snapshot"), '') IS NOT NULL)
  ),
  CONSTRAINT "calculation_template_tier_values_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND "expected_quantity" >= 0 AND "sort_order" >= 0 AND "version" > 0)
);
CREATE INDEX "calculation_template_tier_parent_idx" ON "calculation_template_tier"("organization_id", "calculation_template_id", "status", "sort_order", "id");
CREATE INDEX "calculation_template_tier_tax_idx" ON "calculation_template_tier"("organization_id", "base_tax_rate_template_id");
CREATE INDEX "calculation_template_tier_provider_idx" ON "calculation_template_tier"("organization_id", "source_ticket_provider_template_id");

CREATE TABLE "calculation_template_component" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "calculation_template_tier_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "amount_type" "RevenueAmountType" NOT NULL,
  "percentage_basis" "TicketPercentageBasis",
  "percentage_rate_basis_points" INTEGER,
  "input_type" "PriceInputType" NOT NULL,
  "input_amount_minor" BIGINT,
  "tax_rate_template_id" UUID NOT NULL,
  "tax_rate_template_version" INTEGER NOT NULL,
  "tax_rate_name_snapshot" VARCHAR(160) NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "guest_pays" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_template_component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_template_component_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "calculation_template_component_value_consistent" CHECK (
    ("amount_type" = 'FIXED' AND "input_amount_minor" IS NOT NULL AND "input_amount_minor" >= 0 AND "percentage_rate_basis_points" IS NULL AND "percentage_basis" IS NULL)
    OR ("amount_type" = 'PERCENTAGE' AND "input_amount_minor" IS NULL AND "percentage_rate_basis_points" BETWEEN 0 AND 100000 AND "percentage_basis" = 'TICKET_BASE_GROSS')
  ),
  CONSTRAINT "calculation_template_component_values_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "tax_rate_template_version" > 0 AND "sort_order" >= 0 AND "version" > 0)
);
CREATE INDEX "calculation_template_component_parent_idx" ON "calculation_template_component"("organization_id", "calculation_template_tier_id", "status", "sort_order", "id");
CREATE INDEX "calculation_template_component_tax_idx" ON "calculation_template_component"("organization_id", "tax_rate_template_id");

CREATE TABLE "calculation_template_allocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "calculation_template_component_id" UUID NOT NULL,
  "recipient_type" "RevenueRecipientType" NOT NULL,
  "artist_id" UUID,
  "business_partner_id" UUID,
  "external_recipient_name" VARCHAR(160),
  "allocation_type" "RevenueAllocationType" NOT NULL,
  "percentage_basis_points" INTEGER,
  "fixed_amount_minor" BIGINT,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_template_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_template_allocation_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "calculation_template_allocation_recipient_consistent" CHECK (
    ("recipient_type" = 'ORGANIZATION' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'ARTIST' AND "artist_id" IS NOT NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'BUSINESS_PARTNER' AND "artist_id" IS NULL AND "business_partner_id" IS NOT NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'EXTERNAL' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND NULLIF(BTRIM("external_recipient_name"), '') IS NOT NULL)
  ),
  CONSTRAINT "calculation_template_allocation_value_consistent" CHECK (
    ("allocation_type" = 'FIXED' AND "fixed_amount_minor" IS NOT NULL AND "fixed_amount_minor" >= 0 AND "percentage_basis_points" IS NULL)
    OR ("allocation_type" = 'PERCENTAGE' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "calculation_template_allocation_values_valid" CHECK ("sort_order" >= 0 AND "version" > 0)
);
CREATE INDEX "calculation_template_allocation_parent_idx" ON "calculation_template_allocation"("organization_id", "calculation_template_component_id", "status", "sort_order", "id");
CREATE INDEX "calculation_template_allocation_artist_idx" ON "calculation_template_allocation"("organization_id", "artist_id");
CREATE INDEX "calculation_template_allocation_partner_idx" ON "calculation_template_allocation"("organization_id", "business_partner_id");

CREATE TABLE "calculation_template_additional_revenue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "calculation_template_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "calculation_type" "AdditionalRevenueCalculationType" NOT NULL,
  "input_type" "PriceInputType" NOT NULL,
  "input_amount_minor" BIGINT,
  "percentage_rate_basis_points" INTEGER,
  "tax_rate_template_id" UUID NOT NULL,
  "tax_rate_template_version" INTEGER NOT NULL,
  "tax_rate_name_snapshot" VARCHAR(160) NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "confirmation_status" "RevenueConfirmationStatus" NOT NULL DEFAULT 'PLANNED',
  "note" TEXT,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calculation_template_additional_revenue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calculation_template_additional_revenue_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "calculation_template_additional_revenue_value_consistent" CHECK (
    ("calculation_type" = 'PERCENT_TICKET_BASE_NET' AND "input_amount_minor" IS NULL AND "percentage_rate_basis_points" IS NOT NULL)
    OR ("calculation_type" <> 'PERCENT_TICKET_BASE_NET' AND "input_amount_minor" IS NOT NULL AND "percentage_rate_basis_points" IS NULL)
  ),
  CONSTRAINT "calculation_template_additional_revenue_values_valid" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL AND ("input_amount_minor" IS NULL OR "input_amount_minor" >= 0) AND ("percentage_rate_basis_points" IS NULL OR "percentage_rate_basis_points" BETWEEN 0 AND 100000) AND "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "tax_rate_template_version" > 0 AND "sort_order" >= 0 AND "version" > 0)
);
CREATE INDEX "calculation_template_additional_revenue_parent_idx" ON "calculation_template_additional_revenue"("organization_id", "calculation_template_id", "status", "sort_order", "id");
CREATE INDEX "calculation_template_additional_revenue_tax_idx" ON "calculation_template_additional_revenue"("organization_id", "tax_rate_template_id");

ALTER TABLE "tax_rate_template" ADD CONSTRAINT "tax_rate_template_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template" ADD CONSTRAINT "ticket_provider_template_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_component" ADD CONSTRAINT "ticket_provider_template_component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_component" ADD CONSTRAINT "ticket_provider_template_component_parent_fkey" FOREIGN KEY ("ticket_provider_template_id", "organization_id") REFERENCES "ticket_provider_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_component" ADD CONSTRAINT "ticket_provider_template_component_tax_fkey" FOREIGN KEY ("tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_allocation" ADD CONSTRAINT "ticket_provider_template_allocation_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_allocation" ADD CONSTRAINT "ticket_provider_template_allocation_parent_fkey" FOREIGN KEY ("ticket_provider_template_component_id", "organization_id") REFERENCES "ticket_provider_template_component"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_allocation" ADD CONSTRAINT "ticket_provider_template_allocation_artist_fkey" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artist"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_provider_template_allocation" ADD CONSTRAINT "ticket_provider_template_allocation_partner_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calculation_template" ADD CONSTRAINT "calculation_template_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_tier" ADD CONSTRAINT "calculation_template_tier_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_tier" ADD CONSTRAINT "calculation_template_tier_parent_fkey" FOREIGN KEY ("calculation_template_id", "organization_id") REFERENCES "calculation_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_tier" ADD CONSTRAINT "calculation_template_tier_tax_fkey" FOREIGN KEY ("base_tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_tier" ADD CONSTRAINT "calculation_template_tier_provider_fkey" FOREIGN KEY ("source_ticket_provider_template_id", "organization_id") REFERENCES "ticket_provider_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_component" ADD CONSTRAINT "calculation_template_component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_component" ADD CONSTRAINT "calculation_template_component_parent_fkey" FOREIGN KEY ("calculation_template_tier_id", "organization_id") REFERENCES "calculation_template_tier"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_component" ADD CONSTRAINT "calculation_template_component_tax_fkey" FOREIGN KEY ("tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_allocation" ADD CONSTRAINT "calculation_template_allocation_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_allocation" ADD CONSTRAINT "calculation_template_allocation_parent_fkey" FOREIGN KEY ("calculation_template_component_id", "organization_id") REFERENCES "calculation_template_component"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_allocation" ADD CONSTRAINT "calculation_template_allocation_artist_fkey" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artist"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_allocation" ADD CONSTRAINT "calculation_template_allocation_partner_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_additional_revenue" ADD CONSTRAINT "calculation_template_additional_revenue_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_additional_revenue" ADD CONSTRAINT "calculation_template_additional_revenue_parent_fkey" FOREIGN KEY ("calculation_template_id", "organization_id") REFERENCES "calculation_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calculation_template_additional_revenue" ADD CONSTRAINT "calculation_template_additional_revenue_tax_fkey" FOREIGN KEY ("tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every organization receives the statutory defaults. Existing uncommon rates remain available as explicit legacy templates.
INSERT INTO "tax_rate_template" ("organization_id", "name", "normalized_name", "rate_basis_points")
SELECT organization."id", defaults."name", defaults."normalized_name", defaults."rate_basis_points"
FROM "organization" organization
CROSS JOIN (VALUES
  ('Steuerfrei – 0 %', 'steuerfrei – 0 %', 0),
  ('Ermäßigt – 7 %', 'ermäßigt – 7 %', 700),
  ('Regulär – 19 %', 'regulär – 19 %', 1900)
) AS defaults("name", "normalized_name", "rate_basis_points")
ON CONFLICT ("organization_id", "normalized_name") DO NOTHING;

WITH used_rates AS (
  SELECT "organization_id", "base_tax_rate_basis_points" AS rate FROM "ticket_price_tier" WHERE "base_tax_rate_basis_points" IS NOT NULL
  UNION SELECT "organization_id", "tax_rate_basis_points" FROM "ticket_price_component"
  UNION SELECT "organization_id", "tax_rate_basis_points" FROM "additional_revenue"
)
INSERT INTO "tax_rate_template" ("organization_id", "name", "normalized_name", "rate_basis_points")
SELECT DISTINCT used_rates."organization_id",
  'Altbestand ' || TRIM(TRAILING '0' FROM TRIM(TRAILING '.' FROM TO_CHAR(used_rates.rate / 100.0, 'FM999990.00'))) || ' %',
  'altbestand ' || used_rates.rate::text,
  used_rates.rate
FROM used_rates
WHERE used_rates.rate NOT IN (0, 700, 1900)
ON CONFLICT ("organization_id", "normalized_name") DO NOTHING;

UPDATE "ticket_price_tier" tier SET
  "base_tax_rate_template_id" = tax."id",
  "base_tax_rate_template_version" = tax."version",
  "base_tax_rate_name_snapshot" = tax."name"
FROM "tax_rate_template" tax
WHERE tier."organization_id" = tax."organization_id"
  AND tier."base_tax_rate_basis_points" = tax."rate_basis_points"
  AND tier."base_tax_rate_template_id" IS NULL;

UPDATE "ticket_price_component" component SET
  "tax_rate_template_id" = tax."id",
  "tax_rate_template_version" = tax."version",
  "tax_rate_name_snapshot" = tax."name"
FROM "tax_rate_template" tax
WHERE component."organization_id" = tax."organization_id"
  AND component."tax_rate_basis_points" = tax."rate_basis_points"
  AND component."tax_rate_template_id" IS NULL;

UPDATE "additional_revenue" revenue SET
  "tax_rate_template_id" = tax."id",
  "tax_rate_template_version" = tax."version",
  "tax_rate_name_snapshot" = tax."name"
FROM "tax_rate_template" tax
WHERE revenue."organization_id" = tax."organization_id"
  AND revenue."tax_rate_basis_points" = tax."rate_basis_points"
  AND revenue."tax_rate_template_id" IS NULL;

ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_tax_snapshot_consistent" CHECK (
  ("base_tax_rate_basis_points" IS NULL AND "base_tax_rate_template_id" IS NULL AND "base_tax_rate_template_version" IS NULL AND "base_tax_rate_name_snapshot" IS NULL)
  OR ("base_tax_rate_basis_points" IS NOT NULL AND "base_tax_rate_template_id" IS NOT NULL AND "base_tax_rate_template_version" > 0 AND NULLIF(BTRIM("base_tax_rate_name_snapshot"), '') IS NOT NULL)
);
ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_provider_snapshot_consistent" CHECK (
  ("source_ticket_provider_template_id" IS NULL AND "source_ticket_provider_template_version" IS NULL AND "source_ticket_provider_name_snapshot" IS NULL)
  OR ("source_ticket_provider_template_id" IS NOT NULL AND "source_ticket_provider_template_version" > 0 AND NULLIF(BTRIM("source_ticket_provider_name_snapshot"), '') IS NOT NULL)
);
ALTER TABLE "ticket_price_component" ADD CONSTRAINT "ticket_price_component_tax_snapshot_consistent" CHECK ("tax_rate_template_id" IS NOT NULL AND "tax_rate_template_version" > 0 AND NULLIF(BTRIM("tax_rate_name_snapshot"), '') IS NOT NULL);
ALTER TABLE "additional_revenue" ADD CONSTRAINT "additional_revenue_tax_snapshot_consistent" CHECK ("tax_rate_template_id" IS NOT NULL AND "tax_rate_template_version" > 0 AND NULLIF(BTRIM("tax_rate_name_snapshot"), '') IS NOT NULL);
ALTER TABLE "event" ADD CONSTRAINT "event_calculation_template_snapshot_consistent" CHECK (
  ("source_calculation_template_id" IS NULL AND "source_calculation_template_version" IS NULL AND "calculation_template_name_snapshot" IS NULL)
  OR ("source_calculation_template_id" IS NOT NULL AND "source_calculation_template_version" > 0 AND NULLIF(BTRIM("calculation_template_name_snapshot"), '') IS NOT NULL)
);

ALTER TABLE "event_format" ADD CONSTRAINT "event_format_default_calculation_template_fkey" FOREIGN KEY ("default_calculation_template_id", "organization_id") REFERENCES "calculation_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event" ADD CONSTRAINT "event_source_calculation_template_fkey" FOREIGN KEY ("source_calculation_template_id", "organization_id") REFERENCES "calculation_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_base_tax_template_fkey" FOREIGN KEY ("base_tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_provider_template_fkey" FOREIGN KEY ("source_ticket_provider_template_id", "organization_id") REFERENCES "ticket_provider_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_component" ADD CONSTRAINT "ticket_price_component_tax_template_fkey" FOREIGN KEY ("tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_revenue" ADD CONSTRAINT "additional_revenue_tax_template_fkey" FOREIGN KEY ("tax_rate_template_id", "organization_id") REFERENCES "tax_rate_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "event_format_default_calculation_template_idx" ON "event_format"("organization_id", "default_calculation_template_id");
CREATE INDEX "event_source_calculation_template_idx" ON "event"("organization_id", "source_calculation_template_id", "event_date", "id");
CREATE INDEX "ticket_price_tier_base_tax_template_idx" ON "ticket_price_tier"("organization_id", "base_tax_rate_template_id");
CREATE INDEX "ticket_price_tier_provider_template_idx" ON "ticket_price_tier"("organization_id", "source_ticket_provider_template_id");
CREATE INDEX "ticket_price_component_tax_template_idx" ON "ticket_price_component"("organization_id", "tax_rate_template_id");
CREATE INDEX "additional_revenue_tax_template_idx" ON "additional_revenue"("organization_id", "tax_rate_template_id");

-- Template administration permissions are explicit; existing administrators and finance management receive them.
INSERT INTO "permission" ("key", "description") VALUES
  ('revenue_templates.read', 'Erlös- und Steuervorlagen ansehen'),
  ('revenue_templates.write', 'Erlös- und Steuervorlagen anlegen und bearbeiten'),
  ('revenue_templates.archive', 'Erlös- und Steuervorlagen archivieren und reaktivieren')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM "role" role
CROSS JOIN "permission" permission
WHERE role."key" IN ('administrator', 'management_finance')
  AND permission."key" IN ('revenue_templates.read', 'revenue_templates.write', 'revenue_templates.archive')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
