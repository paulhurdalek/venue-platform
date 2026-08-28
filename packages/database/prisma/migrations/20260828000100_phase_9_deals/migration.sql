CREATE TYPE "DealStatus" AS ENUM ('ENTWURF', 'IN_VERHANDLUNG', 'VEREINBART', 'STORNIERT');
CREATE TYPE "DealComponentType" AS ENUM ('FIXED_RENT', 'REVENUE_SHARE', 'MINIMUM_GUARANTEE_SHARE');
CREATE TYPE "DealBillingMode" AS ENUM ('SEPARATELY_BILLABLE', 'INCLUDED');
CREATE TYPE "DealDiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

CREATE TABLE "deal_template" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "total_discount_type" "DealDiscountType",
  "total_discount_fixed_minor" BIGINT,
  "total_discount_percentage_basis_points" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "archived_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_template_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_template_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_template_name_not_blank" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
  CONSTRAINT "deal_template_version_currency_valid" CHECK ("version" > 0 AND "currency" = 'EUR'),
  CONSTRAINT "deal_template_discount_consistent" CHECK (
    ("total_discount_type" IS NULL AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'FIXED' AND "total_discount_fixed_minor" >= 0 AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'PERCENTAGE' AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "deal_template_archive_consistent" CHECK (("status" = 'ACTIVE' AND "archived_at" IS NULL) OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "deal_template_organization_name_key" ON "deal_template"("organization_id", "normalized_name");
CREATE INDEX "deal_template_organization_status_name_idx" ON "deal_template"("organization_id", "status", "name", "id");

CREATE TABLE "deal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "business_partner_id" UUID NOT NULL,
  "contact_id" UUID,
  "source_template_id" UUID,
  "source_template_version" INTEGER,
  "source_template_name_snapshot" VARCHAR(200),
  "customer_name_snapshot" VARCHAR(200) NOT NULL,
  "contact_name_snapshot" VARCHAR(200),
  "status" "DealStatus" NOT NULL DEFAULT 'ENTWURF',
  "total_discount_type" "DealDiscountType",
  "total_discount_fixed_minor" BIGINT,
  "total_discount_percentage_basis_points" INTEGER,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_version_currency_valid" CHECK ("version" > 0 AND "currency" = 'EUR'),
  CONSTRAINT "deal_customer_snapshot_not_blank" CHECK (NULLIF(BTRIM("customer_name_snapshot"), '') IS NOT NULL),
  CONSTRAINT "deal_template_snapshot_consistent" CHECK (
    ("source_template_id" IS NULL AND "source_template_version" IS NULL AND "source_template_name_snapshot" IS NULL)
    OR ("source_template_id" IS NOT NULL AND "source_template_version" > 0 AND NULLIF(BTRIM("source_template_name_snapshot"), '') IS NOT NULL)
  ),
  CONSTRAINT "deal_discount_consistent" CHECK (
    ("total_discount_type" IS NULL AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'FIXED' AND "total_discount_fixed_minor" >= 0 AND "total_discount_percentage_basis_points" IS NULL)
    OR ("total_discount_type" = 'PERCENTAGE' AND "total_discount_fixed_minor" IS NULL AND "total_discount_percentage_basis_points" BETWEEN 0 AND 10000)
  )
);
CREATE UNIQUE INDEX "deal_one_active_per_event_key" ON "deal"("organization_id", "event_id") WHERE "status" <> 'STORNIERT';
CREATE INDEX "deal_event_idx" ON "deal"("organization_id", "event_id", "status", "created_at");
CREATE INDEX "deal_partner_idx" ON "deal"("organization_id", "business_partner_id");
CREATE INDEX "deal_contact_idx" ON "deal"("organization_id", "contact_id");
CREATE INDEX "deal_source_template_idx" ON "deal"("organization_id", "source_template_id");

CREATE TABLE "deal_component" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "type" "DealComponentType" NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "amount_net_minor" BIGINT,
  "minimum_guarantee_net_minor" BIGINT,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "location_share_basis_points" INTEGER,
  "counterparty_share_basis_points" INTEGER,
  "include_wkz" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_component_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_component_label_not_blank" CHECK (NULLIF(BTRIM("label"), '') IS NOT NULL),
  CONSTRAINT "deal_component_values_valid" CHECK (
    "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "sort_order" >= 0 AND "version" > 0
    AND ("amount_net_minor" IS NULL OR "amount_net_minor" >= 0)
    AND ("minimum_guarantee_net_minor" IS NULL OR "minimum_guarantee_net_minor" >= 0)
  ),
  CONSTRAINT "deal_component_type_consistent" CHECK (
    ("type" = 'FIXED_RENT' AND "amount_net_minor" IS NOT NULL AND "minimum_guarantee_net_minor" IS NULL AND "location_share_basis_points" IS NULL AND "counterparty_share_basis_points" IS NULL AND "include_wkz" = false)
    OR ("type" = 'REVENUE_SHARE' AND "amount_net_minor" IS NULL AND "minimum_guarantee_net_minor" IS NULL AND "location_share_basis_points" BETWEEN 0 AND 10000 AND "counterparty_share_basis_points" BETWEEN 0 AND 10000 AND "location_share_basis_points" + "counterparty_share_basis_points" = 10000)
    OR ("type" = 'MINIMUM_GUARANTEE_SHARE' AND "amount_net_minor" IS NULL AND "minimum_guarantee_net_minor" IS NOT NULL AND "location_share_basis_points" BETWEEN 0 AND 10000 AND "counterparty_share_basis_points" BETWEEN 0 AND 10000 AND "location_share_basis_points" + "counterparty_share_basis_points" = 10000)
  )
);
CREATE INDEX "deal_component_deal_idx" ON "deal_component"("organization_id", "deal_id", "sort_order", "id");

CREATE TABLE "deal_service_position" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "source_service_id" UUID,
  "source_service_version" INTEGER,
  "service_name_snapshot" VARCHAR(200) NOT NULL,
  "unit_snapshot" "ServiceUnit" NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "sales_unit_price_net_minor" BIGINT NOT NULL,
  "internal_unit_cost_net_minor" BIGINT NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "billing_mode" "DealBillingMode" NOT NULL,
  "discount_type" "DealDiscountType",
  "discount_fixed_minor" BIGINT,
  "discount_percentage_basis_points" INTEGER,
  "sort_order" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_service_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_service_position_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_service_position_name_not_blank" CHECK (NULLIF(BTRIM("service_name_snapshot"), '') IS NOT NULL),
  CONSTRAINT "deal_service_position_values_valid" CHECK ("quantity" > 0 AND "sales_unit_price_net_minor" >= 0 AND "internal_unit_cost_net_minor" >= 0 AND "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "sort_order" >= 0 AND "version" > 0),
  CONSTRAINT "deal_service_position_source_consistent" CHECK (("source_service_id" IS NULL AND "source_service_version" IS NULL) OR ("source_service_id" IS NOT NULL AND "source_service_version" > 0)),
  CONSTRAINT "deal_service_position_discount_consistent" CHECK (
    ("discount_type" IS NULL AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" IS NULL)
    OR ("billing_mode" = 'SEPARATELY_BILLABLE' AND "discount_type" = 'FIXED' AND "discount_fixed_minor" >= 0 AND "discount_percentage_basis_points" IS NULL)
    OR ("billing_mode" = 'SEPARATELY_BILLABLE' AND "discount_type" = 'PERCENTAGE' AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" BETWEEN 0 AND 10000)
  )
);
CREATE INDEX "deal_service_position_deal_idx" ON "deal_service_position"("organization_id", "deal_id", "sort_order", "id");
CREATE INDEX "deal_service_position_service_idx" ON "deal_service_position"("organization_id", "source_service_id");

CREATE TABLE "deal_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "previous_status" "DealStatus" NOT NULL,
  "new_status" "DealStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_status_history_tenant_key" UNIQUE ("id", "organization_id")
);
CREATE INDEX "deal_status_history_deal_idx" ON "deal_status_history"("organization_id", "deal_id", "changed_at", "id");
CREATE INDEX "deal_status_history_actor_user_idx" ON "deal_status_history"("actor_user_id");
CREATE INDEX "deal_status_history_actor_membership_idx" ON "deal_status_history"("actor_membership_id");

CREATE TABLE "deal_template_component" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "type" "DealComponentType" NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "amount_net_minor" BIGINT,
  "minimum_guarantee_net_minor" BIGINT,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "location_share_basis_points" INTEGER,
  "counterparty_share_basis_points" INTEGER,
  "include_wkz" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "deal_template_component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_template_component_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_template_component_label_not_blank" CHECK (NULLIF(BTRIM("label"), '') IS NOT NULL),
  CONSTRAINT "deal_template_component_values_valid" CHECK ("tax_rate_basis_points" BETWEEN 0 AND 100000 AND "sort_order" >= 0 AND ("amount_net_minor" IS NULL OR "amount_net_minor" >= 0) AND ("minimum_guarantee_net_minor" IS NULL OR "minimum_guarantee_net_minor" >= 0)),
  CONSTRAINT "deal_template_component_type_consistent" CHECK (
    ("type" = 'FIXED_RENT' AND "amount_net_minor" IS NOT NULL AND "minimum_guarantee_net_minor" IS NULL AND "location_share_basis_points" IS NULL AND "counterparty_share_basis_points" IS NULL AND "include_wkz" = false)
    OR ("type" = 'REVENUE_SHARE' AND "amount_net_minor" IS NULL AND "minimum_guarantee_net_minor" IS NULL AND "location_share_basis_points" BETWEEN 0 AND 10000 AND "counterparty_share_basis_points" BETWEEN 0 AND 10000 AND "location_share_basis_points" + "counterparty_share_basis_points" = 10000)
    OR ("type" = 'MINIMUM_GUARANTEE_SHARE' AND "amount_net_minor" IS NULL AND "minimum_guarantee_net_minor" IS NOT NULL AND "location_share_basis_points" BETWEEN 0 AND 10000 AND "counterparty_share_basis_points" BETWEEN 0 AND 10000 AND "location_share_basis_points" + "counterparty_share_basis_points" = 10000)
  )
);
CREATE INDEX "deal_template_component_template_idx" ON "deal_template_component"("organization_id", "template_id", "sort_order", "id");

CREATE TABLE "deal_template_service_position" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "source_service_id" UUID,
  "source_service_version" INTEGER,
  "service_name_snapshot" VARCHAR(200) NOT NULL,
  "unit_snapshot" "ServiceUnit" NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "sales_unit_price_net_minor" BIGINT NOT NULL,
  "internal_unit_cost_net_minor" BIGINT NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "billing_mode" "DealBillingMode" NOT NULL,
  "discount_type" "DealDiscountType",
  "discount_fixed_minor" BIGINT,
  "discount_percentage_basis_points" INTEGER,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "deal_template_service_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_template_service_position_tenant_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "deal_template_service_position_name_not_blank" CHECK (NULLIF(BTRIM("service_name_snapshot"), '') IS NOT NULL),
  CONSTRAINT "deal_template_service_position_values_valid" CHECK ("quantity" > 0 AND "sales_unit_price_net_minor" >= 0 AND "internal_unit_cost_net_minor" >= 0 AND "tax_rate_basis_points" BETWEEN 0 AND 100000 AND "sort_order" >= 0),
  CONSTRAINT "deal_template_service_position_source_consistent" CHECK (("source_service_id" IS NULL AND "source_service_version" IS NULL) OR ("source_service_id" IS NOT NULL AND "source_service_version" > 0)),
  CONSTRAINT "deal_template_service_position_discount_consistent" CHECK (
    ("discount_type" IS NULL AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" IS NULL)
    OR ("billing_mode" = 'SEPARATELY_BILLABLE' AND "discount_type" = 'FIXED' AND "discount_fixed_minor" >= 0 AND "discount_percentage_basis_points" IS NULL)
    OR ("billing_mode" = 'SEPARATELY_BILLABLE' AND "discount_type" = 'PERCENTAGE' AND "discount_fixed_minor" IS NULL AND "discount_percentage_basis_points" BETWEEN 0 AND 10000)
  )
);
CREATE INDEX "deal_template_service_position_template_idx" ON "deal_template_service_position"("organization_id", "template_id", "sort_order", "id");
CREATE INDEX "deal_template_service_position_service_idx" ON "deal_template_service_position"("organization_id", "source_service_id");

ALTER TABLE "deal_template" ADD CONSTRAINT "deal_template_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_event_tenant_fkey" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_partner_tenant_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_contact_tenant_fkey" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_template_tenant_fkey" FOREIGN KEY ("source_template_id", "organization_id") REFERENCES "deal_template"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_component" ADD CONSTRAINT "deal_component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_component" ADD CONSTRAINT "deal_component_deal_tenant_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deal"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_service_position" ADD CONSTRAINT "deal_service_position_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_service_position" ADD CONSTRAINT "deal_service_position_deal_tenant_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deal"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_service_position" ADD CONSTRAINT "deal_service_position_service_tenant_fkey" FOREIGN KEY ("source_service_id", "organization_id") REFERENCES "service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_status_history" ADD CONSTRAINT "deal_status_history_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_status_history" ADD CONSTRAINT "deal_status_history_deal_tenant_fkey" FOREIGN KEY ("deal_id", "organization_id") REFERENCES "deal"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_status_history" ADD CONSTRAINT "deal_status_history_actor_user_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_status_history" ADD CONSTRAINT "deal_status_history_actor_membership_tenant_fkey" FOREIGN KEY ("actor_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_template_component" ADD CONSTRAINT "deal_template_component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_template_component" ADD CONSTRAINT "deal_template_component_template_tenant_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "deal_template"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_template_service_position" ADD CONSTRAINT "deal_template_service_position_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_template_service_position" ADD CONSTRAINT "deal_template_service_position_template_tenant_fkey" FOREIGN KEY ("template_id", "organization_id") REFERENCES "deal_template"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_template_service_position" ADD CONSTRAINT "deal_template_service_position_service_tenant_fkey" FOREIGN KEY ("source_service_id", "organization_id") REFERENCES "service"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("key", "description") VALUES
  ('deals.read', 'Vermietungs- und Veranstaltungsdeals ansehen'),
  ('deals.write', 'Vermietungs- und Veranstaltungsdeals bearbeiten'),
  ('deals.status', 'Dealstatus ändern'),
  ('deal_templates.read', 'Dealvorlagen ansehen'),
  ('deal_templates.write', 'Dealvorlagen anlegen und bearbeiten'),
  ('deal_templates.archive', 'Dealvorlagen archivieren und reaktivieren')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM "role" role
CROSS JOIN "permission" permission
WHERE role."key" IN ('administrator', 'management_finance')
  AND permission."key" IN ('deals.read', 'deals.write', 'deals.status', 'deal_templates.read', 'deal_templates.write', 'deal_templates.archive')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
