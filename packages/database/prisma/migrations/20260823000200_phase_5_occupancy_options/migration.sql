-- Phase 5 follow-up: free events, concurrency-safe location occupancy and date options.
-- The already-applied Phase-5 base migration remains unchanged.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "VenueDateOptionRank" AS ENUM ('FIRST', 'SECOND');
CREATE TYPE "VenueDateOptionStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED', 'UNAVAILABLE');
CREATE TYPE "OccupancySlot" AS ENUM ('FIRST', 'SECOND');

ALTER TABLE "event"
  ALTER COLUMN "snapshot_source" DROP NOT NULL,
  ALTER COLUMN "snapshot_source" DROP DEFAULT,
  ALTER COLUMN "source_event_format_id" DROP NOT NULL,
  ALTER COLUMN "source_event_format_version" DROP NOT NULL,
  ALTER COLUMN "format_name_snapshot" DROP NOT NULL,
  ADD COLUMN "format_description_snapshot" TEXT;

UPDATE "event"
SET "format_description_snapshot" = "description"
WHERE "snapshot_source" = 'EVENT_FORMAT';

ALTER TABLE "event" ADD CONSTRAINT "event_snapshot_source_consistent" CHECK (
  (
    "snapshot_source" IS NULL
    AND "source_event_format_id" IS NULL
    AND "source_event_format_version" IS NULL
    AND "format_name_snapshot" IS NULL
    AND "format_description_snapshot" IS NULL
  )
  OR
  (
    "snapshot_source" = 'EVENT_FORMAT'
    AND "source_event_format_id" IS NOT NULL
    AND "source_event_format_version" IS NOT NULL
    AND "source_event_format_version" > 0
    AND "format_name_snapshot" IS NOT NULL
  )
);

CREATE TABLE "venue_date_option" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "option_date" DATE NOT NULL,
  "occupancy_start_minutes" INTEGER NOT NULL,
  "occupancy_end_minutes" INTEGER NOT NULL,
  "rank" "VenueDateOptionRank" NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "business_partner_id" UUID,
  "contact_id" UUID,
  "note" TEXT,
  "valid_until" TIMESTAMPTZ(3) NOT NULL,
  "status" "VenueDateOptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_date_option_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_date_option_label_not_blank" CHECK (btrim("label") <> ''),
  CONSTRAINT "venue_date_option_version_positive" CHECK ("version" > 0),
  CONSTRAINT "venue_date_option_start_range" CHECK ("occupancy_start_minutes" BETWEEN 0 AND 1439),
  CONSTRAINT "venue_date_option_end_range" CHECK ("occupancy_end_minutes" BETWEEN 1 AND 2879),
  CONSTRAINT "venue_date_option_end_after_start" CHECK ("occupancy_end_minutes" > "occupancy_start_minutes")
);

CREATE UNIQUE INDEX "venue_date_option_id_organization_id_key"
  ON "venue_date_option"("id", "organization_id");
CREATE INDEX "venue_date_option_organization_date_start_id_idx"
  ON "venue_date_option"("organization_id", "option_date", "occupancy_start_minutes", "id");
CREATE INDEX "venue_date_option_organization_location_date_status_rank_idx"
  ON "venue_date_option"("organization_id", "location_id", "option_date", "status", "rank");
CREATE INDEX "venue_date_option_organization_valid_until_status_idx"
  ON "venue_date_option"("organization_id", "valid_until", "status");
CREATE INDEX "venue_date_option_organization_business_partner_idx"
  ON "venue_date_option"("organization_id", "business_partner_id");
CREATE INDEX "venue_date_option_organization_contact_idx"
  ON "venue_date_option"("organization_id", "contact_id");

