# Phase 6: Booking und Line-up

Phase 6 trennt organisationsweite Artist-Stammdaten konsequent von der Teilnahme an einer
konkreten Veranstaltung. Ein `Booking` gehört zu genau einer Organisation, einem Event und einem
Artist. Es speichert ausschließlich veranstaltungsspezifische Rolle, Status, Vereinbarungen und
optionale Finanzdaten; Artist-Stammdaten werden dabei nie verändert. Einzelne
Auftritte und Pausen bilden davon getrennt die operative Programmreihenfolge.

## Line-up-Vorgaben und Snapshot

Ein EventFormat kann relationale Vorgaben für `ARTIST`, `MODERATOR` und frei bezeichnete `OTHER`-
Rollen enthalten. Jede Position besitzt benötigte Anzahl, Sortierung, Version und optional eine
Standardgage plus ISO-Währung. Die Oberfläche nimmt normale Beträge wie `200`, `200,00` oder
`200.00` entgegen und zeigt sie mit `Intl.NumberFormat` als `200,00 €`; erst die exakte
String-/`BigInt`-Konvertierung an der API-Grenze erzeugt Minor Units. Beim Erstellen eines
formatbasierten Events – auch
bei der Umwandlung einer Terminoption – kopiert dieselbe Transaktion die aktiven Vorgaben in
`event_lineup_requirement`. Die Kopie hält Quell-ID und Quellversion fest und ist danach unabhängig.

Spätere Formatänderungen verändern weder bestehende Event-Vorgaben noch Bookings. Freie und bereits
vor Phase 6 vorhandene Events erhalten keine erfundenen Positionen; ihre Vorgaben können im
Eventdetail ausdrücklich gepflegt werden. Beim Anlegen eines Bookings schlägt die Oberfläche die
Standardgage des Event-Snapshots vor. Sie kann überschrieben oder vollständig entfernt werden.

## Bookingstatus

| Interner Wert | Oberfläche | Aktive Besetzung |
| ------------- | ---------- | ---------------- |
| `SHORTLISTED` | Vorgemerkt | ja               |
| `REQUESTED`   | Angefragt  | ja               |
| `OPTION`      | Option     | ja               |
| `CONFIRMED`   | Bestätigt  | ja               |
| `DECLINED`    | Abgelehnt  | nein             |
| `CANCELLED`   | Storniert  | nein             |

Jeder von den übrigen fünf Statuswerten ist direkt auswählbar. Damit sind operative Korrekturen
wie `SHORTLISTED → CONFIRMED`, `CONFIRMED → OPTION` und `OPTION → REQUESTED` ohne künstliche
Zwischenschritte möglich. Eine unveränderte Auswahl erzeugt keine Anfrage. Wechsel nach
`DECLINED` oder `CANCELLED` sowie jede Reaktivierung daraus werden in der Oberfläche bestätigt;
eine optionale Statusnotiz wird im kompakten Dialog erfasst. Der Server verlangt für die
Reaktivierung in einen aktiven Zustand zusätzlich das ausdrückliche Bestätigungsflag.

Jede Änderung prüft die aktuelle Version, erhöht sie atomar und schreibt in derselben Transaktion
eine `booking_status_history`-Zeile sowie einen Audit-Eintrag. Historische Bookings werden nicht
gelöscht. Ein Bookingstatus verändert niemals automatisch den Eventstatus.

## Bookingdaten und Kontakte

