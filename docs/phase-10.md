# Phase 10: Angebote und Abläufe als PDF

Phase 10 führt ein mandantenfähiges Dokument-Aggregat für Vermietungsangebote und Abläufe ein.
Arbeitsstände bleiben als Entwurf bearbeitbar. Jede Veröffentlichung archiviert einen vollständigen,
unveränderlichen Snapshot zusammen mit den tatsächlich ausgegebenen PDF-Bytes, SHA-256, Größe,
Status, Version und Akteur. Dokumentänderungen mutieren weder Deal noch Event oder Kalkulation.

## Vorlagen, Dokumenttitel und Migration

Dokumentvorlagen sind organisationsweit, typisiert, optimistisch versioniert und archivierbar. Ihr
Name und Titel dienen ausschließlich der internen Auswahl und Herkunftsanzeige. Beim Anlegen erhält
das konkrete Dokument einen eigenen, editierbaren Titel, standardmäßig
`Vermietungsangebot für <Event>` beziehungsweise `Ablauf für <Event>`. Der Vorlagenname erscheint
weder in der externen Dokumentansicht noch in der PDF.

Vorlagen-ID, -Name und -Version bleiben intern im Snapshot nachvollziehbar. Spätere
Vorlagenänderungen verändern bestehende Dokumente nicht. Bestehende veröffentlichte Titel,
Dokumentnummern, Snapshots und PDFs bleiben unverändert. Die Datenmigration korrigiert nur noch nie
veröffentlichte Angebote, deren Titel erkennbar aus einer generischen Vorlage stammt.

Die internen Typwerte bleiben aus Kompatibilitätsgründen `OFFER` und `PRODUCTION_INFORMATION`; in
der Oberfläche und in Dokumenten heißt der zweite Typ ausschließlich **Ablauf**.

## Fortlaufende Dokumentnummern

Neue Entwürfe haben noch keine endgültige Nummer. Beim ersten Wechsel eines Angebots nach
`ERSTELLT` oder bei der ersten direkten Veröffentlichung wird die Nummer atomar in derselben
Datenbanktransaktion vergeben:

- Angebot: `ANG-YYYY-0001`
- Ablauf: `ABL-YYYY-0001` (intern geführt; nicht in Dokumentansicht oder PDF sichtbar)

Die Sequenz läuft getrennt nach Organisation, Kalenderjahr und Dokumenttyp. Bereits vorhandene
passende Nummern initialisieren den Sequenzstand bei der Migration. Ein Rollback verbraucht keine
Nummer, einmal vergebene Nummern bleiben am Dokument und werden bei Statuswechseln oder neuen
Versionen nicht erneut vergeben. Gelöschte oder historische Nummern werden nicht wiederverwendet.

## Externes Vermietungsangebot

Ein Angebot übernimmt Empfänger, Eventdaten und ausschließlich extern geeignete Kosten und
Leistungen aus dem Deal. Dazu zählen feste Miete sowie separat berechnete oder enthaltene Technik-,
Personal-, Catering- und sonstige Leistungen. Enthaltene Leistungen werden mit `0,00 €` und dem
Zusatz `(enthalten)` ausgewiesen. Mengen, Verkaufspreise, Positions- und Gesamtrabatte,
Umsatzsteuergruppen, Netto und Brutto werden mit den vorhandenen deterministischen Minor-Unit- und
`HALF_UP`-Regeln berechnet.

Ticketumsätze, Umsatz- oder Ergebnisbeteiligungen, Mindestgarantien, Auszahlungen, Einkaufskosten,
Deckungsbeiträge und Margen sind interne Dealwerte. Sie werden bei neuen Snapshots nicht zu
Angebotspositionen und bei bestehenden Arbeitsständen vor Berechnung und Ausgabe gefiltert. Eine
Migration ergänzt den Quelltyp bestehender Positionen und entfernt ungeeignete Positionen nur aus
unveröffentlichten Entwürfen. Historische Versionen bleiben unverändert.

Die übernommenen externen Positionen können im Dokument geändert, ergänzt, entfernt und sortiert
werden. Eine Abweichungsmarkierung vergleicht sie mit ihrem ursprünglichen Quellsnapshot. Interne
Notizen erscheinen weder in der Dokumentansicht noch in Vorschau, Snapshot-Ausgabe oder PDF.

Der Angebotsstatus folgt
`ENTWURF → ERSTELLT → UEBERGEBEN → ANGENOMMEN | ABGELEHNT | ABGELAUFEN`. Eine spätere Bearbeitung
erzeugt wieder einen Arbeitsentwurf, erhält aber Nummer und historische Versionen.

## Ablauf

Ein Ablauf enthält ausschließlich den zeitlichen Plan des Veranstaltungstags. Er zeigt eine
kompakte chronologische Tabelle mit `Start`, `Programmpunkt`, `Dauer` und `Notiz`. Allgemeine
Get-in-, Einlass-, Beginn- und Endezeiten gehören zur späteren Dispo und werden im Ablauf nicht
ausgegeben. Programmpunkt-Bezeichnung und optionale Notiz sind getrennte Felder; Auftritte,
Pausen und Umbauten bleiben jeweils einzelne chronologische Programmpunkte.

