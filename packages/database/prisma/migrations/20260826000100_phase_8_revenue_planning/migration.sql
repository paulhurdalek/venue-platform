-- Phase 8 is additive planning data only. Existing Phase-7 cost values remain unchanged.
CREATE TYPE "PriceInputType" AS ENUM ('NET', 'GROSS');
CREATE TYPE "RevenueAmountType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "TicketPercentageBasis" AS ENUM ('TICKET_BASE_GROSS');
CREATE TYPE "RevenueAllocationType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "RevenueRecipientType" AS ENUM ('ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL');
CREATE TYPE "AdditionalRevenueCalculationType" AS ENUM ('FIXED', 'PER_EXPECTED_GUEST', 'PER_PAYING_TICKET', 'PERCENT_TICKET_BASE_NET');
CREATE TYPE "RevenueConfirmationStatus" AS ENUM ('PLANNED', 'CONFIRMED');

ALTER TABLE "event" ADD COLUMN "expected_guest_count" INTEGER;
ALTER TABLE "event" ADD CONSTRAINT "event_expected_guest_count_nonnegative"
  CHECK ("expected_guest_count" IS NULL OR "expected_guest_count" >= 0);

CREATE TABLE "ticket_price_tier" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "calculation_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "expected_quantity" INTEGER NOT NULL DEFAULT 0,
  "base_input_type" "PriceInputType",
  "base_input_minor" BIGINT,
  "base_net_unit_minor" BIGINT,
  "base_gross_unit_minor" BIGINT,
  "base_tax_rate_basis_points" INTEGER,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_price_tier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_price_tier_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_price_tier_quantity_nonnegative" CHECK ("expected_quantity" >= 0),
  CONSTRAINT "ticket_price_tier_sort_nonnegative" CHECK ("sort_order" >= 0),
  CONSTRAINT "ticket_price_tier_version_positive" CHECK ("version" > 0),
  CONSTRAINT "ticket_price_tier_price_complete" CHECK (
    ("base_input_type" IS NULL AND "base_input_minor" IS NULL AND "base_net_unit_minor" IS NULL AND "base_gross_unit_minor" IS NULL AND "base_tax_rate_basis_points" IS NULL)
    OR
    ("base_input_type" IS NOT NULL AND "base_input_minor" IS NOT NULL AND "base_net_unit_minor" IS NOT NULL AND "base_gross_unit_minor" IS NOT NULL AND "base_tax_rate_basis_points" IS NOT NULL)
  ),
  CONSTRAINT "ticket_price_tier_money_nonnegative" CHECK (
    ("base_input_minor" IS NULL OR "base_input_minor" >= 0)
    AND ("base_net_unit_minor" IS NULL OR "base_net_unit_minor" >= 0)
    AND ("base_gross_unit_minor" IS NULL OR "base_gross_unit_minor" >= 0)
  ),
  CONSTRAINT "ticket_price_tier_tax_valid" CHECK ("base_tax_rate_basis_points" IS NULL OR "base_tax_rate_basis_points" BETWEEN 0 AND 100000)
);

CREATE UNIQUE INDEX "ticket_price_tier_calculation_tenant_event_key" ON "ticket_price_tier"("calculation_id", "organization_id", "event_id", "id");
CREATE INDEX "ticket_price_tier_event_idx" ON "ticket_price_tier"("organization_id", "event_id", "status", "sort_order", "id");
CREATE INDEX "ticket_price_tier_calculation_idx" ON "ticket_price_tier"("organization_id", "calculation_id", "status", "sort_order", "id");

CREATE TABLE "ticket_price_component" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_price_tier_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "amount_type" "RevenueAmountType" NOT NULL,
  "percentage_basis" "TicketPercentageBasis",
  "percentage_rate_basis_points" INTEGER,
  "input_type" "PriceInputType" NOT NULL,
  "input_amount_minor" BIGINT,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "guest_pays" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_price_component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_price_component_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_price_component_amount_consistent" CHECK (
    ("amount_type" = 'FIXED' AND "input_amount_minor" IS NOT NULL AND "percentage_basis" IS NULL AND "percentage_rate_basis_points" IS NULL)
    OR
    ("amount_type" = 'PERCENTAGE' AND "input_amount_minor" IS NULL AND "percentage_basis" = 'TICKET_BASE_GROSS' AND "percentage_rate_basis_points" IS NOT NULL)
  ),
  CONSTRAINT "ticket_price_component_values_nonnegative" CHECK (
    ("input_amount_minor" IS NULL OR "input_amount_minor" >= 0)
    AND ("percentage_rate_basis_points" IS NULL OR "percentage_rate_basis_points" BETWEEN 0 AND 100000)
    AND "tax_rate_basis_points" BETWEEN 0 AND 100000
    AND "sort_order" >= 0
    AND "version" > 0
  )
);

CREATE INDEX "ticket_price_component_tier_idx" ON "ticket_price_component"("organization_id", "ticket_price_tier_id", "status", "sort_order", "id");

