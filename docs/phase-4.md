# Phase 4: Veranstaltungsformate und Vorlagen

Phase 4 führt organisationsweite Veranstaltungsformate als eigenes fachliches Modul ein. Ein
`EventFormat` ist in V1 gleichzeitig die konkrete fachliche Formatvorlage. Es gibt kein separates
`Template`-Aggregat, keine generische Template-Engine, kein EAV und keine JSON-Konfiguration.
Bezeichnungen wie „Open Mic“, „Mixshow“ oder „Webshow“ sind ausschließlich benutzerverwaltete
Datensätze und werden weder im Code noch durch Migrationen oder Setup angelegt.

## Fachmodell und Invarianten

Jedes Format gehört genau einer Organisation und besitzt einen getrimmten Namen, einen
normalisierten Namen, eine optionale Beschreibung und genau eine grundlegende Veranstaltungsart:

- `OWN_PRODUCTION` – Eigenproduktion;
- `THIRD_PARTY_EVENT` – Fremdveranstaltung / Vermietung.

Die beiden Werte bilden nur die wirtschaftliche Grundeinordnung ab. Weitere feste Untertypen gibt
es nicht. Der normalisierte Name wird mit Unicode-NFKC, zusammengefassten Leerzeichen und
Kleinschreibung gebildet. `(organization_id, normalized_name)` ist über aktive und archivierte
Datensätze hinweg eindeutig. Ein Konflikt liefert HTTP 409 und `EVENT_FORMAT_NAME_CONFLICT`.

Formate verwenden `ACTIVE`/`ARCHIVED`, `archived_at`, eine positive optimistische `version` sowie
Erstellungs- und Änderungszeitpunkte. Sie werden nie physisch gelöscht. Listen zeigen standardmäßig
nur aktive Formate; archivierte Formate bleiben direkt aufrufbar und reaktivierbar.

## Lokales Zeitmodell

Standardzeiten sind lokale Uhrzeiten einer späteren Veranstaltung, keine UTC-Zeitpunkte. Die
Datenbank speichert sie relational als Minuten ab Beginn des Veranstaltungstags:

| Wert           | Datenbankbereich | API-Beispiel                           |
| -------------- | ---------------- | -------------------------------------- |
| Get-in Technik | `0..1439`        | `16:00`                                |
| Get-in Artists | `0..1439`        | `17:30`                                |
| Einlass        | `0..1439`        | `19:00`                                |
| Beginn         | `0..1439`        | `20:00`                                |
| Ende           | `0..2879`        | `01:30` plus `defaultEndNextDay: true` |

Alle Werte sind optional. Wenn die beteiligten Werte vorhanden sind, gelten Einlass und Get-ins
spätestens zum Beginn und das Ende strikt nach dem Beginn. Zwischen Technik- und Artist-Get-in wird
keine Reihenfolge erzwungen. Unvollständige Zeitangaben erzeugen keine angenommene Reihenfolge.
Domänenregeln und SQL-Checks sichern dieselben Grenzen und grundlegenden Ordnungen.

Die Aufzeichnungsvorgabe ist `UNSPECIFIED`, `ENABLED` oder `DISABLED` und wird in der Oberfläche als
„Nicht vorgegeben“, „Standardmäßig aktiv“ oder „Standardmäßig inaktiv“ angezeigt.

## Berechtigungen

| Standardrolle         | `event_formats.read` | `event_formats.write` | `event_formats.archive` |
| --------------------- | -------------------- | --------------------- | ----------------------- |
| Administrator         | ja                   | ja                    | ja                      |
| Management & Finanzen | ja                   | ja                    | ja                      |
| Booking               | ja                   | nein                  | nein                    |
| Produktion            | ja                   | ja                    | nein                    |
| Lesend                | ja                   | nein                  | nein                    |

Die Phase-4-Migration zieht bestehende Standardrollen nach. `SetupService` verwendet dieselbe
Matrix für neue Organisationen. Der zentrale Access Guard prüft konkrete Berechtigungen; Controller
autorisieren nie anhand eines Rollennamens. Formate sind organisationsweit und besitzen in Phase 4
keinen Location-Scope.

## REST-API

Alle Pfade beginnen mit `/api/v1/organizations/{organizationId}`.

| Methode und Pfad                              | Zweck                                                 |
| --------------------------------------------- | ----------------------------------------------------- |
| `GET /event-formats`                          | Suchen, nach Status/Art filtern und stabil paginieren |
| `POST /event-formats`                         | Format anlegen                                        |
| `GET /event-formats/{eventFormatId}`          | Format einschließlich archivierter Datensätze lesen   |
| `PATCH /event-formats/{eventFormatId}`        | Fachliche Werte mit erwarteter Version ändern         |
| `PATCH /event-formats/{eventFormatId}/status` | Archivieren oder reaktivieren                         |

Die Liste unterstützt `q`, `status=ACTIVE|ARCHIVED|ALL`, `eventKind`, `limit` bis 100 und `offset`.
Sortiert wird stabil nach Name und ID. Fremde und unbekannte Tenant-IDs liefern dieselbe 404-Antwort.
OpenAPI wird aus den DTOs erzeugt; das Web verwendet ausschließlich den generierten Client.

## Audit

Erstellung, fachliche Änderungen, Archivierung und Reaktivierung werden in derselben Transaktion
wie die Mutation geschrieben. Metadaten enthalten ausschließlich Versionen, Statuswerte und Namen
geänderter Felder. Name, Beschreibung und andere Rohwerte werden nicht in Audit-Metadaten kopiert.

## Verbindlicher Snapshot-Vertrag für Phase 5

Phase 4 legt noch keine Veranstaltungen oder Snapshots an. Für Phase 5 gilt verbindlich:

1. Beim Erstellen einer Veranstaltung werden die zu diesem Zeitpunkt gültigen Formatwerte kopiert.
2. Die Veranstaltung besitzt danach ihre eigenen Werte und darf zusätzlich die Herkunft über
   EventFormat-ID und verwendete Formatversion dokumentieren.
3. Spätere Änderungen am EventFormat verändern bestehende Veranstaltungen und deren Snapshots
   niemals automatisch oder rückwirkend.
4. Archivierte Formate bleiben für historische Veranstaltungen referenzierbar.
5. Für neue Veranstaltungen werden nur aktive Formate angeboten.

Bewusst späteren Phasen vorbehalten bleiben konkrete Veranstaltungen, Kalender, Serien, Bookings,
Line-ups und Bookingstatus, Personal- und Leistungsbausteine, Technik-Kataloge, Gagen, Kosten,
Erlöse, Ticketpreise, Deal- und Vermietungsmodelle, Räume, Dokumentvorlagen, Angebote, Verträge,
Rechnungen und sämtliche eventbezogenen Snapshots oder Übersteuerungen.
