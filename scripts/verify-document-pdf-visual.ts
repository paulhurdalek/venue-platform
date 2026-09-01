import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  inspectDocumentPdfLayout,
  renderDocumentPdf,
  type DocumentPdfModel,
} from '../apps/api/src/documents/infrastructure/document-pdf.renderer.js';

const outputDirectory = resolve('tmp/pdfs/visual-regression');
const pdfPath = join(outputDirectory, 'filled-offer.pdf');
const imagePrefix = join(outputDirectory, 'filled-offer');
const schedulePdfPath = join(outputDirectory, 'long-schedule.pdf');
const scheduleImagePrefix = join(outputDirectory, 'long-schedule');
const keepArtifacts = process.env.PHASE_10_KEEP_PDF_VISUAL_ARTIFACTS === '1';
const expectedFingerprints = [
  '1111111111/1111111111/1111000100/1110000000/1110000000/1111111000/1111110000/1100100000/0110000000/0110010000/0110000000/0110010000/0110000000/0110000000',
  '1111111111/1111111111/0110111010/0110010000/0110000000/0110010000/0110000000/0110000000/0111010000/0110000000/0111010000/0110000000/0110000000/0110000000',
  '1111111111/1111111111/0110111110/0111010000/0110000000/0110010000/0110010000/0110000000/0111010000/0110000000/0111010000/0110000000/0110000000/0110000000',
  '1111111111/1111111111/0110111010/0111010000/0110000000/0110010000/0110000000/0110000000/0111010000/0110000000/0111010000/0110000000/0110000000/0110000000',
  '1111111111/1111111111/0110111010/0111010000/0110000000/0110010000/0110000000/0110000000/0111010000/0110000000/0111010000/0110000000/0110000000/0110000000',
  '1111111111/1111111111/0110111010/0111010000/0110000000/0110010000/0110011011/0000011111/1111111000/1111110000/0000000000/0000000000/0000000000/0110000000',
];

const model: DocumentPdfModel = {
  type: 'OFFER',
  documentNumber: 'ANG-2099-0042',
  version: 3,
  status: 'UEBERGEBEN',
  createdAt: '2099-04-01T12:00:00.000Z',
  title: 'Vermietungsangebot für das große Frühlingsfestival',
  organizationName: 'Kulturhaus Bühne & Saal GmbH',
  organizationContact: 'angebot@kulturhaus.example · +49 30 123456',
  eventName: 'Frühlingsfestival mit Künstler:innen',
  eventDate: '2099-05-20',
  locationName: 'Großer Saal',
  localTimes: [
    { label: 'Einlass', value: '18:00' },
    { label: 'Beginn', value: '20:00' },
  ],
  recipient: {
    name: 'Beispielveranstalter GmbH',
    contactName: 'Rita Beispiel',
    email: 'rita.beispiel@example.test',
    address: 'Musterstraße 1\n10115 Berlin',
  },
  validUntil: '2099-04-30',
  introduction:
    'Vielen Dank für Ihre Anfrage. Gern bieten wir Ihnen die folgenden externen Leistungen an.',
  blocks: [
    {
      heading: 'Leistungsumfang',
      body: 'Bereitstellung des Saals, der Grundtechnik und des vereinbarten Personals.',
    },
  ],
  positions: Array.from({ length: 72 }, (_, index) => ({
    position: index + 1,
    description: `Leistung ${index + 1}: Technik, Personal und Ausstattung für Veranstaltungsbereich ${(index % 5) + 1}`,
    quantity: index % 3 === 0 ? '2' : '1',
    unitPriceNetMinor: String(25_000 + index * 137),
    discountNetMinor: index % 7 === 0 ? '2500' : '0',
    taxRateBasisPoints: 1_900,
    totalNetMinor: String(25_000 + index * 137 - (index % 7 === 0 ? 2_500 : 0)),
  })),
  totals: {
    subtotalNetMinor: '2475000',
    positionDiscountNetMinor: '27500',
    totalDiscountNetMinor: '50000',
    totalNetMinor: '2397500',
    taxGroups: [{ taxRateBasisPoints: 1_900, taxMinor: '455525' }],
    totalGrossMinor: '2853025',
  },
  standardTerms:
    'Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt. Änderungen bedürfen der Textform.',
  closing: 'Wir freuen uns auf Ihre Rückmeldung und eine erfolgreiche Veranstaltung.',
  footer: 'Kulturhaus Bühne & Saal GmbH · Berlin',
};

