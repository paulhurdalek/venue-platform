-- Phase 3 extension: explicit Artist-to-Business-Partner representations.
-- Existing Artist, Contact and Business Partner records and links remain untouched.

CREATE UNIQUE INDEX "business_partner_contact_tenant_partner_key"
  ON "business_partner_contact"("id", "organization_id", "business_partner_id");

CREATE TABLE "artist_business_partner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "business_partner_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artist_business_partner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_business_partner_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "artist_business_partner_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_business_partner_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "artist_business_partner_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artist_business_partner_contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_business_partner_id" UUID NOT NULL,
    "business_partner_id" UUID NOT NULL,
    "business_partner_contact_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artist_business_partner_contact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_business_partner_contact_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "artist_business_partner_contact_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_business_partner_contact_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "artist_business_partner_contact_role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_business_partner_tenant_key"
  ON "artist_business_partner"("id", "organization_id");
CREATE UNIQUE INDEX "artist_business_partner_tenant_partner_key"
  ON "artist_business_partner"("id", "organization_id", "business_partner_id");
CREATE UNIQUE INDEX "artist_business_partner_artist_partner_key"
  ON "artist_business_partner"("artist_id", "business_partner_id");
CREATE INDEX "artist_business_partner_tenant_idx"
  ON "artist_business_partner"("organization_id");
CREATE INDEX "artist_business_partner_partner_idx"
  ON "artist_business_partner"("business_partner_id");

CREATE UNIQUE INDEX "artist_business_partner_role_parent_role_key"
  ON "artist_business_partner_role"("artist_business_partner_id", "role_id");
CREATE INDEX "artist_business_partner_role_tenant_idx"
  ON "artist_business_partner_role"("organization_id");
CREATE INDEX "artist_business_partner_role_role_idx"
  ON "artist_business_partner_role"("role_id");

CREATE UNIQUE INDEX "artist_partner_contact_tenant_key"
  ON "artist_business_partner_contact"("id", "organization_id");
CREATE UNIQUE INDEX "artist_partner_contact_parent_source_key"
  ON "artist_business_partner_contact"(
    "artist_business_partner_id",
    "business_partner_contact_id"
  );
CREATE UNIQUE INDEX "artist_partner_contact_primary_key"
  ON "artist_business_partner_contact"("artist_business_partner_id")
  WHERE "is_primary" = true;
CREATE INDEX "artist_partner_contact_tenant_idx"
  ON "artist_business_partner_contact"("organization_id");
CREATE INDEX "artist_partner_contact_source_idx"
  ON "artist_business_partner_contact"("business_partner_contact_id");

CREATE UNIQUE INDEX "artist_partner_contact_role_parent_role_key"
  ON "artist_business_partner_contact_role"(
    "artist_business_partner_contact_id",
    "role_id"
  );
CREATE INDEX "artist_partner_contact_role_tenant_idx"
  ON "artist_business_partner_contact_role"("organization_id");
CREATE INDEX "artist_partner_contact_role_role_idx"
  ON "artist_business_partner_contact_role"("role_id");

ALTER TABLE "artist_business_partner"
  ADD CONSTRAINT "artist_business_partner_artist_tenant_fkey"
  FOREIGN KEY ("artist_id", "organization_id")
  REFERENCES "artist"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_business_partner"
  ADD CONSTRAINT "artist_business_partner_partner_tenant_fkey"
  FOREIGN KEY ("business_partner_id", "organization_id")
  REFERENCES "business_partner"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_business_partner_role"
  ADD CONSTRAINT "artist_business_partner_role_parent_tenant_fkey"
  FOREIGN KEY ("artist_business_partner_id", "organization_id")
  REFERENCES "artist_business_partner"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_business_partner_role"
  ADD CONSTRAINT "artist_business_partner_role_role_fkey"
  FOREIGN KEY ("role_id") REFERENCES "business_partner_role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_business_partner_contact"
  ADD CONSTRAINT "artist_partner_contact_parent_tenant_partner_fkey"
  FOREIGN KEY ("artist_business_partner_id", "organization_id", "business_partner_id")
  REFERENCES "artist_business_partner"("id", "organization_id", "business_partner_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_business_partner_contact"
  ADD CONSTRAINT "artist_partner_contact_source_tenant_partner_fkey"
  FOREIGN KEY ("business_partner_contact_id", "organization_id", "business_partner_id")
  REFERENCES "business_partner_contact"("id", "organization_id", "business_partner_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_business_partner_contact_role"
  ADD CONSTRAINT "artist_partner_contact_role_parent_tenant_fkey"
  FOREIGN KEY ("artist_business_partner_contact_id", "organization_id")
  REFERENCES "artist_business_partner_contact"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_business_partner_contact_role"
  ADD CONSTRAINT "artist_partner_contact_role_role_fkey"
  FOREIGN KEY ("role_id") REFERENCES "contact_role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
