-- Phase 3: organization-owned artists, reusable contacts and business partners.
-- All business associations carry organization_id and use composite foreign keys.

CREATE TABLE "artist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "stage_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country_code" CHAR(2),
    "email" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artist_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_identity_required" CHECK (
      NULLIF(btrim("stage_name"), '') IS NOT NULL
      OR NULLIF(btrim("first_name"), '') IS NOT NULL
      OR NULLIF(btrim("last_name"), '') IS NOT NULL
    ),
    CONSTRAINT "artist_country_code_format" CHECK (
      "country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT "artist_version_positive" CHECK ("version" > 0),
    CONSTRAINT "artist_archive_consistent" CHECK (
      ("status" = 'ACTIVE' AND "archived_at" IS NULL)
      OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    )
);

CREATE TABLE "contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "label" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_name_required" CHECK (
      NULLIF(btrim("first_name"), '') IS NOT NULL
      OR NULLIF(btrim("last_name"), '') IS NOT NULL
    ),
    CONSTRAINT "contact_version_positive" CHECK ("version" > 0),
    CONSTRAINT "contact_archive_consistent" CHECK (
      ("status" = 'ACTIVE' AND "archived_at" IS NULL)
      OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    )
);

CREATE TABLE "contact_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "contact_role_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_role_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT "contact_role_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE TABLE "artist_contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artist_contact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_contact_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "artist_contact_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "artist_contact_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "artist_contact_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_partner" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country_code" CHAR(2),
    "billing_address_line_1" TEXT,
    "billing_address_line_2" TEXT,
    "billing_postal_code" TEXT,
    "billing_city" TEXT,
    "billing_state" TEXT,
    "billing_country_code" CHAR(2),
    "vat_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_partner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_partner_company_name_not_blank" CHECK (btrim("company_name") <> ''),
    CONSTRAINT "business_partner_country_code_format" CHECK (
      "country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT "business_partner_billing_country_code_format" CHECK (
      "billing_country_code" IS NULL OR "billing_country_code" ~ '^[A-Z]{2}$'
    ),
    CONSTRAINT "business_partner_version_positive" CHECK ("version" > 0),
    CONSTRAINT "business_partner_archive_consistent" CHECK (
      ("status" = 'ACTIVE' AND "archived_at" IS NULL)
      OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    )
);

CREATE TABLE "business_partner_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "business_partner_role_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_partner_role_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT "business_partner_role_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE TABLE "business_partner_role_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "business_partner_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "business_partner_role_assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_partner_contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "business_partner_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_partner_contact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_partner_contact_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "business_partner_contact_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "business_partner_contact_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "business_partner_contact_role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_id_organization_id_key" ON "artist"("id", "organization_id");
CREATE INDEX "artist_organization_id_status_idx" ON "artist"("organization_id", "status");
CREATE INDEX "artist_organization_id_stage_name_idx" ON "artist"("organization_id", "stage_name");
CREATE UNIQUE INDEX "contact_id_organization_id_key" ON "contact"("id", "organization_id");
CREATE INDEX "contact_organization_id_status_idx" ON "contact"("organization_id", "status");
CREATE INDEX "contact_organization_id_last_name_first_name_idx" ON "contact"("organization_id", "last_name", "first_name");
CREATE UNIQUE INDEX "contact_role_key_key" ON "contact_role"("key");
CREATE UNIQUE INDEX "artist_contact_id_organization_id_key" ON "artist_contact"("id", "organization_id");
CREATE UNIQUE INDEX "artist_contact_artist_id_contact_id_key" ON "artist_contact"("artist_id", "contact_id");
CREATE INDEX "artist_contact_organization_id_idx" ON "artist_contact"("organization_id");
CREATE INDEX "artist_contact_contact_id_idx" ON "artist_contact"("contact_id");
CREATE UNIQUE INDEX "artist_contact_role_artist_contact_id_role_id_key" ON "artist_contact_role"("artist_contact_id", "role_id");
CREATE INDEX "artist_contact_role_organization_id_idx" ON "artist_contact_role"("organization_id");
CREATE INDEX "artist_contact_role_role_id_idx" ON "artist_contact_role"("role_id");
CREATE UNIQUE INDEX "business_partner_id_organization_id_key" ON "business_partner"("id", "organization_id");
CREATE INDEX "business_partner_organization_id_status_idx" ON "business_partner"("organization_id", "status");
CREATE INDEX "business_partner_organization_id_company_name_idx" ON "business_partner"("organization_id", "company_name");
CREATE UNIQUE INDEX "business_partner_role_key_key" ON "business_partner_role"("key");
CREATE UNIQUE INDEX "business_partner_role_assignment_business_partner_id_role_id_key" ON "business_partner_role_assignment"("business_partner_id", "role_id");
CREATE INDEX "business_partner_role_assignment_organization_id_idx" ON "business_partner_role_assignment"("organization_id");
CREATE INDEX "business_partner_role_assignment_role_id_idx" ON "business_partner_role_assignment"("role_id");
CREATE UNIQUE INDEX "business_partner_contact_id_organization_id_key" ON "business_partner_contact"("id", "organization_id");
CREATE UNIQUE INDEX "business_partner_contact_business_partner_id_contact_id_key" ON "business_partner_contact"("business_partner_id", "contact_id");
CREATE INDEX "business_partner_contact_organization_id_idx" ON "business_partner_contact"("organization_id");
CREATE INDEX "business_partner_contact_contact_id_idx" ON "business_partner_contact"("contact_id");
CREATE UNIQUE INDEX "business_partner_contact_role_business_partner_contact_id_role_id_key" ON "business_partner_contact_role"("business_partner_contact_id", "role_id");
CREATE INDEX "business_partner_contact_role_organization_id_idx" ON "business_partner_contact_role"("organization_id");
CREATE INDEX "business_partner_contact_role_role_id_idx" ON "business_partner_contact_role"("role_id");