const scheduleModel: DocumentPdfModel = {
  ...model,
  type: 'PRODUCTION_INFORMATION',
  documentNumber: 'ABL-2099-0042',
  title: 'Ablauf für das große Frühlingsfestival',
  recipient: null,
  validUntil: null,
  positions: [],
  totals: undefined,
  scheduleRows: Array.from({ length: 80 }, (_, index) => ({
    startTime: `${String(16 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
    label: index % 6 === 2 ? 'Pause' : `Künstler ${index + 1}`,
    note:
      index % 6 === 2
        ? 'Umbau Bühne links, Hocker bereitstellen und Gitarre vorbereiten'
        : index % 7 === 0
          ? 'Kurzer Soundcheck vor dem Auftritt'
          : null,
    durationMinutes: 15,
    kind: index % 6 === 2 ? 'BREAK' : 'PERFORMANCE',
  })),
};

mkdirSync(outputDirectory, { recursive: true });
try {
  const contract = inspectDocumentPdfLayout(model);
  assert.ok(contract.pageCount >= 3, 'the filled visual fixture must span at least three pages');
  assert.equal(contract.tableHeaderCount, contract.pageCount);
  assert.equal(contract.hasMasthead, true);
  assert.equal(contract.hasTotals, true);

  writeFileSync(pdfPath, renderDocumentPdf(model));
  try {
    execFileSync(
      'pdftoppm',
      ['-gray', '-r', '72', '-aa', 'no', '-aaVector', 'no', pdfPath, imagePrefix],
      { stdio: 'pipe' },
    );
  } catch (error) {
    throw new Error(
      `Poppler pdftoppm is required for the PDF visual regression test: ${String(error)}`,
      { cause: error },
    );
  }

  const images = readdirSync(outputDirectory)
    .filter((name) => /^filled-offer-\d+\.pgm$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => readPgm(join(outputDirectory, name)));
  assert.equal(images.length, contract.pageCount);

  for (const [index, image] of images.entries()) {
    assert.deepEqual(
      { width: image.width, height: image.height },
      { width: 595, height: 842 },
      `page ${index + 1} must rasterize to A4 at 72 DPI`,
    );
    assert.ok(
      darkRatio(image, 0, 0, image.width, 61, 110) > 0.85,
      `page ${index + 1} must retain the dark masthead`,
    );
    assert.ok(
      darkRatio(image, 35, 65, image.width - 70, 710, 210) > 0.008,
      `page ${index + 1} must contain visible document content`,
    );
    assert.equal(
      darkRatio(image, 0, image.height - 8, image.width, 8, 245),
      0,
      `page ${index + 1} must not clip content at the bottom edge`,
    );
  }

  const fingerprints = images.map(tileFingerprint);
  process.stdout.write(`${fingerprints.join('\n')}\n`);
  assert.deepEqual(
    fingerprints,
    expectedFingerprints,
    'the rasterized PDF layout changed; inspect and intentionally update the baseline',
  );

  const scheduleContract = inspectDocumentPdfLayout(scheduleModel);
  assert.ok(scheduleContract.pageCount > 1, 'the long schedule fixture must span multiple pages');
  assert.equal(scheduleContract.tableHeaderCount, scheduleContract.pageCount);
  writeFileSync(schedulePdfPath, renderDocumentPdf(scheduleModel));
  const scheduleText = readFileSync(schedulePdfPath).toString('latin1');
  assert.ok(scheduleText.includes('PROGRAMMPUNKT'));
  assert.ok(scheduleText.includes('NOTIZ'));
  assert.ok(scheduleText.includes('Umbau Bühne links, Hocker bereitstellen'));
  assert.ok(scheduleText.includes('0.933 0.957 0.969 rg'));
  assert.ok(!scheduleText.includes('ABL-2099-0042'));
  assert.ok(!scheduleText.includes('Get-in Technik'));
  try {
    execFileSync(
      'pdftoppm',
      ['-gray', '-r', '72', '-aa', 'no', '-aaVector', 'no', schedulePdfPath, scheduleImagePrefix],
      { stdio: 'pipe' },
    );
  } catch (error) {
    throw new Error(
      `Poppler pdftoppm is required for the schedule visual regression test: ${String(error)}`,
      { cause: error },
    );
  }
  const scheduleImages = readdirSync(outputDirectory)
    .filter((name) => /^long-schedule-\d+\.pgm$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => readPgm(join(outputDirectory, name)));
  assert.equal(scheduleImages.length, scheduleContract.pageCount);
  for (const [index, image] of scheduleImages.entries()) {
    assert.deepEqual(
      { width: image.width, height: image.height },
      { width: 595, height: 842 },
      `schedule page ${index + 1} must rasterize to A4 at 72 DPI`,
    );
    assert.ok(
      darkRatio(image, 35, 65, image.width - 70, 710, 210) > 0.008,
      `schedule page ${index + 1} must contain visible table content`,
    );
  }
  process.stdout.write(
    `Phase 10 PDF visual regression passed (${images.length} offer and ${scheduleImages.length} schedule A4 pages).\n`,
  );
} finally {
  if (!keepArtifacts) rmSync(outputDirectory, { recursive: true, force: true });
}

interface GrayImage {
  width: number;
  height: number;
  pixels: Buffer;
}

function readPgm(path: string): GrayImage {
  const source = readFileSync(path);
  let offset = 0;
  const token = () => {
    while (offset < source.length) {
      if (source[offset] === 35) {
        while (offset < source.length && source[offset] !== 10) offset += 1;
      } else if (source[offset]! <= 32) offset += 1;
      else break;
    }
    const start = offset;
    while (offset < source.length && source[offset]! > 32) offset += 1;
    return source.subarray(start, offset).toString('ascii');
  };
  assert.equal(token(), 'P5');
  const width = Number(token());
  const height = Number(token());
  assert.equal(Number(token()), 255);
  while (offset < source.length && source[offset]! <= 32) offset += 1;
  const pixels = source.subarray(offset);
  assert.equal(pixels.length, width * height);
  return { width, height, pixels };
}

function darkRatio(
  image: GrayImage,
  x: number,
  y: number,
  width: number,
  height: number,
  threshold: number,
) {
  let dark = 0;
  let total = 0;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (image.pixels[row * image.width + column]! < threshold) dark += 1;
      total += 1;
    }
  }
  return dark / total;
}

function tileFingerprint(image: GrayImage) {
  const columns = 10;
  const rows = 14;
  let bits = '';
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.floor((column * image.width) / columns);
      const y = Math.floor((row * image.height) / rows);
      const width = Math.floor(((column + 1) * image.width) / columns) - x;
      const height = Math.floor(((row + 1) * image.height) / rows) - y;
      bits += darkRatio(image, x, y, width, height, 210) > 0.025 ? '1' : '0';
    }
  }
  return bits.match(/.{1,10}/g)!.join('/');
}
