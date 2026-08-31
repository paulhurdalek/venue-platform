ALTER TABLE "document"
  DROP CONSTRAINT "document_type_status_consistent",
  ADD CONSTRAINT "document_type_status_consistent" CHECK (
    ("type" = 'OFFER' AND "status" IN ('ENTWURF', 'ERSTELLT', 'UEBERGEBEN', 'ANGENOMMEN', 'ABGELEHNT', 'ABGELAUFEN', 'ARCHIVIERT'))
    OR ("type" = 'PRODUCTION_INFORMATION' AND "status" IN ('ENTWURF', 'FREIGEGEBEN', 'ARCHIVIERT'))
  );