Ein Booking enthält Rolle/freie Rollenbezeichnung, Status, interne Notiz, Reisevereinbarung/-kosten,
strukturierte Hotelregelung, Version und Zeitstempel. Die Hotelregelung unterscheidet `NONE`,
`REQUIRED` und `BUYOUT`; ein Buy-out kann einen optionalen Betrag samt Währung tragen, während die
Hotelnotiz unabhängig davon bleibt. Vereinbarte Gage, Reisekosten und Hotel-Buy-out sind intern
nicht-negative `BIGINT`-Minor-Units mit dreibuchstabigem ISO-Code. Die API bleibt dadurch exakt und
kompatibel, während in allen sichtbaren Ansichten ausschließlich normale, lokalisierte Geldbeträge
vorkommen. `null` für Betrag und Währung ist jeweils ein gültiger Zustand. Das bisherige
`hotelRequired` bleibt als veraltetes Kompatibilitätsfeld erhalten und wurde verlustfrei auf die
neue Auswahl abgebildet. Phase 6 berechnet keine Steuer, Kalkulation oder Rechnung.

Die optionale Bookingfirma und der Ansprechpartner referenzieren vorhandene strukturierte Artist-
Beziehungen. Nach der Artist-Auswahl priorisiert die Oberfläche eindeutige aktive Beziehungen nach
Booking, Management und Agentur. Bei genau einer passenden Firma wird diese übernommen; als
Ansprechpartner folgt der primäre beziehungsweise einzige aktive Kontakt. Mehrere gleichwertige
Firmen oder mehrere Kontakte ohne Primärkennzeichnung bleiben bewusst offen. Ein Artistwechsel
entfernt alte Vorbelegungen. Automatische Werte sind gekennzeichnet und bleiben änderbar.

Jede Bookingkarte besitzt einen standardmäßig kompakten Kontaktblock mit Firma,
Ansprechpartner, E-Mail und bevorzugter Mobil-/Telefonnummer. Aufgeklappt erscheinen Firmen- und
Kontaktrollen, alle `mailto:`-/`tel:`-Kanäle, weitere Ansprechpartner und Links in die Stammdaten.
Archivierte Beziehungen bleiben bei bestehenden Bookings sichtbar und gekennzeichnet, werden für
neue Zuordnungen aber nicht angeboten oder akzeptiert. Booking-Antworten entfernen Firmenfelder
ohne `business_partners.read` und alle personenbezogenen Kontaktdaten ohne `contacts.read`
serverseitig. Dasselbe Redaktionsprinzip gilt für Artist-Listen und -Details.

Ohne aktive Booking-, Management- oder Agenturvertretung zeigt der kompakte Kontaktblock
`Eigenvertretung · Direktkontakt` und verwendet E-Mail und Telefon des Artists als `mailto:`- und
`tel:`-Fallback. Eine ausdrücklich ausgewählte Vertretung und deren Ansprechpartner haben immer
Vorrang; es werden weder eine künstliche Firma noch ein Kontaktduplikat erzeugt. Fehlen auch beim
Artist Kanäle, erklärt die Oberfläche dies und bietet mit `artists.write` den direkten Profil-Link
an. Die eigenen Artist-Kanäle liefert der Server ausschließlich mit `artists.read`; Kontakt- und
Partnerfelder behalten zusätzlich ihre bestehenden Leserechte.

## Artist-Suche und Schnellanlage

Die Artist-Auswahl ist eine ARIA-Combobox mit Maus-, Pfeiltasten-, Enter- und Escape-Bedienung. Sie
sucht serverseitig tokenisiert nach Künstlername, Vorname, Nachname und Kombinationen daraus,
liefert nur aktive Artists und lädt weitere Seiten in 25er-Schritten. Die Auswahl wird allein durch
die Artist-ID bestimmt; gleiche Anzeigenamen bleiben damit eindeutig. Historische Bookings mit
archivierten Artists bleiben über ihre gespeicherte Referenz lesbar.

Mit `artists.write` kann direkt aus dem Bookingformular ein Artist mit Künstlername und optionalen
Personen-/Kontaktdaten angelegt werden. Vor dem POST zeigt dieselbe serverseitige Suche mögliche
aktive oder archivierte Dubletten und erlaubt, einen aktiven Treffer stattdessen auszuwählen. Nach
erfolgreicher Anlage ist der neue Artist automatisch ausgewählt; alle übrigen Bookingfelder bleiben
erhalten und ein Link führt optional zum vollständigen Profil. Die reguläre Artist-API,
Validierung, Berechtigung und Auditspur werden unverändert wiederverwendet.