Fehlende explizite Startzeiten werden in Programmreihenfolge aus Veranstaltungsbeginn und Dauer
fortgeschrieben. Finance, Gagen, Preise, Margen, Leistungen, Kontakte und interne Notizen werden
weder abgefragt noch in Kontext, Ansicht, Snapshot-Ausgabe oder PDF aufgenommen. Bestehende
Altdaten werden nicht unnötig gelöscht; nicht mehr passende Vorlagentexte bleiben intern erhalten,
werden beim Ablauf aber nicht ausgegeben.

Der Status folgt `ENTWURF → FREIGEGEBEN → ARCHIVIERT`. Archivierte Abläufe sind nicht mehr
bearbeitbar.

## Dokumentansicht, PDF-Vorschau und Archiv

Die bearbeitbare Browserdarstellung heißt **Dokumentansicht** beziehungsweise **Entwurfsansicht**.
Die Aktion **Tatsächliche PDF-Vorschau** ruft den serverseitigen Preview-Endpunkt auf und bettet
genau dessen PDF-Bytes ein. Veröffentlichung und Vorschau verwenden dasselbe Snapshot-Modell und
denselben Renderer; nur die veröffentlichte Ausgabe wird als unveränderliche Version gespeichert.

Der A4-Renderer bildet die Dokumentansicht mit Organisations-Masthead, Dokumenttitel,
Eventdaten, Empfänger, Einleitung, Inhaltsblöcken, echter Positionstabelle, Summen,
Standardbedingungen, Schlussformel und Fußzeile ab. Er unterstützt Sonderzeichen, wiederholt
Tabellenköpfe nach Seitenumbrüchen und hält Summen sowie Fußzeilen innerhalb der Druckränder.
Ablauf-PDFs verwenden einen kompakten Kopf ohne Typdopplung oder sichtbare interne Nummer und
enthalten danach ausschließlich die chronologische Programmtabelle. Die Tabelle nutzt eine breite
Notizspalte, dezente Zeilenstreifen und wiederholt ihren Kopf auf Folgeseiten.

PDF-Bytes liegen dauerhaft als `BYTEA` in PostgreSQL. Es gibt keine Abhängigkeit von temporären
Dateien oder dem lokalen Dateisystem eines API-Containers.

## REST, Rechte und Isolation

Alle Endpunkte liegen unter `/api/v1/organizations/{organizationId}`. Eventbezogenes Anlegen und
Auflisten erfolgt unter `/events/{eventId}/documents`. Details, optimistisch gesicherte Änderungen,
Statuswechsel, Vorschau, Veröffentlichung und Versionsdownload sind getrennte Aktionen. OpenAPI
und `@venue/api-client` werden aus den Controllern generiert.

Phase 10 ergänzt `documents.read`, `documents.write`, `documents.publish`,
`document_templates.read`, `document_templates.write` und `document_templates.archive`. Jede
Abfrage wird nach Organisation und gegebenenfalls Location gescopet. Zusammengesetzte
Fremdschlüssel sichern die Mandantengrenzen zusätzlich in PostgreSQL. Nicht sichtbare Ressourcen
liefern `404`, veraltete Revisionen `409 VERSION_CONFLICT` und fachlich ungültige Übergänge stabile
`422`-Codes.

## Späterer Dispo-Baustein (nur Backlog)

Eine zukünftige **Dispo** bleibt fachlich und technisch vom Ablauf getrennt. Vorgesehen sind ein
sortierbarer Block-Builder, konfigurierbare Felder, Kontakt-Mehrfachauswahl, ein proportional
skaliertes Organisationslogo aus PNG oder SVG und ein eigener Event-Snapshot. Phase 10 führt dafür
bewusst **kein** Schema, keinen Upload-Endpunkt und keine UI-Implementierung ein.

## Verifikation

Unit-Tests prüfen Berechnung, Statusregeln, Nummernvergabe sowie den strukturellen PDF-Vertrag mit
gefülltem Angebot, echten Tabellen, Summen und Mehrseitenumbruch. Datenbank- und API-Tests prüfen
Migration, Sequenzen, Snapshots, externe Positionsfilter, unveränderliche Versionen und
Location-Scope. Playwright prüft den kompletten Entwurfs- und Ausgabeweg einschließlich der
tatsächlich servergenerierten PDF-Vorschau und mobiler Breite. Eine mit Poppler gerasterte
Mehrseiten-PDF wird zusätzlich visuell kontrolliert. Das konkrete Laufprotokoll steht in
[`phase-10-verification.md`](phase-10-verification.md).

Die Abnahmebefehle sind:

```bash
pnpm format:check
pnpm verify
pnpm test:db
pnpm test:integration
pnpm test:e2e
pnpm peers check
pnpm test:containers
pnpm security:audit
```