CREATE TABLE "ticket_component_allocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "ticket_price_component_id" UUID NOT NULL,
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
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_component_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_component_allocation_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "ticket_component_allocation_recipient_consistent" CHECK (
    ("recipient_type" = 'ORGANIZATION' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'ARTIST' AND "artist_id" IS NOT NULL AND "business_partner_id" IS NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'BUSINESS_PARTNER' AND "artist_id" IS NULL AND "business_partner_id" IS NOT NULL AND "external_recipient_name" IS NULL)
    OR ("recipient_type" = 'EXTERNAL' AND "artist_id" IS NULL AND "business_partner_id" IS NULL AND NULLIF(BTRIM("external_recipient_name"), '') IS NOT NULL)
  ),
  CONSTRAINT "ticket_component_allocation_value_consistent" CHECK (
    ("allocation_type" = 'FIXED' AND "fixed_amount_minor" IS NOT NULL AND "fixed_amount_minor" >= 0 AND "percentage_basis_points" IS NULL)
    OR ("allocation_type" = 'PERCENTAGE' AND "fixed_amount_minor" IS NULL AND "percentage_basis_points" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "ticket_component_allocation_sort_version_valid" CHECK ("sort_order" >= 0 AND "version" > 0)
);

CREATE INDEX "ticket_component_allocation_component_idx" ON "ticket_component_allocation"("organization_id", "ticket_price_component_id", "status", "sort_order", "id");
CREATE INDEX "ticket_component_allocation_artist_idx" ON "ticket_component_allocation"("organization_id", "artist_id");
CREATE INDEX "ticket_component_allocation_partner_idx" ON "ticket_component_allocation"("organization_id", "business_partner_id");

CREATE TABLE "additional_revenue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "calculation_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "calculation_type" "AdditionalRevenueCalculationType" NOT NULL,
  "input_type" "PriceInputType" NOT NULL,
  "input_amount_minor" BIGINT,
  "percentage_rate_basis_points" INTEGER,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "confirmation_status" "RevenueConfirmationStatus" NOT NULL DEFAULT 'PLANNED',
  "note" TEXT,
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "additional_revenue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "additional_revenue_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "additional_revenue_value_consistent" CHECK (
    ("calculation_type" = 'PERCENT_TICKET_BASE_NET' AND "input_amount_minor" IS NULL AND "percentage_rate_basis_points" IS NOT NULL)
    OR
    ("calculation_type" <> 'PERCENT_TICKET_BASE_NET' AND "input_amount_minor" IS NOT NULL AND "percentage_rate_basis_points" IS NULL)
  ),
  CONSTRAINT "additional_revenue_values_nonnegative" CHECK (
    ("input_amount_minor" IS NULL OR "input_amount_minor" >= 0)
    AND ("percentage_rate_basis_points" IS NULL OR "percentage_rate_basis_points" BETWEEN 0 AND 100000)
    AND "tax_rate_basis_points" BETWEEN 0 AND 100000
    AND "sort_order" >= 0
    AND "version" > 0
  )
);

CREATE UNIQUE INDEX "additional_revenue_calculation_tenant_event_key" ON "additional_revenue"("calculation_id", "organization_id", "event_id", "id");
CREATE INDEX "additional_revenue_event_idx" ON "additional_revenue"("organization_id", "event_id", "status", "sort_order", "id");
CREATE INDEX "additional_revenue_calculation_idx" ON "additional_revenue"("organization_id", "calculation_id", "status", "sort_order", "id");

ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_event_tenant_fkey" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_tier" ADD CONSTRAINT "ticket_price_tier_calculation_tenant_event_fkey" FOREIGN KEY ("calculation_id", "organization_id", "event_id") REFERENCES "event_calculation"("id", "organization_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_price_component" ADD CONSTRAINT "ticket_price_component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_price_component" ADD CONSTRAINT "ticket_price_component_tier_tenant_fkey" FOREIGN KEY ("ticket_price_tier_id", "organization_id") REFERENCES "ticket_price_tier"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_component_allocation" ADD CONSTRAINT "ticket_component_allocation_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_component_allocation" ADD CONSTRAINT "ticket_component_allocation_component_tenant_fkey" FOREIGN KEY ("ticket_price_component_id", "organization_id") REFERENCES "ticket_price_component"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_component_allocation" ADD CONSTRAINT "ticket_component_allocation_artist_tenant_fkey" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artist"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_component_allocation" ADD CONSTRAINT "ticket_component_allocation_partner_tenant_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "additional_revenue" ADD CONSTRAINT "additional_revenue_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_revenue" ADD CONSTRAINT "additional_revenue_event_tenant_fkey" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_revenue" ADD CONSTRAINT "additional_revenue_calculation_tenant_event_fkey" FOREIGN KEY ("calculation_id", "organization_id", "event_id") REFERENCES "event_calculation"("id", "organization_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
