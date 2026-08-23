# Phase 5: Veranstaltungen, Terminoptionen und Freitermine

Phase 5 führt konkrete, Location-gebundene Veranstaltungen, zwei priorisierte Terminoptionen und
eine berechnete Freiterminansicht ein. Alle drei Funktionen verwenden dieselbe relationale
Belegungslogik. Bookings, Line-ups, Angebote und Kundenkommunikation bleiben eigene spätere
Fachbereiche.

## Veranstaltungen mit und ohne Vorlage

Der Anlageflow bietet ausdrücklich `Mit Vorlage` und `Ohne Vorlage`.

Mit Vorlage lädt der Server das aktive EventFormat innerhalb der Erstellungstransaktion. Er speichert
Quell-ID und -Version sowie Name, Beschreibung und Art als Provenienz-Snapshot; die aktuellen
Beschreibung-, Zeit- und Aufzeichnungswerte werden zu unabhängig bearbeitbaren Eventwerten. Nur
ausdrücklich übermittelte Eventwerte überschreiben die Vorlage. Eine spätere Änderung oder
Archivierung des Formats verändert das Event nie.

Ohne Vorlage wird kein EventFormat erzeugt oder verborgen eingesetzt. Name, lokales Datum, Location
und `EventKind` sind Pflicht. Beschreibung, Get-ins, Einlass, Beginn, Ende/Folgetag und
Aufzeichnungseinstellung bleiben optional. `snapshotSource`, `sourceEventFormatId`,
`sourceEventFormatVersion`, `formatNameSnapshot` und `formatDescriptionSnapshot` sind gemeinsam
`null`; ein SQL-Constraint hält diesen Zustand zum Vorlagenzustand konsistent. Liste und Detail
zeigen `Ohne Vorlage`. Beim Wechsel der Anlageart leert der Client den alten Entwurf, sodass keine
unsichtbaren Vorlagenwerte gesendet werden. Ohne aktive Formate startet die Anlage direkt im freien
Modus.

## Zentrale Location-Belegung

`location_occupancy` ist das gemeinsame, rein relationale Belegungsmodell für Events, 1. Optionen und 2. Optionen. Ein Eintrag enthält Organisation, Location, Slot und einen lokalen PostgreSQL-Zeitraum.
Zeitintervalle sind halb offen: `[Beginn, Ende)`. Ein direkter Anschluss am Endzeitpunkt ist damit
zulässig; echte Überschneidungen sind es nicht.

Der Eventbeginn ist die früheste vorhandene Zeit aus Technik-Get-in, Artist-Get-in, Einlass und
Beginn. Das Eventende schließt bei Bedarf den Folgetag ein. Alle Statuswerte außer `CANCELLED`
blockieren beide Optionsslots. Absage entfernt die Belegung; Reaktivierung, Location-, Datums- und
Zeitänderungen bauen sie unter erneuter Prüfung neu auf. Verschiedene Locations sind unabhängig,
und Folgetagintervalle kollidieren korrekt mit frühen Belegungen des nächsten Datums.

Fehlt eine Startzeit oder das Ende, darf das Event weiterhin gespeichert werden, erhält jedoch
keinen vermeintlich präzisen Belegungszeitraum. UI und API kennzeichnen es mit
`occupancyComplete=false`; die Oberfläche zeigt
`Zeiten unvollständig – Konfliktprüfung nur eingeschränkt möglich`. Eine Freiterminsuche für dieses
lokale Datum liefert `Manuelle Prüfung erforderlich` und macht den Tag nicht auswählbar.

Mutationen sperren alle betroffenen Organisation/Location-Paare in stabiler Reihenfolge mit
transaktionalen PostgreSQL-Advisory-Locks. Zusätzlich erzwingt ein GiST-Exclusion-Constraint auf
Organisation, Location, Slot und `tsrange(..., '[)')` die Regel auch bei konkurrierenden Requests.
Der fachliche Konfliktvertrag ist HTTP 409 mit `LOCATION_OCCUPANCY_CONFLICT`. Konfliktziele enthalten
nur Ressourcen derselben Organisation und einer bereits zugänglichen Location.

## Terminoption

`VenueDateOption` ist ein eigenes, versioniertes Aggregat und weder Event noch Booking. Es speichert
Location, lokales Datum, vollständigen Belegungszeitraum, Rang `FIRST`/`SECOND`, Bezeichnung,
optionalen Geschäftspartner/Ansprechpartner, interne Notiz, `validUntil`, Status,
Ersteller-Mitgliedschaft und Zeitstempel. Die Statuswerte sind:

- `ACTIVE`: blockiert den eigenen Rang;
- `RELEASED`: manuell freigegeben;
- `EXPIRED`: bei der nächsten relevanten Operation abgelaufen;
- `CONVERTED`: atomar in ein Event umgewandelt;
- `UNAVAILABLE`: durch die Umwandlung der überlappenden 1. Option nicht mehr verfügbar.

Es gibt keine physische Löschung. Ist für den Zeitraum kein Rang belegt, wird automatisch die

