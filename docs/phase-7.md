# Phase 7: Leistungen und Kalkulation

Phase 7 ergänzt einen organisationsweiten Leistungskatalog und eine versionierte Kalkulation je
Veranstaltung. Die Lösung bleibt relational: Kategorien, Leistungen, Dienstleisterpreise,
Formatvorgaben und Eventpositionen besitzen eigene Tabellen, Tenant-Schlüssel, Versionen und
Archivstatus. Es gibt weder JSON-/EAV-Vorlagen noch physisches Löschen fachlicher Datensätze.

## Geld und Mengen

Alle Phase-7-Werte und alle neu geschriebenen kalkulationswirksamen Bookingbeträge sind netto in
EUR. Die Oberfläche akzeptiert `200`, `200,00` und `200.00`; API und Datenbank speichern nichtnegative
`BIGINT`-Minor-Units. `null` bedeutet „nicht hinterlegt“, während `0` ein vollständiger Preis ist.
Mengen liegen als `DECIMAL(18,4)` vor. Für einen Zeilenwert wird die Menge zunächst auf vier
Nachkommastellen normalisiert, mit dem ganzzahligen Einzelpreis multipliziert und deterministisch
`HALF_UP` auf den nächsten Cent gerundet. Fließkommazahlen werden dabei nicht verwendet.

## Katalog und Dienstleister

Kategorien und Leistungen sind innerhalb einer Organisation über ihren Unicode-/Whitespace-/
Großschreibungs-normalisierten Namen eindeutig. Leistungen verwenden die Einheiten Stück, Stunde,
Tag, Person, Pauschale, pro Gast und pro Ticket. Eine Leistung kann einen optionalen
Standard-Verkaufspreis und mehrere aktive oder archivierte Dienstleisterbeziehungen besitzen.

Eine aktive Dienstleisterbeziehung referenziert einen vorhandenen aktiven Geschäftspartner. Pro
Leistung sind dieselbe aktive Partnerzuordnung und mehr als ein aktiver bevorzugter Dienstleister
durch partielle Unique-Indizes ausgeschlossen. Archivierte Beziehungen und Partner bleiben in
historischen Snapshots sichtbar. Kategorien mit aktiven Leistungen können nicht archiviert werden;
archivierte Kategorien und Leistungen sind historisch lesbar und explizit reaktivierbar.

Beim Hinzufügen einer Katalogleistung zeigt die Oberfläche den Standard-Verkaufspreis und den
Einkaufspreis des gewählten aktiven Dienstleisters direkt an. Ein aktiver bevorzugter
Dienstleister wird vorausgewählt; ohne bevorzugten Eintrag wird genau ein aktiver Dienstleister
automatisch verwendet. Bei mehreren aktiven, nicht bevorzugten Einträgen erfolgt keine beliebige
Auswahl. Beide Preisvorschläge können vor dem Speichern positionsbezogen überschrieben werden.

Die API bleibt für die Auflösung maßgeblich. Fehlt ein Preisfeld bei der Neuanlage, gilt die
Priorität: ausdrücklich übermittelter Positionspreis, Format-Override, Einkaufspreis des
aufgelösten Dienstleisters beziehungsweise Standard-Verkaufspreis der Leistung. Ein ausdrücklich
übermittelter Wert einschließlich `0` oder `null` gewinnt. Bei Updates werden ein ausgelassenes
Feld und ein ausdrückliches `null` unterschieden: Auslassen erhält den Snapshot, `null` entfernt
den Preis bewusst.

## Formatvorgaben und Event-Snapshot

Ein EventFormat kann aktive, geordnete Leistungsvorgaben enthalten. Menge und Dienstleister sind
festgelegt; Einkaufs- und Verkaufs-Overrides sind optional. Ohne Override werden beim Erstellen des
Events der zu diesem Zeitpunkt aktive bevorzugte beziehungsweise gewählte Dienstleisterpreis und
der aktuelle Standard-Verkaufspreis aufgelöst.

Die Eventanlage und die Umwandlung einer Terminoption verwenden dieselbe Snapshotfunktion innerhalb
der bereits geöffneten Eventtransaktion. Sie legt genau eine `event_calculation` an und kopiert
aktive Formatpositionen relational nach `event_service_position`. Quell-IDs/-versionen, Name,
Kategorie, Einheit, Dienstleistername, Menge und Preise werden festgehalten. Spätere Katalog-,
Partner- oder Formatänderungen ändern diesen Snapshot nicht – auch nicht als Nebenwirkung einer
späteren Mengen- oder Kostenstatusänderung. Eine aktive Formatvorgabe mit archivierter Quelle wird
sichtbar beanstandet und blockiert ein neues Event mit dem stabilen 422-Fehler
`EVENT_FORMAT_SERVICES_REQUIRE_CORRECTION`.

Freie Events und über die Migration bestehende Events erhalten genau eine leere Kalkulation, aber
keine erfundenen Leistungen.

## Veranstaltungskalkulation

Die Ansicht gruppiert schreibgeschützte Bookingkosten, Format-/Katalogpositionen und individuelle
Eventpositionen. Eventpositionen können innerhalb des Events hinsichtlich Menge, Dienstleister,
Einzelpreisen, Kostenstatus, Notiz und Reihenfolge geändert oder archiviert werden. Individuelle
Positionen erzeugen keinen Katalogeintrag. Ihre Provenienz ist nach der Anlage unveränderlich.

