ALTER TABLE "document"
  ALTER COLUMN "document_number" DROP NOT NULL;

ALTER TABLE "document"
  DROP CONSTRAINT "document_number_not_blank";

ALTER TABLE "document"
  ADD CONSTRAINT "document_number_not_blank"
  CHECK ("document_number" IS NULL OR NULLIF(BTRIM("document_number"), '') IS NOT NULL);

CREATE TABLE "document_number_sequence" (
  "organization_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "document_type" "DocumentType" NOT NULL,
  "last_number" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_number_sequence_pkey" PRIMARY KEY ("organization_id", "year", "document_type"),
  CONSTRAINT "document_number_sequence_values_valid" CHECK ("year" BETWEEN 2000 AND 9999 AND "last_number" > 0)
);

ALTER TABLE "document_number_sequence"
  ADD CONSTRAINT "document_number_sequence_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_number_sequence" (
  "organization_id", "year", "document_type", "last_number", "created_at", "updated_at"
)
SELECT
  "organization_id",
  SPLIT_PART("document_number", '-', 2)::INTEGER,
  'OFFER'::"DocumentType",
  MAX(SPLIT_PART("document_number", '-', 3)::INTEGER),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "document"
WHERE "document_number" ~ '^ANG-[0-9]{4}-[0-9]+$'
GROUP BY "organization_id", SPLIT_PART("document_number", '-', 2)::INTEGER;

INSERT INTO "document_number_sequence" (
  "organization_id", "year", "document_type", "last_number", "created_at", "updated_at"
)
SELECT
  "organization_id",
  SPLIT_PART("document_number", '-', 2)::INTEGER,
  'PRODUCTION_INFORMATION'::"DocumentType",
  MAX(SPLIT_PART("document_number", '-', 3)::INTEGER),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "document"
WHERE "document_number" ~ '^ABL-[0-9]{4}-[0-9]+$'
GROUP BY "organization_id", SPLIT_PART("document_number", '-', 2)::INTEGER;

UPDATE "document_offer_position" AS position
SET "source_snapshot" = COALESCE(position."source_snapshot", '{}'::jsonb)
  || jsonb_build_object('componentType', component."type"::text)
FROM "deal_component" AS component
WHERE position."source" = 'DEAL_COMPONENT'
  AND position."source_id" = component."id"
  AND position."organization_id" = component."organization_id";

DELETE FROM "document_offer_position" AS position
USING "document" AS document, "deal_component" AS component
WHERE position."document_id" = document."id"
  AND position."organization_id" = document."organization_id"
  AND position."source" = 'DEAL_COMPONENT'
  AND position."source_id" = component."id"
  AND position."organization_id" = component."organization_id"
  AND document."type" = 'OFFER'
  AND document."published_version" = 0
  AND component."type" <> 'FIXED_RENT';

UPDATE "document" AS document
SET "title" = 'Vermietungsangebot für ' || event."name"
FROM "event" AS event, "document_template" AS template
WHERE document."event_id" = event."id"
  AND document."organization_id" = event."organization_id"
  AND document."source_template_id" = template."id"
  AND document."organization_id" = template."organization_id"
  AND document."type" = 'OFFER'
  AND document."published_version" = 0
  AND (
    LOWER(BTRIM(document."title")) IN ('vorlage', 'angebot', 'standardangebot')
    OR document."title" = template."title"
  );