1. Option vergeben. Bei vorhandener 1. Option wird die 2. Option vergeben. Sind beide Ränge belegt,
   folgt der stabile Belegungskonflikt. Ein Event belegt beide Ränge. Abgelaufene Optionen werden unter
   derselben Location-Sperre vor Verfügbarkeitsabfragen sowie Event-/Optionsmutationen statuswirksam
   bereinigt und auditiert.

Nach Freigabe oder Ablauf einer überlappenden 1. Option wird eine 2. Option nicht automatisch
hochgestuft. Die Detailseite zeigt `Kann zur 1. Option hochgestuft werden`; erst die bestätigte
Aktion prüft und ändert den Rang atomar. Eine aktive überlappende 1. Option verhindert die
Hochstufung.

Eine aktive Option kann freigegeben werden. Die Umwandlung in ein Event zeigt erneut `Mit Vorlage`
und `Ohne Vorlage`, belegt Location, Datum, Bezeichnung und abbildbare Belegungszeiten vor und lässt
die endgültigen Eventwerte bearbeiten. Der Server prüft diese endgültigen Werte. Option, Event,
Belegungsersatz und Audit werden in einer Transaktion geschrieben. Eine 2. Option kann bei einer
überlappenden aktiven 1. Option nicht umgewandelt werden. Bei Umwandlung der 1. Option werden
betroffene 2. Optionen nicht gelöscht, sondern atomar `UNAVAILABLE` und auditiert.

### Mehrfachanlage aus Freiterminen

In der Freiterminansicht können bis zu 50 geeignete Ergebnisse ausgewählt und über
`Optionen anlegen` gemeinsam vorbereitet werden. Bezeichnung/Anfrage, optionaler
Geschäftspartner/Agentur, optionaler Ansprechpartner, Gültigkeit und interne Notiz werden einmal
erfasst. Gemeinsame Standardzeiten lassen sich auf alle Zeilen anwenden. Datum, Location,
Belegungszeiten einschließlich Folgetag und Rang bleiben pro Termin kontrollier- und änderbar.

Der initiale Rangvorschlag stammt aus der unmittelbar vorherigen Freiterminprüfung: `Frei` und
`2. Option vergeben – 1. Option möglich` schlagen `FIRST` vor;
`1. Option vergeben – 2. Option möglich` schlägt `SECOND` vor. Änderungen an Datum, Location oder
Zeit werden sichtbar als erneut prüfpflichtig markiert. Der Server vertraut keinem Vorschlag,
sondern validiert den ausdrücklich übermittelten Rang unter der zentralen Location-Sperre erneut.

`POST /date-options/batch` erzeugt normale, anschließend unabhängig bearbeitbare
`VenueDateOption`-Datensätze. Alle Locations und gemeinsamen Referenzen werden tenant- und
Location-sicher geprüft. Danach werden sämtliche Optionen und ihre einzelnen Audit-Einträge in
genau einer Datenbanktransaktion geschrieben. Ein doppelter Termin im Request führt zu
`DUPLICATE_DATE_OPTION_BATCH_ENTRY` (HTTP 422). Eine Veranstaltung oder ein bereits belegter
angeforderter Rang führt zu `LOCATION_OCCUPANCY_CONFLICT` (HTTP 409) mit Batch-Index, Datum,
Location, Rang und – soweit autorisiert – sicheren Konfliktzielen. Bei jedem Fehler wird der
gesamte Vorgang zurückgerollt. Die sortierten Advisory-Locks und der bestehende GiST-Constraint
sichern dies auch bei parallelen Batch-Anfragen ab. Die bisherige Einzelanlage bleibt unverändert.

## Freitermine

Der Tab `Freitermine` berechnet höchstens 93 lokale Kalendertage. Kriterien sind Location, Von/Bis,
Belegungsbeginn, Ende/Folgetag, optionale Wochentage und der Auswahlfilter `nur frei` oder
`frei und 2. Option möglich`. Die Ergebnisse unterscheiden:

- `Frei`;
- `1. Option vergeben – 2. Option möglich`;
- `2. Option vergeben – 1. Option möglich` als zusätzlicher konsistenter Zwischenzustand;
- `1. und 2. Option vergeben`;
- `Durch Veranstaltung belegt`;
- `Manuelle Prüfung erforderlich`.

Nur freie und – bei entsprechendem Filter – ausdrücklich zweitoptionierbare Ergebnisse sind
auswählbar. Mehrere Termine werden als deutscher Klartext in die Zwischenablage kopiert. Der Text
enthält nur Wochentag, Datum und Zeitraum sowie den Unverbindlichkeitshinweis; interne Notizen,
Kontakte und sonstige personenbezogene Daten werden nie aufgenommen.

Die Auswahl verwendet native, beschriftete Checkboxes und zeigt ihre Anzahl fortlaufend. Nach
erfolgreicher Batch-Anlage wird die Auswahl geleert, die Verfügbarkeit erneut abgefragt und jeder
neue Optionsdatensatz unmittelbar als sicherer Detaillink angezeigt.