Gage, Reisekosten und Hotel-Buy-out werden dynamisch aus Bookings projiziert und nie als zweite
editierbare Position gespeichert. `SHORTLISTED`, `REQUESTED` und `OPTION` zählen als geplant,
`CONFIRMED` als verbindlich; `DECLINED` und `CANCELLED` sind von aktiven Summen ausgeschlossen.
Fehlende Beträge und Hotelbedarf ohne Buy-out erzeugen keine Geldposition. Explizite Nullbeträge
bleiben erhalten.

Serverseitig werden folgende Werte exakt berechnet:

- voraussichtliche Kosten = geplante plus verbindliche Einkaufs- und Bookingkosten;
- geplanter und verbindlicher Kostenanteil;
- Einkaufs- und Verkaufswert aktiver Leistungen;
- Leistungsmarge = Verkaufswert minus Einkaufswert.

Bookingkosten sind kein Teil des Leistungs-Verkaufswerts oder der Leistungsmarge. Verkaufswerte sind
noch keine Eventerlöse; Ticketing, sonstige Erlöse und Ergebnisrechnung bleiben Phase 8.

Fehlende Einkaufs- oder Verkaufspreise werden als unvollständig markiert und nicht als null
summiert. Solange eine aktive Position einen benötigten Preis vermissen lässt, ist die Freigabe
gesperrt.

Für unvollständige Format- und Katalogpositionen steht die ausdrückliche Aktion „Preise aus Katalog
übernehmen“ bereit. Vor der Bestätigung zeigt eine serverseitig berechnete Vorschau genau die
fehlenden Werte. Die Transaktion ergänzt ausschließlich weiterhin leere Felder, erhält manuell
hinterlegte Preise, erhöht Positions- und Kalkulationsversion und schreibt einen Audit-Eintrag ohne
Preiswerte. Bei einer freigegebenen Kalkulation greift derselbe atomare Rücksprung auf Entwurf wie
bei anderen finanziellen Positionsänderungen. Individuelle Positionen (`CUSTOM`) bieten diese
Aktion nicht an. Ohne tatsächlich verfügbaren Katalogpreis bleibt die Warnung und damit die
Freigabesperre bestehen.

## Status, Versionierung und Projektion

Erlaubt sind ausschließlich `DRAFT → REVIEW`, `REVIEW → DRAFT`, `REVIEW → APPROVED` und
`APPROVED → DRAFT`. Jeder Wechsel ist optimistisch versioniert, schreibt Akteur, Mitgliedschaft,
Zeit, optionale Notiz, Statushistorie und Audit in derselben Transaktion.

Eventpositionsänderungen und kalkulationswirksame Bookingänderungen verwenden eine klare
Application-Port-Grenze. Ist die Kalkulation freigegeben, wird sie unter derselben Sperre atomar
auf Entwurf gesetzt. Die frühere Freigabe bleibt in der Historie mit Grund, Quelltyp und Quell-ID
erhalten; der Audit-Eintrag enthält nur technische Metadaten. Jede relevante Quellenänderung erhöht
die Kalkulationsversion, damit parallele Statuswechsel zuverlässig kollidieren.

## Berechtigungen und Redaktion

| Permission              | Bedeutung                                            |
| ----------------------- | ---------------------------------------------------- |
| `services.read`         | Katalogstruktur lesen                                |
| `services.write`        | Kategorien, Leistungen und Preise pflegen            |
| `services.archive`      | Katalogdatensätze archivieren/reaktivieren           |
| `calculations.read`     | Eventstruktur und nichtfinanzielle Kalkulation lesen |
| `calculations.write`    | Eventpositionen und nichtfreigebende Statuswechsel   |
| `calculations.purchase` | Einkaufspreise, Bookingkosten und Kostensummen       |
| `calculations.sales`    | Verkaufspreise, Verkaufswert und Marge               |
| `calculations.approve`  | Kalkulation freigeben                                |

Administrator und Management/Finanzen erhalten alle Schlüssel. Booking liest nur den Katalog.
Produktion und Lesend lesen Katalog und Kalkulationsstruktur ohne Finanzwerte. Die Application-
Projektion entfernt Einkauf, Verkauf, Bookingbeträge, Kosten und Marge serverseitig; finanzielle
Schreibversuche ohne das jeweilige Recht enden mit 403. Eventzugriffe wenden zusätzlich den
Location-Scope des Mitglieds an.

## REST und Web

Die versionierten REST-Ressourcen liegen unter `/api/v1/organizations/{organizationId}`:

- `/service-categories` und `/services` für Suche, Filter, Pagination und Lebenszyklus;
- `/services/{serviceId}/provider-prices` und `/service-provider-prices/{id}`;
- `/event-formats/{eventFormatId}/services` und `/event-format-services/{id}`;
- `/events/{eventId}/calculation`, dessen `/positions` und `/status`;
- `/event-service-positions/{id}` und dessen `/status`;
- `/event-service-positions/{id}/catalog-price-preview` für die redigierte Vorschau und
  `/event-service-positions/{id}/catalog-prices` für die versionierte, bestätigte Übernahme.

Alle DTOs werden allowlist-validiert. 404, 409 und 422 sind stabile fachliche Verträge und geben
keine Prisma-/PostgreSQL-Interna aus. OpenAPI und `@venue/api-client` enthalten Pfad-, Query- und
Bodytypen sämtlicher Phase-7-Routen.

Im Backoffice führt die Hauptnavigation zu „Leistungen“. Kategorieverwaltung, such-/filterbare
kompakte Liste, Detail-Leseansicht, ausdrücklicher Bearbeitungsmodus und Dienstleisterverwaltung
folgen den bestehenden responsiven Konventionen. EventFormat und Eventdetail enthalten kompakte
Leistungs- beziehungsweise Kalkulationsbereiche mit expliziten Editoren und Euroanzeige ohne
Währungsauswahl.