ALTER TABLE "venue_date_option" ADD CONSTRAINT "venue_date_option_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_date_option" ADD CONSTRAINT "venue_date_option_location_tenant_fkey"
  FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_date_option" ADD CONSTRAINT "venue_date_option_partner_tenant_fkey"
  FOREIGN KEY ("business_partner_id", "organization_id") REFERENCES "business_partner"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_date_option" ADD CONSTRAINT "venue_date_option_contact_tenant_fkey"
  FOREIGN KEY ("contact_id", "organization_id") REFERENCES "contact"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_date_option" ADD CONSTRAINT "venue_date_option_creator_tenant_fkey"
  FOREIGN KEY ("created_by_membership_id", "organization_id") REFERENCES "membership"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "location_occupancy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "event_id" UUID,
  "date_option_id" UUID,
  "slot" "OccupancySlot" NOT NULL,
  "occupancy_start" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
  "occupancy_end" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "location_occupancy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_occupancy_one_source" CHECK (("event_id" IS NULL) <> ("date_option_id" IS NULL)),
  CONSTRAINT "location_occupancy_valid_period" CHECK ("occupancy_end" > "occupancy_start")
);

CREATE UNIQUE INDEX "location_occupancy_event_slot_key" ON "location_occupancy"("event_id", "slot");
CREATE UNIQUE INDEX "location_occupancy_date_option_slot_key" ON "location_occupancy"("date_option_id", "slot");
CREATE INDEX "location_occupancy_location_period_idx"
  ON "location_occupancy"("organization_id", "location_id", "occupancy_start", "occupancy_end");
CREATE INDEX "location_occupancy_event_idx" ON "location_occupancy"("organization_id", "event_id");
CREATE INDEX "location_occupancy_date_option_idx" ON "location_occupancy"("organization_id", "date_option_id");

ALTER TABLE "location_occupancy" ADD CONSTRAINT "location_occupancy_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_occupancy" ADD CONSTRAINT "location_occupancy_location_tenant_fkey"
  FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_occupancy" ADD CONSTRAINT "location_occupancy_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "location_occupancy" ADD CONSTRAINT "location_occupancy_date_option_tenant_fkey"
  FOREIGN KEY ("date_option_id", "organization_id") REFERENCES "venue_date_option"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_occupancy" ADD CONSTRAINT "location_occupancy_no_overlap"
  EXCLUDE USING gist (
    "organization_id" WITH =,
    "location_id" WITH =,
    "slot" WITH =,
    tsrange("occupancy_start", "occupancy_end", '[)') WITH &&
  );

INSERT INTO "location_occupancy" (
  "organization_id", "location_id", "event_id", "slot", "occupancy_start", "occupancy_end"
)
SELECT
  "organization_id",
  "location_id",
  "id",
  slot,
  "event_date" + LEAST("technical_get_in_minutes", "artist_get_in_minutes", "doors_minutes", "start_minutes") * INTERVAL '1 minute',
  "event_date" + "end_minutes" * INTERVAL '1 minute'
FROM "event"
CROSS JOIN (VALUES ('FIRST'::"OccupancySlot"), ('SECOND'::"OccupancySlot")) AS slots(slot)
WHERE "status" <> 'CANCELLED'
  AND COALESCE("technical_get_in_minutes", "artist_get_in_minutes", "doors_minutes", "start_minutes") IS NOT NULL
  AND "end_minutes" IS NOT NULL;

INSERT INTO "permission" ("key", "description") VALUES
  ('date_options.read', 'Terminoptionen und Freitermine ansehen'),
  ('date_options.write', 'Terminoptionen anlegen und bearbeiten'),
  ('date_options.convert', 'Terminoptionen in Veranstaltungen umwandeln')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'date_options.read'),
    ('administrator', 'date_options.write'),
    ('administrator', 'date_options.convert'),
    ('management_finance', 'date_options.read'),
    ('management_finance', 'date_options.write'),
    ('management_finance', 'date_options.convert'),
    ('booking', 'date_options.read'),
    ('booking', 'date_options.write'),
    ('booking', 'date_options.convert'),
    ('production', 'date_options.read'),
    ('read_only', 'date_options.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