## Zentrale Kontrast- und Zustandsregeln

Primäre und umrandete Bedienelemente verwenden gemeinsame Design-Tokens. Eine nicht ausgewählte
Sekundäraktion hat weißen Hintergrund, grünen Rahmen und dunkelgrüne Schrift. Hover verwendet einen
sehr hellgrünen Hintergrund; ausgewählte Zustände verwenden dunkelgrünen Hintergrund, weiße Schrift
und zusätzlich eine Unterstreichung. `aria-current`, `aria-pressed` beziehungsweise
`aria-selected` transportieren den Zustand semantisch. Der globale 3-Pixel-Fokusring bleibt für die
Tastatur sichtbar. Deaktivierte Controls erhalten deckende graue Hintergrund-, Rahmen- und
Textfarben statt einer kontrastmindernden Transparenz. Die automatisierte Browserprüfung misst für
normalen Text mindestens WCAG-AA-Kontrast 4,5:1 und kontrolliert besonders
`Kalender / Liste / Freitermine`.

## Kalender, Liste und Detail

Aktive Optionen erscheinen im Monatskalender, in der mobilen Agenda und in der Liste mit dezenten,
unterschiedlichen Kennzeichnungen für 1. und 2. Option. Ein Filter kann sie ausblenden; inaktive
Optionen werden standardmäßig nicht angezeigt. Die kompakte Detailansicht zeigt Rang, Zeitraum,
Location, Gültigkeit, Status und optionale Verknüpfungen. Bearbeiten, Freigeben, Hochstufen und
Umwandeln erscheinen ausschließlich bei der jeweils erforderlichen Berechtigung. Formulare,
Kalender, Liste und Freitermin-Auswahl bleiben responsiv und mit nativen Bedienelementen
tastaturbedienbar.

## REST-API und Berechtigungen

Alle Pfade beginnen mit `/api/v1/organizations/{organizationId}`:

| Methode und Pfad                         | Zweck                                  |
| ---------------------------------------- | -------------------------------------- |
| `GET/POST /events`                       | Events auflisten oder anlegen          |
| `GET/PATCH /events/{eventId}`            | Event lesen oder versioniert ändern    |
| `PATCH /events/{eventId}/status`         | Eventstatus versioniert ändern         |
| `GET/POST /date-options`                 | Optionen auflisten oder anlegen        |
| `POST /date-options/batch`               | 1–50 Optionen atomar gemeinsam anlegen |
| `GET/PATCH /date-options/{optionId}`     | Option lesen oder versioniert ändern   |
| `PATCH /date-options/{optionId}/release` | aktive Option freigeben                |
| `PATCH /date-options/{optionId}/promote` | 2. Option atomar hochstufen            |
| `POST /date-options/{optionId}/convert`  | Option atomar in Event umwandeln       |
| `GET /availability`                      | Freitermine aus der Belegung berechnen |

Events verwenden `events.read`, `events.write` und `events.status`. Optionen und Freitermine
verwenden `date_options.read`, `date_options.write` und `date_options.convert`.

| Standardrolle         | Options-Lesen | Schreiben | Umwandeln |
| --------------------- | ------------- | --------- | --------- |
| Administrator         | ja            | ja        | ja        |
| Management & Finanzen | ja            | ja        | ja        |
| Booking               | ja            | ja        | ja        |
| Produktion            | ja            | nein      | nein      |
| Lesend                | ja            | nein      | nein      |

Controller autorisieren ausschließlich über Permission-Keys. Services und relationale
Tenant-Fremdschlüssel erzwingen Organisation und Location-Scope. Alle Mutationen sind
versionsgesichert, transaktional und auditiert.

## Migration und Abgrenzung

Die bereits angewendeten Migrationen `20260823000100_phase_5_events` und
`20260823000200_phase_5_occupancy_options` bleiben unverändert. Die additive Folgemigration macht
nur die zusammengehörenden
Formatquellenfelder optional, ergänzt den Beschreibungssnapshot, Optionen, Belegung,
`btree_gist`-Constraint, Indizes und Permission-Backfill. Bestehende vollständig prüfbare,
nicht abgesagte Events werden in beide Slots übernommen. Es werden weder vorhandene Daten gelöscht
noch Beispieltermine, Dummyformate oder JSON-Belegungslisten angelegt.

Die Mehrfachanlage und die zentralen Kontrastzustände benötigen keine Schemaänderung und daher
keine weitere Migration.

Ausdrücklich nicht Teil dieser Phase sind automatischer E-Mail-Versand, E-Mail-Templates,
öffentliche Freiterminlinks, Kundenportal, Anfrage-/Lead- und Erinnerungsworkflows, Angebote,
Verträge, Vermietungskalkulation, Deals, Ticketing, Rechnungen, Artist-Bookings, Line-up,
Artist-Bookingstatus sowie konfigurierbare Auf-/Abbau- oder Reinigungspuffer.
