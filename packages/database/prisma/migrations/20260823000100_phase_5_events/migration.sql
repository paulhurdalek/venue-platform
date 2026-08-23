-- Phase 5: location-bound concrete events with immutable EventFormat provenance.
-- Event dates are local DATE values. Times remain relational minutes from that local date.

CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EventSnapshotSource" AS ENUM ('EVENT_FORMAT');

CREATE TABLE "event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "event_date" DATE NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "snapshot_source" "EventSnapshotSource" NOT NULL DEFAULT 'EVENT_FORMAT',
    "source_event_format_id" UUID NOT NULL,
    "source_event_format_version" INTEGER NOT NULL,
    "format_name_snapshot" VARCHAR(200) NOT NULL,
    "event_kind_snapshot" "EventKind" NOT NULL,
    "description" TEXT,
    "technical_get_in_minutes" INTEGER,
    "artist_get_in_minutes" INTEGER,
    "doors_minutes" INTEGER,
    "start_minutes" INTEGER,
    "end_minutes" INTEGER,
    "recording_setting" "RecordingDefault" NOT NULL DEFAULT 'UNSPECIFIED',
    "timezone_snapshot" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "event_format_name_snapshot_not_blank" CHECK (btrim("format_name_snapshot") <> ''),
    CONSTRAINT "event_timezone_snapshot_not_blank" CHECK (btrim("timezone_snapshot") <> ''),
    CONSTRAINT "event_version_positive" CHECK ("version" > 0),
    CONSTRAINT "event_source_format_version_positive" CHECK ("source_event_format_version" > 0),
    CONSTRAINT "event_status_timestamps_consistent" CHECK (
      ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
      OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
      OR ("status" IN ('DRAFT', 'PLANNED', 'CONFIRMED') AND "cancelled_at" IS NULL AND "completed_at" IS NULL)
    ),
    CONSTRAINT "event_technical_get_in_range" CHECK (
      "technical_get_in_minutes" IS NULL OR "technical_get_in_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_artist_get_in_range" CHECK (
      "artist_get_in_minutes" IS NULL OR "artist_get_in_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_doors_range" CHECK (
      "doors_minutes" IS NULL OR "doors_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_start_range" CHECK (
      "start_minutes" IS NULL OR "start_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_end_range" CHECK (
      "end_minutes" IS NULL OR "end_minutes" BETWEEN 0 AND 2879
    ),
    CONSTRAINT "event_doors_before_start" CHECK (
      "doors_minutes" IS NULL OR "start_minutes" IS NULL OR "doors_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_technical_get_in_before_start" CHECK (
      "technical_get_in_minutes" IS NULL OR "start_minutes" IS NULL
      OR "technical_get_in_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_artist_get_in_before_start" CHECK (
      "artist_get_in_minutes" IS NULL OR "start_minutes" IS NULL
      OR "artist_get_in_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_end_after_start" CHECK (
      "end_minutes" IS NULL OR "start_minutes" IS NULL OR "end_minutes" > "start_minutes"
    )
);

CREATE UNIQUE INDEX "event_id_organization_id_key"
  ON "event"("id", "organization_id");
CREATE INDEX "event_organization_id_event_date_start_minutes_id_idx"
  ON "event"("organization_id", "event_date", "start_minutes", "id");
CREATE INDEX "event_organization_id_location_id_event_date_id_idx"
  ON "event"("organization_id", "location_id", "event_date", "id");
CREATE INDEX "event_organization_id_status_event_date_id_idx"
  ON "event"("organization_id", "status", "event_date", "id");
CREATE INDEX "event_organization_id_source_format_event_date_id_idx"
  ON "event"("organization_id", "source_event_format_id", "event_date", "id");
CREATE INDEX "event_organization_id_event_kind_event_date_id_idx"
  ON "event"("organization_id", "event_kind_snapshot", "event_date", "id");

ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event" ADD CONSTRAINT "event_location_tenant_fkey"
  FOREIGN KEY ("location_id", "organization_id") REFERENCES "location"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event" ADD CONSTRAINT "event_source_format_tenant_fkey"
  FOREIGN KEY ("source_event_format_id", "organization_id") REFERENCES "event_format"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("key", "description") VALUES
  ('events.read', 'Veranstaltungen ansehen'),
  ('events.write', 'Veranstaltungen anlegen und bearbeiten'),
  ('events.status', 'Veranstaltungsstatus ändern')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'events.read'),
    ('administrator', 'events.write'),
    ('administrator', 'events.status'),
    ('management_finance', 'events.read'),
    ('management_finance', 'events.write'),
    ('management_finance', 'events.status'),
    ('booking', 'events.read'),
    ('booking', 'events.write'),
    ('booking', 'events.status'),
    ('production', 'events.read'),
    ('production', 'events.write'),
    ('read_only', 'events.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
