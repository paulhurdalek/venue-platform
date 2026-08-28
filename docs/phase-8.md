# Phase 8: Erlösplanung und Ticketpreisstruktur

Phase 8 ergänzt die bestehende Event-Kalkulation ausschließlich um Planwerte. Es gibt keine
Ticketshop-Anbindung, keine tatsächlichen Verkäufe, keine Zahlungsabwicklung, keine Auszahlungen,
keine Rechnungen und keine Nachkalkulation. Die Phase-7-Kostenmodelle und ihre bestehenden Werte
bleiben fachlich und technisch unverändert.

## Organisationsweite Erlösvorlagen

Phase 8 stellt drei getrennte, relationale Vorlagenarten bereit. Alle Vorlagen sind
organisationsgebunden, aktivier- beziehungsweise archivierbar, optimistisch versioniert und über
die bestehenden Audit-Muster nachvollziehbar. Vorlagen sind Eingabehilfen: Bei jeder Übernahme
werden Namen, Geld-, Prozent-, Steuer- und Empfängerwerte als unabhängige Momentaufnahme in die
Zielressource kopiert. Spätere Vorlagenänderungen verändern niemals bestehende Events.

### Steuersatz-Vorlagen

Ein sicherer Backfill legt je Organisation mindestens folgende aktive Vorlagen an:

- `Steuerfrei – 0 %`;
- `Ermäßigt – 7 %`;
- `Regulär – 19 %`.

Ticketgrundpreise, Preisstruktur-Bausteine und weitere Erlöse wählen im normalen Workflow eine
aktive Steuersatz-Vorlage. Der Server löst daraus den Basispunktwert und die Bezeichnung auf und
speichert beides als Snapshot. Eine freie Steuersatzeingabe im Ticket- und Erlösdialog ist nicht
vorgesehen. Berechtigte Administratoren können zusätzliche Sätze zentral anlegen, bearbeiten,
archivieren und reaktivieren.

### Ticketanbieter-Vorlagen

Ticketanbieter-Vorlagen bündeln wiederkehrende Preisstruktur-Bausteine eines Vertriebswegs. Jeder
Baustein enthält Name, Berechnungsart, Betrag oder Prozentsatz, Eingabeart, Steuer-Vorgabe,
Gastträgerschaft, Empfänger-Aufteilungen und eine stabile Reihenfolge. Eine Ticketstufe kann eine
aktive Anbieter-Vorlage als Quelle wählen. Deren vollständige Preisstruktur wird atomar kopiert und
bleibt anschließend im Event frei bearbeitbar. Es gibt keine externe Anbieteranbindung, keinen
Import und keine Verkaufsdaten.

### Kalkulationsvorlagen

Kalkulationsvorlagen können eine erwartete Gästezahl, mehrere Ticketstufen mit vollständiger
Preisstruktur, optionale Ticketanbieter-Quellen und weitere Erlöse enthalten. Sie unterstützen
Anlegen, Anzeigen, explizites Bearbeiten, Duplizieren, Archivieren, Reaktivieren und das Speichern
aus einer bestehenden Event-Kalkulation. Auch verschachtelte Zeilen und Aufteilungen bleiben
relationale Datensätze; generische JSON-/EAV-Nutzdaten werden nicht verwendet.

Empfänger können die eigene Organisation, einen konkreten Artist derselben Organisation, einen
konkreten Geschäftspartner derselben Organisation oder einen bezeichneten externen Empfänger
referenzieren. Tenant-fremde Referenzen werden serverseitig abgewiesen. Archivierte oder nicht mehr
gültige Empfänger erscheinen in der Übernahmevorschau als Konflikt und müssen bewusst ersetzt oder
mit dem betroffenen Baustein entfernt werden. Unvollständige Aufteilungen bleiben
freigabesperrend.

## Vorlagen übernehmen

Bei `Neue Veranstaltung` steht am Anfang der optionale Bereich `Vorlagen übernehmen`.
Veranstaltungsformat und Kalkulationsvorlage werden unabhängig ausgewählt; damit funktionieren nur
Format, nur Kalkulation, beide Quellen und ein vollständig freies Event. Ein Veranstaltungsformat
kann eine aktive Standard-Kalkulationsvorlage derselben Organisation vorschlagen. Die Oberfläche
zeigt diesen Vorschlag sichtbar an, übernimmt ihn aber nicht automatisch. Vor dem Speichern fasst
sie die gewählten Quellen und den Umfang der Kalkulation kompakt zusammen.

