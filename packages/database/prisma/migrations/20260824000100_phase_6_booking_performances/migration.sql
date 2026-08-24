CREATE TYPE "HotelArrangement" AS ENUM ('NONE', 'REQUIRED', 'BUYOUT');
CREATE TYPE "ProgramItemKind" AS ENUM ('PERFORMANCE', 'BREAK');

ALTER TABLE "booking"
  ADD COLUMN "hotel_arrangement" "HotelArrangement" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "hotel_buyout_minor" BIGINT,
  ADD COLUMN "hotel_buyout_currency" CHAR(3);

UPDATE "booking"
SET "hotel_arrangement" = CASE
  WHEN "hotel_required" THEN 'REQUIRED'::"HotelArrangement"
  ELSE 'NONE'::"HotelArrangement"
END;

ALTER TABLE "booking" ADD CONSTRAINT "booking_hotel_buyout_pair" CHECK (
  ("hotel_buyout_minor" IS NULL AND "hotel_buyout_currency" IS NULL)
  OR ("hotel_buyout_minor" >= 0 AND "hotel_buyout_currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "booking_id_organization_id_event_id_key"
  ON "booking"("id", "organization_id", "event_id");

DROP INDEX "booking_active_artist_role_key";

CREATE TABLE "event_program_item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "booking_id" UUID,
  "kind" "ProgramItemKind" NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "label" VARCHAR(120),
  "duration_minutes" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_program_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_program_item_kind_booking" CHECK (
    ("kind" = 'PERFORMANCE' AND "booking_id" IS NOT NULL)
    OR ("kind" = 'BREAK' AND "booking_id" IS NULL)
  ),
  CONSTRAINT "event_program_item_order_positive" CHECK ("sort_order" > 0),
  CONSTRAINT "event_program_item_duration_positive" CHECK (
    "duration_minutes" IS NULL OR "duration_minutes" > 0
  ),
  CONSTRAINT "event_program_item_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "event_program_item_id_organization_id_key"
  ON "event_program_item"("id", "organization_id");
CREATE INDEX "event_program_item_tenant_event_order_idx"
  ON "event_program_item"("organization_id", "event_id", "sort_order", "id");
CREATE INDEX "event_program_item_tenant_booking_idx"
  ON "event_program_item"("organization_id", "booking_id");

ALTER TABLE "event_program_item" ADD CONSTRAINT "event_program_item_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_program_item" ADD CONSTRAINT "event_program_item_event_tenant_fkey"
  FOREIGN KEY ("event_id", "organization_id") REFERENCES "event"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_program_item" ADD CONSTRAINT "event_program_item_booking_tenant_event_fkey"
  FOREIGN KEY ("booking_id", "organization_id", "event_id") REFERENCES "booking"("id", "organization_id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "event_program_item" (
  "organization_id",
  "event_id",
  "booking_id",
  "kind",
  "sort_order",
  "duration_minutes",
  "created_at",
  "updated_at"
)
SELECT
  "organization_id",
  "event_id",
  "id",
  'PERFORMANCE'::"ProgramItemKind",
  ROW_NUMBER() OVER (
    PARTITION BY "organization_id", "event_id"
    ORDER BY "lineup_order", "created_at", "id"
  )::INTEGER,
  "performance_duration_minutes",
  "created_at",
  "updated_at"
FROM "booking";
