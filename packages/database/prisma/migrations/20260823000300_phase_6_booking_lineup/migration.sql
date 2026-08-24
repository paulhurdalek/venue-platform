CREATE TYPE "LineupRole" AS ENUM ('ARTIST', 'MODERATOR', 'OTHER');
CREATE TYPE "BookingStatus" AS ENUM (
  'SHORTLISTED',
  'REQUESTED',
  'OPTION',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED'
);

CREATE TABLE "event_format_lineup_requirement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_format_id" UUID NOT NULL,
  "role" "LineupRole" NOT NULL,
  "custom_role_label" VARCHAR(120),
  "normalized_custom_role_label" VARCHAR(120),
  "required_count" INTEGER NOT NULL,
  "default_fee_minor" BIGINT,
  "default_fee_currency" CHAR(3),
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_format_lineup_requirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_format_lineup_requirement_role_label" CHECK (
    ("role" = 'OTHER' AND "custom_role_label" IS NOT NULL AND btrim("custom_role_label") <> '' AND "normalized_custom_role_label" IS NOT NULL)
    OR ("role" <> 'OTHER' AND "custom_role_label" IS NULL AND "normalized_custom_role_label" IS NULL)
  ),
  CONSTRAINT "event_format_lineup_requirement_count_positive" CHECK ("required_count" > 0),
  CONSTRAINT "event_format_lineup_requirement_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "event_format_lineup_requirement_version_positive" CHECK ("version" > 0),
  CONSTRAINT "event_format_lineup_requirement_fee_pair" CHECK (
    ("default_fee_minor" IS NULL AND "default_fee_currency" IS NULL)
    OR ("default_fee_minor" >= 0 AND "default_fee_currency" ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT "event_format_lineup_requirement_archive_state" CHECK (
    ("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "event_format_lineup_requirement_id_organization_id_key"
  ON "event_format_lineup_requirement"("id", "organization_id");
CREATE UNIQUE INDEX "event_format_lineup_requirement_active_role_key"
  ON "event_format_lineup_requirement"(
    "organization_id", "event_format_id", "role", COALESCE("normalized_custom_role_label", '')
  ) WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "event_format_lineup_requirement_active_order_key"
  ON "event_format_lineup_requirement"("organization_id", "event_format_id", "sort_order")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "event_format_lineup_requirement_tenant_format_status_order_idx"
  ON "event_format_lineup_requirement"("organization_id", "event_format_id", "status", "sort_order", "id");

ALTER TABLE "event_format_lineup_requirement" ADD CONSTRAINT "event_format_lineup_requirement_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_format_lineup_requirement" ADD CONSTRAINT "event_format_lineup_requirement_format_tenant_fkey"
  FOREIGN KEY ("event_format_id", "organization_id") REFERENCES "event_format"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_lineup_requirement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "source_event_format_requirement_id" UUID,
  "source_event_format_requirement_version" INTEGER,
  "role" "LineupRole" NOT NULL,
  "custom_role_label" VARCHAR(120),
  "normalized_custom_role_label" VARCHAR(120),
  "required_count" INTEGER NOT NULL,
  "default_fee_minor" BIGINT,
  "default_fee_currency" CHAR(3),
  "sort_order" INTEGER NOT NULL,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_lineup_requirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_lineup_requirement_source_pair" CHECK (
    ("source_event_format_requirement_id" IS NULL) = ("source_event_format_requirement_version" IS NULL)
  ),
  CONSTRAINT "event_lineup_requirement_source_version_positive" CHECK (
    "source_event_format_requirement_version" IS NULL OR "source_event_format_requirement_version" > 0
  ),
  CONSTRAINT "event_lineup_requirement_role_label" CHECK (
    ("role" = 'OTHER' AND "custom_role_label" IS NOT NULL AND btrim("custom_role_label") <> '' AND "normalized_custom_role_label" IS NOT NULL)
    OR ("role" <> 'OTHER' AND "custom_role_label" IS NULL AND "normalized_custom_role_label" IS NULL)
  ),
  CONSTRAINT "event_lineup_requirement_count_positive" CHECK ("required_count" > 0),
  CONSTRAINT "event_lineup_requirement_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "event_lineup_requirement_version_positive" CHECK ("version" > 0),
  CONSTRAINT "event_lineup_requirement_fee_pair" CHECK (
    ("default_fee_minor" IS NULL AND "default_fee_currency" IS NULL)
    OR ("default_fee_minor" >= 0 AND "default_fee_currency" ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT "event_lineup_requirement_archive_state" CHECK (
    ("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "event_lineup_requirement_id_organization_id_key"
  ON "event_lineup_requirement"("id", "organization_id");
CREATE UNIQUE INDEX "event_lineup_requirement_active_role_key"
  ON "event_lineup_requirement"(
    "organization_id", "event_id", "role", COALESCE("normalized_custom_role_label", '')
  ) WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "event_lineup_requirement_active_order_key"
  ON "event_lineup_requirement"("organization_id", "event_id", "sort_order")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "event_lineup_requirement_tenant_event_status_order_idx"
  ON "event_lineup_requirement"("organization_id", "event_id", "status", "sort_order", "id");
CREATE INDEX "event_lineup_requirement_source_idx"
  ON "event_lineup_requirement"("organization_id", "source_event_format_requirement_id");

ALTER TABLE "event_lineup_requirement" ADD CONSTRAINT "event_lineup_requirement_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_lineup_requirement" ADD CONSTRAINT "event_lineup_requirement_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_lineup_requirement" ADD CONSTRAINT "event_lineup_requirement_source_tenant_fkey"
  FOREIGN KEY ("source_event_format_requirement_id", "organization_id") REFERENCES "event_format_lineup_requirement"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "artist_id" UUID NOT NULL,
  "role" "LineupRole" NOT NULL,
  "custom_role_label" VARCHAR(120),
  "normalized_custom_role_label" VARCHAR(120),
  "status" "BookingStatus" NOT NULL DEFAULT 'SHORTLISTED',
  "lineup_order" INTEGER NOT NULL,
  "performance_start_minutes" INTEGER,
  "performance_duration_minutes" INTEGER,
  "internal_note" TEXT,
  "business_partner_id" UUID,
  "contact_id" UUID,
  "agreed_fee_minor" BIGINT,
  "agreed_fee_currency" CHAR(3),
  "travel_arrangement" TEXT,
  "travel_cost_minor" BIGINT,
  "travel_cost_currency" CHAR(3),
  "hotel_required" BOOLEAN NOT NULL DEFAULT false,
  "hotel_note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_role_label" CHECK (
    ("role" = 'OTHER' AND "custom_role_label" IS NOT NULL AND btrim("custom_role_label") <> '' AND "normalized_custom_role_label" IS NOT NULL)
    OR ("role" <> 'OTHER' AND "custom_role_label" IS NULL AND "normalized_custom_role_label" IS NULL)
  ),
  CONSTRAINT "booking_lineup_order_positive" CHECK ("lineup_order" > 0),
  CONSTRAINT "booking_performance_start_range" CHECK (
    "performance_start_minutes" IS NULL OR "performance_start_minutes" BETWEEN 0 AND 2879
  ),
  CONSTRAINT "booking_performance_duration_positive" CHECK (
    "performance_duration_minutes" IS NULL OR "performance_duration_minutes" > 0
  ),
  CONSTRAINT "booking_version_positive" CHECK ("version" > 0),
  CONSTRAINT "booking_fee_pair" CHECK (
    ("agreed_fee_minor" IS NULL AND "agreed_fee_currency" IS NULL)
    OR ("agreed_fee_minor" >= 0 AND "agreed_fee_currency" ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT "booking_travel_cost_pair" CHECK (
    ("travel_cost_minor" IS NULL AND "travel_cost_currency" IS NULL)
    OR ("travel_cost_minor" >= 0 AND "travel_cost_currency" ~ '^[A-Z]{3}$')
  )
);

CREATE UNIQUE INDEX "booking_id_organization_id_key" ON "booking"("id", "organization_id");
CREATE UNIQUE INDEX "booking_active_artist_role_key"
  ON "booking"("organization_id", "event_id", "artist_id", "role", COALESCE("normalized_custom_role_label", ''))
  WHERE "status" NOT IN ('DECLINED', 'CANCELLED');
CREATE UNIQUE INDEX "booking_active_lineup_order_key"
  ON "booking"("organization_id", "event_id", "lineup_order")
  WHERE "status" NOT IN ('DECLINED', 'CANCELLED');
CREATE INDEX "booking_tenant_event_status_order_idx"
  ON "booking"("organization_id", "event_id", "status", "lineup_order", "id");
CREATE INDEX "booking_tenant_artist_status_idx"
  ON "booking"("organization_id", "artist_id", "status");
CREATE INDEX "booking_tenant_partner_idx" ON "booking"("organization_id", "business_partner_id");
CREATE INDEX "booking_tenant_contact_idx" ON "booking"("organization_id", "contact_id");

ALTER TABLE "booking" ADD CONSTRAINT "booking_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_artist_tenant_fkey"
  FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artist"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_partner_tenant_fkey"
  FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_contact_tenant_fkey"
  FOREIGN KEY ("contact_id", "organization_id") REFERENCES "contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "booking_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "previous_status" "BookingStatus" NOT NULL,
  "new_status" "BookingStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "actor_membership_id" UUID NOT NULL,
  "note" TEXT,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_status_history_changed" CHECK ("previous_status" <> "new_status")
);

CREATE UNIQUE INDEX "booking_status_history_id_organization_id_key"
  ON "booking_status_history"("id", "organization_id");
CREATE INDEX "booking_status_history_booking_changed_idx"
  ON "booking_status_history"("organization_id", "booking_id", "changed_at", "id");
CREATE INDEX "booking_status_history_actor_user_idx" ON "booking_status_history"("actor_user_id");
CREATE INDEX "booking_status_history_actor_membership_idx" ON "booking_status_history"("actor_membership_id");

ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_tenant_fkey"
  FOREIGN KEY ("booking_id", "organization_id") REFERENCES "booking"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_user_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_membership_tenant_fkey"
  FOREIGN KEY ("actor_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("key", "description") VALUES
  ('bookings.read', 'Booking- und Line-up-Grunddaten ansehen'),
  ('bookings.write', 'Bookings anlegen und bearbeiten'),
  ('bookings.status', 'Bookingstatus ändern'),
  ('bookings.finance', 'Booking-Gagen und Reisekosten ansehen und bearbeiten'),
  ('lineup.write', 'Line-up-Vorgaben und Reihenfolge bearbeiten')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'bookings.read'),
    ('administrator', 'bookings.write'),
    ('administrator', 'bookings.status'),
    ('administrator', 'bookings.finance'),
    ('administrator', 'lineup.write'),
    ('management_finance', 'bookings.read'),
    ('management_finance', 'bookings.write'),
    ('management_finance', 'bookings.status'),
    ('management_finance', 'bookings.finance'),
    ('management_finance', 'lineup.write'),
    ('booking', 'bookings.read'),
    ('booking', 'bookings.write'),
    ('booking', 'bookings.status'),
    ('booking', 'bookings.finance'),
    ('booking', 'lineup.write'),
    ('production', 'bookings.read'),
    ('read_only', 'bookings.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
