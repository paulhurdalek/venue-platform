# Phase 9: Vermietung und Dealmodelle

Phase 9 ergänzt Veranstaltungen um ein eigenes kommerzielles Deal-Aggregat. Eventstatus,
Phase-7-Kalkulation und Phase-8-Erlösplanung bleiben unverändert. Angebote, Verträge,
Rechnungen, Zahlungen und Ist-Abrechnung sind nicht Bestandteil dieser Phase.

## Deal und Snapshots

Ein Event kann höchstens einen nicht stornierten Deal besitzen. Nach einer Stornierung ist ein
neuer Deal zulässig; der frühere Datensatz und seine Statushistorie bleiben erhalten. Ein Deal
referenziert einen aktiven Geschäftspartner und optional einen diesem Partner zugeordneten
Ansprechpartner. Kunde, Ansprechpartner, Vorlagenquelle, Bausteine, Leistungsbezeichnung,
Einheit, Menge, Preise, Steuer und Rabatte werden als fachliche Momentaufnahme gespeichert.

Der Dealstatus folgt unabhängig vom Eventstatus:

`ENTWURF → IN_VERHANDLUNG → VEREINBART → STORNIERT`.

Aus `IN_VERHANDLUNG` ist eine Rückkehr zu `ENTWURF` möglich. Jede Mutation ist optimistisch
versioniert, tenant- und location-gescopet und schreibt Auditdaten atomar. Statuswechsel besitzen
zusätzlich eine relationale Historie.

## Bausteine und Berechnung

Die relationalen Bausteine sind bewusst fest typisiert:

- feste Miete mit Nettobetrag, Steuer und Bezeichnung;
- Umsatzbeteiligung mit Location- und Gegenpartei-Anteil;
- Mindestgarantie mit Umsatzbeteiligung.

Mehrere Bausteine können kombiniert werden. Feste Miete plus Beteiligung entsteht als Summe
beider Bausteine. Location- und Gegenpartei-Anteil müssen zusammen exakt 10.000 Basispunkte
ergeben. Die Beteiligungsbasis ist ausschließlich der geplante Ticketgrundumsatz netto aus Phase 8. Weder Ticketanbietergebühren noch Garderobe, Gastro, sonstige Erlöse oder Kosten werden
automatisch einbezogen beziehungsweise abgezogen.

WKZ bleibt in Phase 8 ein frei benannter Preisstruktur-Baustein. Phase 9 erkennt ausschließlich
die normalisierten Bezeichnungen `WKZ` und `Werbekostenzuschuss`, ermittelt deren Netto-Planwert
aus der vorhandenen Ticketstruktur und addiert ihn nur, wenn der jeweilige Beteiligungsbaustein
`includeWkz` ausdrücklich setzt. Bei der Mindestgarantie zeigt das Ergebnis sowohl den berechneten
Anteil als auch die aktuell greifende Regel; für die Location gilt der höhere Nettobetrag.

Alle Geldwerte sind `BIGINT`-Minor-Units in EUR. Prozentwerte sind ganzzahlige Basispunkte.
Multiplikation, Steuer und Prozentwerte verwenden die bestehenden kaufmännischen
`HALF_UP`-Rundungsregeln.

## Leistungen und Rabatte

Deal-Leistungspositionen verwenden den bestehenden Leistungskatalog oder strukturierte freie
Snapshots. Jede Position ist `SEPARATELY_BILLABLE` oder `INCLUDED`. Enthaltene Leistungen tragen
weiterhin interne Kosten und bleiben sichtbar, erhöhen aber nie den Kundenbetrag.

Positions- und Gesamtrabatte unterstützen festen EUR-Betrag oder Prozent. Positionsrabatte sind
nur auf separat abrechenbaren Positionen zulässig. Der Gesamtrabatt wird ausschließlich auf deren
Summe nach Positionsrabatten angewendet. Miete, Umsatzbeteiligungen und enthaltene Leistungen
werden dadurch nicht verändert. Ein Rabatt darf seine Basis nicht überschreiten.

Die Ergebnisherleitung trennt Kundenbetrag, erwarteten Location-Anteil aus Beteiligung, interne
Kosten und erwartetes operatives Ergebnis.

## Dealvorlagen

Dealvorlagen sind organisationsweite, versionierte und archivierbare Aggregate mit Bausteinen,
Leistungs-Snapshots und Rabatten. Eine Übernahme beim Anlegen kopiert die Vorlage vollständig. Eine
spätere Übernahme verlangt Vorschau und `confirmReplacement: true`; sie ersetzt Bausteine,
Leistungspositionen und Rabatte vollständig und atomar. Spätere Vorlagenänderungen verändern
bestehende Deals nicht.

## REST und Oberfläche

Die API stellt Event-Deal, Dealressource, Statuswechsel, Vorlagenvorschau/-übernahme und die
organisationsweite Vorlagenverwaltung unter `/api/v1/organizations/{organizationId}` bereit.
OpenAPI und `@venue/api-client` enthalten alle Pfade und DTOs. Die Berechtigungen sind
`deals.read`, `deals.write`, `deals.status`, `deal_templates.read`, `deal_templates.write` und
`deal_templates.archive`.

Im Event steht `Vermietung & Deal` bei Fremdveranstaltungen direkt hinter der Übersicht; bei
Eigenproduktionen bleibt der Tab optional am Ende der Eventnavigation. Die normale Ansicht enthält
keine Eingabefelder. Bearbeitung, Bausteine, Leistungen und Vorlagenersetzung laufen über kompakte
Dialoge. Organisationsweite Dealvorlagen besitzen einen eigenen Sidebar-Eintrag.