Das Anlegen des Events und aller gewählten Kalkulations-Snapshots erfolgt in einer Transaktion. Es
entsteht keine Live-Verknüpfung zur Vorlage. Im bestehenden Event bietet `Kalkulation` zusätzlich
`Vorlage übernehmen` mit Vorschau an. Eine leere Kalkulation kann direkt befüllt werden; vorhandene
Ticket- oder Erlösdaten werden nur nach expliziter Bestätigung vollständig ersetzt. Daten werden
weder stillschweigend gemischt noch dupliziert. Die Übernahme ist atomar, erhöht die Version,
schreibt Auditdaten und setzt eine freigegebene Kalkulation nach dem bestehenden Sicherheitsmuster
auf Entwurf zurück.

## Exakte Geld-, Steuer- und Prozentrechnung

Alle Geldwerte liegen als nichtnegative `BIGINT`-Minor-Units in EUR vor. Steuer- und sonstige
Prozentsätze werden als ganzzahlige Basispunkte gespeichert; `1900` entspricht beispielsweise
19,00 %. Netto-/Brutto-Umrechnung, Prozentwerte und anteilige Nettoherleitung verwenden eine
gemeinsame `BigInt`-Rechenlogik mit dokumentiertem `HALF_UP`-Runden. Fließkommazahlen werden weder
gespeichert noch für finanzielle Berechnungen verwendet.

Ticketgrundpreise und weitere Erlöse speichern die gewählte Eingabeart `NET` oder `GROSS`. Beim
Ticketgrundpreis werden Eingabebetrag, berechneter Netto-/Bruttowert und der frei konfigurierte
Steuersatz als konsistenter Satz gespeichert. Ein vollständig leerer Grundpreis ist im Entwurf
zulässig und sichtbar, blockiert aber die Kalkulationsfreigabe. Die Steuersatzkonfiguration ist
eine technische Berechnungshilfe und keine steuerliche Bewertung oder Beratung.

## Erwartete Gästezahl

`event.expected_guest_count` ist optional und nichtnegativ. Der Wert ist ausdrücklich weder die
Location-Kapazität noch eine Ist-Besucherzahl. Er ist über die Eventdaten und die Erlösplanung
sichtbar und bildet ausschließlich die Basis für gastabhängige weitere Erlöse. Änderungen erhöhen
die Event- und Kalkulationsversion und setzen eine freigegebene Kalkulation in derselben
Transaktion auf Entwurf zurück.

## Ticketpreis-Stufen und Endkundenpreis

`ticket_price_tier` ist eine relationale, tenant-gebundene und versionierte Eventressource. Jede
Stufe besitzt Bezeichnung, erwartete Menge, Preis-/Steuerwerte, stabile Reihenfolge und den
bestehenden Aktiv-/Archiviert-Lebenszyklus. Erwartete Mengen kostenloser Stufen zählen zur
erwarteten Ticket-/Besucherplanung, aber nur Stufen mit einem Endkundenpreis größer null zur
erwarteten zahlenden Ticketmenge.

Der Server berechnet je Stufe:

- Ticketgrundpreis netto und brutto;
- alle aktiven, vom Gast zusätzlich getragenen Preisbestandteile netto und brutto;
- `Endkundenpreis = Ticketgrundpreis brutto + gastgetragene Preisbestandteile brutto`;
- Grund- und Endkunden-Gesamtwerte für die erwartete Menge.

## Preisstruktur und Empfänger-Aufteilungen

`ticket_price_component` ist kein WKZ-Sondermodell. WKZ, Vorverkaufsgebühr, Zahlungsgebühr,
Kulturabgabe oder andere Zuschläge sind frei benannte Preisstruktur-Bausteine. Ein Bestandteil ist ein
fester Betrag oder ein Prozentsatz; die in Phase 8 unterstützte Prozentbasis ist explizit und
sichtbar `TICKET_BASE_GROSS`. Eingabeart, Steuersatz, Gastträgerschaft, Reihenfolge, Version und
Archivstatus sind eigene Felder.

`ticket_component_allocation` ordnet einen Bestandteil anteilig der eigenen Organisation, einem
vorhandenen Artist, einem vorhandenen Geschäftspartner oder einem frei bezeichneten externen
Dritten zu. Aufteilungen verwenden feste Brutto-Minor-Units oder Prozent-Basispunkte. Artist- und
Partnerreferenzen sind durch zusammengesetzte Tenant-Fremdschlüssel geschützt. Externe Empfänger
bleiben strukturierte relationale Zeilen mit einer Bezeichnung und sind keine Stammdaten-Dubletten.

Bei einer Bearbeitung werden frühere aktive Aufteilungszeilen archiviert und neue aktive Zeilen
atomar angelegt. So werden finanzrelevante historische Zeilen nicht physisch gelöscht. Der Server
löst jede Aufteilung centgenau auf. Mindestens eine Aufteilung muss vorhanden sein und die Summe
muss exakt dem Bruttobetrag des Bestandteils entsprechen. Eine Rundungs- oder Betragsabweichung
wird mit den betroffenen Minor Units erklärt und blockiert die Freigabe.

