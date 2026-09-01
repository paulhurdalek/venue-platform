import { describe, expect, it } from 'vitest';

import {
  inspectDocumentPdfLayout,
  renderDocumentPdf,
  type DocumentPdfModel,
} from './document-pdf.renderer.js';

const offer: DocumentPdfModel = {
  type: 'OFFER',
  documentNumber: 'ANG-2027-TEST0001',
  version: 2,
  status: 'UEBERGEBEN',
  createdAt: '2027-04-01T12:00:00.000Z',
  title: 'Angebot für das Frühlingsfestival',
  organizationName: 'Kulturhaus Beispiel GmbH',
  organizationContact: 'kontakt@example.test | +49 30 123456',
  eventName: 'Frühlingsfestival',
  eventDate: '2027-05-20',
  locationName: 'Großer Saal',
  localTimes: [
    { label: 'Einlass', value: '18:00' },
    { label: 'Beginn', value: '20:00' },
  ],
  recipient: {
    name: 'Beispielveranstalter GmbH',
    contactName: 'Rita Beispiel',
    email: 'rita@example.test',
    address: 'Musterstraße 1\n10115 Berlin',
  },
  validUntil: '2027-04-30',
  introduction: 'Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen folgende Leistungen an.',
  blocks: [{ heading: 'Leistungsumfang', body: 'Bereitstellung des Saals und der Grundtechnik.' }],
  positions: [
    {
      position: 1,
      description: 'Saalmiete einschließlich Bestuhlung',
      quantity: '1',
      unitPriceNetMinor: '100000',
      discountNetMinor: '10000',
      taxRateBasisPoints: 1900,
      totalNetMinor: '90000',
    },
  ],
  totals: {
    subtotalNetMinor: '100000',
    positionDiscountNetMinor: '10000',
    totalDiscountNetMinor: '0',
    totalNetMinor: '90000',
    taxGroups: [{ taxRateBasisPoints: 1900, taxMinor: '17100' }],
    totalGrossMinor: '107100',
  },
  standardTerms: 'Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt.',
  closing: 'Wir freuen uns auf Ihre Rückmeldung.',
  footer: 'Kulturhaus Beispiel GmbH · Berlin',
};

describe('document PDF renderer', () => {
  it('produces a self-contained, deterministic PDF without internal notes', () => {
    const first = renderDocumentPdf(offer);
    const second = renderDocumentPdf(offer);
    const text = first.toString('latin1');

    expect(first.equals(second)).toBe(true);
    expect(first.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(text).toContain('ANG-2027-TEST0001');
    expect(text).toContain('Gesamt brutto');
    expect(text).not.toContain('Interne Kalkulation');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('keeps the filled offer table visually structured across page breaks', () => {
    const filledOffer: DocumentPdfModel = {
      ...offer,
      positions: Array.from({ length: 64 }, (_, index) => ({
        ...offer.positions![0]!,
        position: index + 1,
        description: `Leistung ${index + 1} mit einer ausreichend langen und prüfbaren Bezeichnung`,
      })),
    };
    const contract = inspectDocumentPdfLayout(filledOffer);
    const text = renderDocumentPdf(filledOffer).toString('latin1');

    expect(contract).toMatchObject({ hasMasthead: true, hasTotals: true });
    expect(contract.pageCount).toBeGreaterThan(2);
    expect(contract.tableHeaderCount).toBeGreaterThan(1);
    expect(text).toContain('BEZEICHNUNG');
    expect(text).toContain('GESAMT NETTO');
    expect(text).toContain('Zwischensumme netto');
  });

  it('renders a compact, striped Ablauf without document administration fields', () => {
    const model: DocumentPdfModel = {
      ...offer,
      type: 'PRODUCTION_INFORMATION',
      documentNumber: 'ABL-2027-0001',
      recipient: null,
      validUntil: null,
      positions: [],
      totals: undefined,
      scheduleRows: Array.from({ length: 100 }, (_, index) => ({
        startTime: `${String(10 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
        label: `Künstler ${index + 1}`,
        note: index % 5 === 4 ? 'Umbau Bühne links und Gitarre vorbereiten' : null,
        durationMinutes: 15,
        kind: index % 5 === 4 ? 'BREAK' : 'PERFORMANCE',
      })),
    };
    const contract = inspectDocumentPdfLayout(model);
    const pdf = renderDocumentPdf(model);
    const text = pdf.toString('latin1');

    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(contract.tableHeaderCount).toBeGreaterThan(1);
    expect(text).toContain('Seite 1 von');
    expect(text).toContain('PROGRAMMPUNKT');
    expect(text).toContain('NOTIZ');
    expect(text).toContain('Umbau Bühne links und Gitarre vorbereiten');
    expect(text).toContain('0.933 0.957 0.969 rg');
    expect(text).not.toContain('ABL-2027-0001');
    expect(text).not.toContain('Get-in Technik');
    expect(text).not.toContain('PAUSE / UMBAU');
    expect(text).not.toContain('Kontakte');
    expect(text).not.toContain('Technik, Personal und Leistungen');
  });

  it('emits duplicate artists only for separate, ordered program positions', () => {
    const text = renderDocumentPdf({
      ...offer,
      type: 'PRODUCTION_INFORMATION',
      documentNumber: 'ABL-2027-0002',
      recipient: null,
      validUntil: null,
      positions: [],
      totals: undefined,
      scheduleRows: [
        { startTime: '20:00', label: 'Pow', durationMinutes: 45, kind: 'PERFORMANCE' },
        {
          startTime: '20:45',
          label: 'Pause',
          note: 'Pause zwischen den Sets',
          durationMinutes: 15,
          kind: 'BREAK',
        },
        { startTime: '21:00', label: 'Pow', durationMinutes: 45, kind: 'PERFORMANCE' },
      ],
    }).toString('latin1');

    expect(text.match(/Pow/g) ?? []).toHaveLength(2);
    const firstPow = text.indexOf('Pow');
    const pause = text.indexOf('Pause zwischen den Sets');
    const secondPow = text.indexOf('Pow', firstPow + 1);
    expect(firstPow).toBeGreaterThan(-1);
    expect(pause).toBeGreaterThan(firstPow);
    expect(secondPow).toBeGreaterThan(pause);
  });

  it('renders an explicit Ablauf note without reinterpreting the program item label', () => {
    const text = renderDocumentPdf({
      ...offer,
      type: 'PRODUCTION_INFORMATION',
      documentNumber: 'ABL-2027-0003',
      recipient: null,
      validUntil: null,
      positions: [],
      totals: undefined,
      scheduleRows: [
        {
          startTime: '20:00',
          label: 'Umbauzeit',
          note: 'Gitarre vorbereiten und Hocker bereitstellen',
          durationMinutes: 15,
          kind: 'BREAK',
        },
      ],
    }).toString('latin1');

    expect(text).toContain('Umbauzeit');
    expect(text).toContain('Gitarre vorbereiten und Hocker bereitstellen');
  });
});