## Fortschritt, Reihenfolge und Übersichten

Der Fortschritt wird je Vorgaberolle aus aktiven Bookings berechnet: benötigt, vorgemerkt,
angefragt, Option, bestätigt und fehlt. Abgelehnte und stornierte Bookings zählen nicht. Zusätzlich
liefert die Zusammenfassung offene Anfragen/Optionen, Vollständigkeit und den Moderatorstatus.

Die geschäftlichen Bookingkarten haben keine operative Reihenfolge mehr. Ein Booking besitzt
stattdessen beliebig viele relationale `event_program_item`-Auftritte mit eigener Bezeichnung,
optionaler positiver Dauer, Position, Version und Zeitstempeln. Pausen/Umbauzeiten sind eigenständige
Programmpunkte ohne Booking. Der vollständige aktive Satz wird unter „Auftrittsreihenfolge“ atomar
und versionsgeprüft gespeichert; fehlende, doppelte oder veraltete Einträge ergeben einen stabilen
Konflikt. Drag-and-drop markiert die Zielposition und arbeitet optimistisch mit Rollback. Ziehgriff,
Pfeiltasten sowie „Nach oben“/„Nach unten“ sind gleichwertige Bedienwege mit Fokusführung. Bekannte
Dauern werden summiert und jeder Auftritt verlinkt sein Booking. Auftritte abgelehnter/stornierter
Bookings bleiben gespeichert, werden aber nicht aktiv angezeigt. Historische Bookings sind
standardmäßig ausgeblendet und über einen Filter erreichbar.

Beim Anlegen sperrt das Backend die Veranstaltung und prüft rollenunabhängig, ob für den Artist
bereits ein aktives Booking besteht. Ohne ausdrückliches `confirmDuplicateArtist` antwortet es mit
dem stabilen Konflikt `BOOKING_ACTIVE_ARTIST_CONFLICT` sowie ID, Rolle und Status des bestehenden
Bookings. Die Oberfläche empfiehlt, diesem Booking einen weiteren Auftritt hinzuzufügen, erlaubt
aber nach ausdrücklicher Bestätigung auch ein separates Booking. Abgelehnte und stornierte Historie
blockiert eine neue Buchung nicht. Der frühere rollenbezogene partielle Unique-Index wird deshalb
in der additiven Folgemigration entfernt; die transaktionale Event-Sperre schützt parallele Anlagen.

Eventliste, Monatskalender und Agenda zeigen nur eine kompakte, gemeinsam geladene
Bookingzusammenfassung. Der Event-Listenendpunkt unterstützt `booking=INCOMPLETE`,
`MODERATOR_MISSING`, `OPEN_REQUESTS`, `HAS_OPTIONS` und `FULLY_CONFIRMED`. Requirements und Bookings
werden gebündelt beziehungsweise per Aggregat-SQL gefiltert; es entsteht keine Einzelabfrage je
Event.

## REST API

Alle Pfade liegen unter `/api/v1/organizations/{organizationId}`:

| Methode und Pfad                                             | Zweck                                 | Permission                            |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------- |
| `GET /events/{eventId}/bookings`                             | aktive, optional historische Bookings | `bookings.read`                       |
| `POST /events/{eventId}/bookings`                            | Booking anlegen                       | `bookings.write`                      |
| `GET /events/{eventId}/booking-progress`                     | Rollenfortschritt                     | `bookings.read`                       |
| `GET /bookings/{bookingId}`                                  | Booking mit Statushistorie            | `bookings.read`                       |
| `PATCH /bookings/{bookingId}`                                | Booking versioniert ändern            | `bookings.write`                      |
| `PATCH /bookings/{bookingId}/status`                         | expliziter Statusübergang             | `bookings.status`                     |
| `PUT /events/{eventId}/lineup/order`                         | aktiven Gesamtsatz ordnen             | `lineup.write`                        |
| `GET/POST /events/{eventId}/program-items`                   | Auftritte/Pausen lesen oder anlegen   | `bookings.read` / `lineup.write`      |
| `PUT /events/{eventId}/program/order`                        | Programm atomar ordnen                | `lineup.write`                        |
| `PATCH/DELETE /program-items/{itemId}`                       | Programmpunkt ändern/entfernen        | `lineup.write`                        |
| `GET/PUT /events/{eventId}/lineup-requirements`              | Eventvorgaben lesen/ersetzen          | `bookings.read` / `lineup.write`      |
| `GET/PUT /event-formats/{eventFormatId}/lineup-requirements` | Formatvorgaben lesen/ersetzen         | `event_formats.read` / `lineup.write` |

DTOs werden allowlist-validiert. Tenant- und Location-Scope, aktive Referenzen, Statuswechsel und
Versionen werden serverseitig geprüft. Fachliche Validierungsfehler, unbekannte Ressourcen und
Konflikte ergeben stabile 422-, 404- beziehungsweise 409-Fehler ohne Prisma-/PostgreSQL-Interna.
OpenAPI und `@venue/api-client` werden aus den Controllern generiert.

## Berechtigungen

| Standardrolle         | read | write | status | finance | lineup.write |
| --------------------- | ---- | ----- | ------ | ------- | ------------ |
| Administrator         | ja   | ja    | ja     | ja      | ja           |
| Management & Finanzen | ja   | ja    | ja     | ja      | ja           |
| Booking               | ja   | ja    | ja     | ja      | ja           |
| Produktion            | ja   | nein  | nein   | nein    | nein         |
| Lesend                | ja   | nein  | nein   | nein    | nein         |

Ohne `bookings.finance` nimmt der Server Gage, Gagenwährung, Reisekosten und deren Währung bereits
aus Booking- und Vorgabenantworten heraus. Finanzielle Schreibversuche werden abgewiesen. Die Web-
UI rendert auf derselben Berechtigungsbasis weder Felder noch Beträge.

## Webablauf

Das Eventdetail zeigt zuerst Fortschritt und aktuelles Line-up samt unmittelbar erreichbarer
Aktion „Artist hinzufügen“ beziehungsweise „Ersten Artist hinzufügen“. Die Line-up-Vorgaben
stehen danach als kompakter, standardmäßig eingeklappter Bereich und wechseln nach dem Speichern
automatisch zurück in die Leseansicht. Individuelle Vorgaberollen erscheinen mit ihrer konkreten
Bezeichnung, etwa `Headliner`, im Booking-Select und bringen ihre Standardgage mit. Nur „Weitere
Rolle …“ öffnet das freie Textfeld; bestehende Bookingrollen werden durch spätere Änderungen nicht
umgeschrieben.

Pro Karte speichert ein einziges Status-Dropdown unmittelbar und setzt sich bei Fehlern auf den
vorigen Wert zurück. Kontaktblock, Bookingdetails und Statushistorie sind semantische
`details`/`summary`-Bereiche. Responsive Layout und Fokus-/Kontrastregeln bauen auf den
Phase-5-Komponenten auf. Auftrittsbeginn und Auftrittsdauer sind aus neuen Booking-Editoren
entfernt; Dauer und Bezeichnung werden ausschließlich im getrennten Programmbereich gepflegt. Die
Hotelregelung hat ein responsives eigenes Feldlayout und öffnet den exakten, lokalisierten
Buy-out-Editor nur bei `Hotel-Buy-out` und vorhandener Finanzberechtigung.

Phase 6 enthält ausdrücklich keine Kalkulation, Steuerlogik, Deals, Verträge, Ticketing,
Dokumenterzeugung oder Rechnungen.