Wirtschaftlich gelten folgende Abgrenzungen:

- Ticketgrundpreis und Organisationsanteile sind eigener Ticket-Erlös;
- Artist- und Geschäftspartneranteile sind sichtbare Fremd-/Auszahlungsanteile;
- externe Anteile sind sichtbare Durchlaufposten;
- nicht von Gästen getragene Bestandteile werden nicht in Endkundenumsatz oder Club-Marge
  eingerechnet.

## Weitere Erlöse

`additional_revenue` ist vom Ticketmodell getrennt und unterstützt:

- festen Betrag;
- Betrag pro erwartetem Gast;
- Betrag pro erwartetem zahlenden Ticket;
- Prozentsatz vom geplanten Ticketgrundumsatz netto.

Jede Zeile besitzt Bezeichnung, Eingabeart, Betrag oder Prozentsatz, Steuersatz, Notiz,
`PLANNED`/`CONFIRMED`, Reihenfolge, Version und Archivstatus. Mengen und Basen werden serverseitig
aus Event- und Ticketplanung aufgelöst. Eine fehlende erwartete Gästezahl blockiert nur dann die
Freigabe, wenn eine aktive gastabhängige Erlöszeile sie benötigt.

## Ergebnis und Phase-7-Kostenbasis

Die kompakte Ergebnisleiste und Detailherleitung zeigen Endkunden-Ticketumsatz brutto,
Ticketgrundumsatz netto, eigene Ticket-Erlösanteile, Artist-/Partneranteile, externe
Durchlaufposten, weitere Erlöse, Phase-7-Kosten und operatives Ergebnis.

Die Kostenbasis ist ausdrücklich benannt als:

> Phase-7-Kostenbasis: voraussichtliche Netto-Einkaufs- und Bookingkosten (geplant plus
> verbindlich).

Das operative Ergebnis wird auf Netto-Basis berechnet:

`eigener Ticket-Erlös netto + weitere Erlöse netto - Phase-7-Kosten netto`

Fremdanteile und externe Durchlaufposten werden nicht als eigener Ertrag und nicht als eigene
Kosten behandelt. Sie bleiben dennoch im Endkundenpreis und in der Herleitung sichtbar.

## Status, Versionierung, Audit und Berechtigungen

Alle Phase-8-Mutationen sperren die zugehörige Kalkulation, ändern Ressource, Kalkulationsversion,
Statushistorie und Audit atomar. Bei Status `APPROVED` erfolgt derselbe Rückfall auf `DRAFT` wie in
Phase 7; Grund, Quelltyp und Quell-ID stehen in der Statushistorie. Audit-Metadaten enthalten keine
Geldwerte.

Die vorhandenen Berechtigungen bleiben maßgeblich:

- `calculations.sales` liest die finanzielle Erlösplanung;
- `calculations.write` bearbeitet und archiviert Planressourcen;
- `calculations.approve` gibt die gemeinsame Event-Kalkulation frei.
- `revenue_templates.read` liest organisationsweite Erlösvorlagen;
- `revenue_templates.write` erstellt und bearbeitet Vorlagen;
- `revenue_templates.archive` archiviert und reaktiviert Vorlagen.

Management/Finanzen und Administrator besitzen diese Schlüssel. Produktion und Lesend erhalten
über den Phase-8-Endpunkt keine finanziellen Erlöswerte. Jede Abfrage und Mutation respektiert
zusätzlich den Location-Scope. Nicht zugängliche oder tenant-fremde Ressourcen erscheinen nicht.

## REST-Ressourcen

Alle Pfade beginnen mit `/api/v1/organizations/{organizationId}`:

- `GET /events/{eventId}/revenue-plan` liest Plan, Herleitungen und Sperrgründe;
- `PATCH /events/{eventId}/revenue-plan/expected-guests` ändert den gastabhängigen Planwert;
- `POST /events/{eventId}/revenue-plan/calculation-template-preview` prüft eine spätere Übernahme;
- `POST /events/{eventId}/revenue-plan/apply-calculation-template` ersetzt den Plan bestätigt und atomar;
- `POST /events/{eventId}/revenue-plan/ticket-tiers` legt Ticketstufen samt Preisstruktur atomar an;
- `PATCH /ticket-price-tiers/{tierId}`, `/status` und `/order` bearbeiten, archivieren und sortieren;
- `POST /ticket-price-tiers/{tierId}/components` legt Preisbestandteile samt Aufteilungen an;
- `PATCH /ticket-price-components/{componentId}`, `/status` und `/order` bearbeiten, archivieren und sortieren;
- `POST /events/{eventId}/revenue-plan/additional-revenues` legt weitere Erlöse an;
- `PATCH /additional-revenues/{revenueId}`, `/status` und `/order` bearbeiten, archivieren und sortieren;
- `/revenue-templates/tax-rates` verwaltet Steuersatz-Vorlagen;
- `/revenue-templates/ticket-providers` verwaltet, dupliziert und archiviert Ticketanbieter-Vorlagen;
- `/revenue-templates/calculations` verwaltet, dupliziert und archiviert Kalkulationsvorlagen;
- `POST /revenue-templates/calculations/from-event/{eventId}` speichert eine Event-Momentaufnahme als Vorlage.

