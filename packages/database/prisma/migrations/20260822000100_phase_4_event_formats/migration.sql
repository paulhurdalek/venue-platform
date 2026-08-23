-- Phase 4: organization-wide event formats and their concrete V1 template defaults.
-- Local times are stored relationally as minutes from the start of the event day.

CREATE TYPE "EventKind" AS ENUM ('OWN_PRODUCTION', 'THIRD_PARTY_EVENT');
CREATE TYPE "RecordingDefault" AS ENUM ('UNSPECIFIED', 'ENABLED', 'DISABLED');

CREATE TABLE "event_format" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "event_kind" "EventKind" NOT NULL,
    "technical_get_in_minutes" INTEGER,
    "artist_get_in_minutes" INTEGER,
    "doors_minutes" INTEGER,
    "start_minutes" INTEGER,
    "end_minutes" INTEGER,
    "recording_default" "RecordingDefault" NOT NULL DEFAULT 'UNSPECIFIED',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_format_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_format_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "event_format_normalized_name_not_blank" CHECK (btrim("normalized_name") <> ''),
    CONSTRAINT "event_format_version_positive" CHECK ("version" > 0),
    CONSTRAINT "event_format_archive_consistent" CHECK (
      ("status" = 'ACTIVE' AND "archived_at" IS NULL)
      OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    ),
    CONSTRAINT "event_format_technical_get_in_range" CHECK (
      "technical_get_in_minutes" IS NULL OR "technical_get_in_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_format_artist_get_in_range" CHECK (
      "artist_get_in_minutes" IS NULL OR "artist_get_in_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_format_doors_range" CHECK (
      "doors_minutes" IS NULL OR "doors_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_format_start_range" CHECK (
      "start_minutes" IS NULL OR "start_minutes" BETWEEN 0 AND 1439
    ),
    CONSTRAINT "event_format_end_range" CHECK (
      "end_minutes" IS NULL OR "end_minutes" BETWEEN 0 AND 2879
    ),
    CONSTRAINT "event_format_doors_before_start" CHECK (
      "doors_minutes" IS NULL OR "start_minutes" IS NULL OR "doors_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_format_technical_get_in_before_start" CHECK (
      "technical_get_in_minutes" IS NULL OR "start_minutes" IS NULL
      OR "technical_get_in_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_format_artist_get_in_before_start" CHECK (
      "artist_get_in_minutes" IS NULL OR "start_minutes" IS NULL
      OR "artist_get_in_minutes" <= "start_minutes"
    ),
    CONSTRAINT "event_format_end_after_start" CHECK (
      "end_minutes" IS NULL OR "start_minutes" IS NULL OR "end_minutes" > "start_minutes"
    )
);

CREATE UNIQUE INDEX "event_format_id_organization_id_key"
  ON "event_format"("id", "organization_id");
CREATE UNIQUE INDEX "event_format_organization_id_normalized_name_key"
  ON "event_format"("organization_id", "normalized_name");
CREATE INDEX "event_format_organization_id_status_name_id_idx"
  ON "event_format"("organization_id", "status", "name", "id");
CREATE INDEX "event_format_organization_id_event_kind_status_idx"
  ON "event_format"("organization_id", "event_kind", "status");

ALTER TABLE "event_format" ADD CONSTRAINT "event_format_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permission" ("key", "description") VALUES
  ('event_formats.read', 'Veranstaltungsformate ansehen'),
  ('event_formats.write', 'Veranstaltungsformate anlegen und bearbeiten'),
  ('event_formats.archive', 'Veranstaltungsformate archivieren und reaktivieren')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

WITH role_permissions("role_key", "permission_key") AS (
  VALUES
    ('administrator', 'event_formats.read'),
    ('administrator', 'event_formats.write'),
    ('administrator', 'event_formats.archive'),
    ('management_finance', 'event_formats.read'),
    ('management_finance', 'event_formats.write'),
    ('management_finance', 'event_formats.archive'),
    ('booking', 'event_formats.read'),
    ('production', 'event_formats.read'),
    ('production', 'event_formats.write'),
    ('read_only', 'event_formats.read')
)
INSERT INTO "role_permission" ("organization_id", "role_id", "permission_id")
SELECT role."organization_id", role."id", permission."id"
FROM role_permissions
JOIN "role" role ON role."key" = role_permissions."role_key"
JOIN "permission" permission ON permission."key" = role_permissions."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