ALTER TABLE "artist" ADD CONSTRAINT "artist_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact" ADD CONSTRAINT "contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_contact" ADD CONSTRAINT "artist_contact_artist_id_organization_id_fkey" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artist"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_contact" ADD CONSTRAINT "artist_contact_contact_id_organization_id_fkey" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_contact_role" ADD CONSTRAINT "artist_contact_role_artist_contact_id_organization_id_fkey" FOREIGN KEY ("artist_contact_id", "organization_id") REFERENCES "artist_contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_contact_role" ADD CONSTRAINT "artist_contact_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "contact_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner" ADD CONSTRAINT "business_partner_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_role_assignment" ADD CONSTRAINT "business_partner_role_assignment_business_partner_id_organization_id_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_role_assignment" ADD CONSTRAINT "business_partner_role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "business_partner_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_contact" ADD CONSTRAINT "business_partner_contact_business_partner_id_organization_id_fkey" FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_contact" ADD CONSTRAINT "business_partner_contact_contact_id_organization_id_fkey" FOREIGN KEY ("contact_id", "organization_id") REFERENCES "contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_contact_role" ADD CONSTRAINT "business_partner_contact_role_business_partner_contact_id_organization_id_fkey" FOREIGN KEY ("business_partner_contact_id", "organization_id") REFERENCES "business_partner_contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_partner_contact_role" ADD CONSTRAINT "business_partner_contact_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "contact_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "contact_role" ("key", "name") VALUES
  ('management', 'Management'),
  ('booking', 'Booking'),
  ('agency', 'Agentur'),
  ('technical', 'Technik'),
  ('personal', 'Persönlicher Kontakt'),
  ('other', 'Sonstiger Ansprechpartner');

INSERT INTO "business_partner_role" ("key", "name") VALUES
  ('customer', 'Kunde'),
  ('organizer', 'Veranstalter'),
  ('partner', 'Partner'),
  ('agency', 'Agentur'),
  ('technical_service', 'Technikdienstleister'),
  ('security', 'Security'),
  ('catering', 'Catering'),
  ('other_service', 'Sonstiger Dienstleister');

INSERT INTO "permission" ("key", "description") VALUES
  ('artists.read', 'Artists ansehen'),
  ('artists.write', 'Artists anlegen und bearbeiten'),
  ('artists.archive', 'Artists archivieren und reaktivieren'),
  ('contacts.read', 'Kontakte ansehen'),
  ('contacts.write', 'Kontakte anlegen und bearbeiten'),
  ('contacts.archive', 'Kontakte archivieren und reaktivieren'),
  ('business_partners.read', 'Geschäftspartner ansehen'),
  ('business_partners.write', 'Geschäftspartner anlegen und bearbeiten'),
  ('business_partners.archive', 'Geschäftspartner archivieren und reaktivieren')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'artists.read'),
    ('administrator', 'artists.write'),
    ('administrator', 'artists.archive'),
    ('administrator', 'contacts.read'),
    ('administrator', 'contacts.write'),
    ('administrator', 'contacts.archive'),
    ('administrator', 'business_partners.read'),
    ('administrator', 'business_partners.write'),
    ('administrator', 'business_partners.archive'),
    ('management_finance', 'artists.read'),
    ('management_finance', 'contacts.read'),
    ('management_finance', 'contacts.write'),
    ('management_finance', 'contacts.archive'),
    ('management_finance', 'business_partners.read'),
    ('management_finance', 'business_partners.write'),
    ('management_finance', 'business_partners.archive'),
    ('booking', 'artists.read'),
    ('booking', 'artists.write'),
    ('booking', 'artists.archive'),
    ('booking', 'contacts.read'),
    ('booking', 'contacts.write'),
    ('booking', 'contacts.archive'),
    ('booking', 'business_partners.read'),
    ('production', 'artists.read'),
    ('production', 'contacts.read'),
    ('production', 'business_partners.read'),
    ('read_only', 'artists.read'),
    ('read_only', 'contacts.read'),
    ('read_only', 'business_partners.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