OpenAPI und `@venue/api-client` enthalten alle Pfade, Bodies und Antworttypen.

## Oberfläche

Die Event-Tabs Übersicht, Bookings, Auftrittsplan und Kalkulation stehen auf jeder Detailansicht
direkt unter dem Event-Kopf. Event → Kalkulation beginnt ohne doppelte Großüberschrift mit einer
kompakten Ergebnisleiste. Darunter folgen über die volle verfügbare Breite zuerst `Kosten` und dann
`Tickets & Erlöse`. Die normale Kostenansicht ist eine dichte, Excel-artige Lesetabelle mit
Kategorien, Positionen, Zwischensummen, Gesamtsumme und zentralen Aktionsmenüs; Eingabefelder
erscheinen erst nach `Bearbeiten`. Eine dezente Spalte `IST folgt später` bereitet die spätere
Nachkalkulation ausschließlich visuell vor und speichert keine Ist-Werte. Der Status steht dezent
in der Ergebnisleiste. Tabellenraster zeigen Ticketmenge, Netto-/Bruttogrundpreis,
Endkundenpreis und Gesamtwerte. Preisstruktur, Empfänger-Aufteilungen und weitere Erlöse sind
zunächst eingeklappt und bleiben vollständig erreichbar.

`Ticketstufe hinzufügen` öffnet einen gemeinsamen Dialog für Stufenname, erwartete Menge,
Grundpreis, Steuersatz-Vorlage, optionale Ticketanbieter-Vorlage, vollständige Preisstruktur und
Empfänger-Aufteilungen. Technische Reihenfolgen sind keine Anlagefelder; der Server vergibt sie
automatisch. Spätere Umsortierung erfolgt über beschriftete, tastaturbedienbare Listenaktionen.
Native aufklappbare Detailzeilen erklären Preisstruktur und wirtschaftliche Empfänger.
Bearbeitungen laufen in zugänglichen Dialogen mit eindeutigen Screenreader-Namen, darunter die
exakte Textbox `Betrag €`, Escape-/Backdrop-Schließen und Fokusführung. Aktionsmenüs verwenden das
gemeinsame tastaturbedienbare `⋯`-Muster. Tabellen sind innerhalb klar gekennzeichneter Bereiche
lokal scrollbar; bei 390 Pixeln bleibt die Seite selbst ohne globales `overflow-x: hidden` frei von
horizontalem Überlauf.

`Ticketing-Aufschlüsselung erstellen` erzeugt im Browser eine gemeinsame, kopierbare Übersicht
aller aktiven Ticketstufen des Events. Sie enthält Veranstaltung, Datum, Location, vorhandene
Ticketanbieter-Snapshots, Versandhinweis sowie je Stufe Grundpreis netto, Steuerdifferenz,
Grundpreis brutto, Preisbestandteile, Ticketanbieterpreis und den aus den gespeicherten Planwerten
ableitbaren Gastpreis. Checkout-Gebühren werden nur dann als getrennte Daten gezeigt, wenn sie im
Event tatsächlich strukturiert vorliegen; andernfalls kennzeichnet die Übersicht diesen Punkt
ehrlich als durch den Ticketanbieter zu ergänzen. Die Aktion übergibt Text, integriert aber keinen
Ticketanbieter und verändert keine Kalkulationsdaten.

## Bewusst offen

Nicht implementiert sind externe Ticketanbieter, Imports, tatsächliche Verkäufe oder Besucher,
Refundierungen, Zahlungsabwicklung, Auszahlungsläufe, Rechnungen, Gutschriften, Buchhaltung,
Verträge, Dealmodelle, Vermietungsmodelle, Dokumente, allgemeine JSON-/EAV-Systeme und
automatische steuerliche Bewertung. Diese späteren Funktionen dürfen die Phase-8-Planwerte als
Planungsquelle verwenden, müssen Ist-Daten aber in getrennten Fachmodellen führen.
