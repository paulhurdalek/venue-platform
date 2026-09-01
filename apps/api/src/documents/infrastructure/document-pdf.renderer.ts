export interface DocumentPdfPosition {
  position: number;
  description: string;
  quantity: string;
  unitPriceNetMinor: string;
  discountNetMinor: string;
  taxRateBasisPoints: number;
  totalNetMinor: string;
}

export interface DocumentPdfScheduleRow {
  startTime: string | null;
  label: string;
  note?: string | null;
  durationMinutes: number | null;
  kind: 'PERFORMANCE' | 'BREAK';
}

export interface DocumentPdfModel {
  type: 'OFFER' | 'PRODUCTION_INFORMATION';
  documentNumber: string | null;
  version: number;
  status: string;
  createdAt: string;
  title: string;
  organizationName: string;
  organizationContact?: string | null | undefined;
  eventName: string;
  eventDate: string;
  locationName: string;
  localTimes: Array<{ label: string; value: string }>;
  recipient?:
    | {
        name: string;
        contactName?: string | null;
        email?: string | null;
        address?: string | null;
      }
    | null
    | undefined;
  validUntil?: string | null | undefined;
  introduction?: string | null | undefined;
  blocks: Array<{ heading: string; body: string }>;
  positions?: DocumentPdfPosition[] | undefined;
  totals?:
    | {
        subtotalNetMinor: string;
        positionDiscountNetMinor: string;
        totalDiscountNetMinor: string;
        totalNetMinor: string;
        taxGroups: Array<{ taxRateBasisPoints: number; taxMinor: string }>;
        totalGrossMinor: string;
      }
    | undefined;
  standardTerms?: string | null | undefined;
  closing?: string | null | undefined;
  footer?: string | null | undefined;
  scheduleRows?: DocumentPdfScheduleRow[] | undefined;
}

type Font = 'regular' | 'bold';
type Page = { commands: string[] };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const RIGHT = 42;
const BODY_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const CONTENT_TOP = 754;
const CONTENT_BOTTOM = 66;
const NAVY = '#18324a';
const INK = '#111827';
const MUTED = '#64748b';
const RULE = '#d9e1e7';
const SOFT = '#f4f7f9';
const SCHEDULE_STRIPE = '#eef4f7';

export function renderDocumentPdf(model: DocumentPdfModel): Buffer {
  const layout = new PdfLayout(model);
  layout.render();
  return serializePdf(layout.pageContents());
}

export function inspectDocumentPdfLayout(model: DocumentPdfModel): {
  pageCount: number;
  tableHeaderCount: number;
  hasMasthead: boolean;
  hasTotals: boolean;
} {
  const layout = new PdfLayout(model);
  layout.render();
  const contents = layout.pageContents().map((content) => content.toString('latin1'));
  const tableHeader = model.type === 'OFFER' ? 'BEZEICHNUNG' : 'PROGRAMMPUNKT';
  return {
    pageCount: contents.length,
    tableHeaderCount: contents.reduce(
      (count, content) => count + (content.match(new RegExp(tableHeader, 'g')) ?? []).length,
      0,
    ),
    hasMasthead: contents.every((content) =>
      model.type === 'OFFER'
        ? content.includes(typeHeading(model.type))
        : content.includes(model.organizationName),
    ),
    hasTotals: contents.some((content) => content.includes('Gesamt brutto')),
  };
}

class PdfLayout {
  private readonly pages: Page[] = [];
  private page!: Page;
  private y = CONTENT_TOP;

  constructor(private readonly model: DocumentPdfModel) {}

  render(): void {
    this.newPage();
    this.identity();
    if (this.model.type === 'OFFER') this.offer();
    else this.schedule();
  }

  pageContents(): Buffer[] {
    return this.pages.map((page, index) => {
      const pageNumber = index + 1;
      page.commands.push(
        lineCommand(LEFT, 49, PAGE_WIDTH - RIGHT, 49, RULE),
        textCommand(
          this.model.footer ?? this.model.organizationContact ?? this.model.organizationName,
          LEFT,
          31,
          7.5,
          'regular',
          MUTED,
        ),
        rightTextCommand(
          `Seite ${pageNumber} von ${this.pages.length}`,
          PAGE_WIDTH - RIGHT,
          31,
          7.5,
          'regular',
          MUTED,
        ),
      );
      return winAnsiBuffer(page.commands.join('\n'));
    });
  }

  private newPage(): void {
    this.page = { commands: [] };
    this.pages.push(this.page);
    this.page.commands.push(
      fillRectCommand(0, PAGE_HEIGHT - 62, PAGE_WIDTH, 62, NAVY),
      textCommand(this.model.organizationName, LEFT, PAGE_HEIGHT - 37, 13, 'bold', '#ffffff'),
      ...(this.model.type === 'OFFER'
        ? [
            rightTextCommand(
              typeHeading(this.model.type),
              PAGE_WIDTH - RIGHT,
              PAGE_HEIGHT - 37,
              9,
              'bold',
              '#dbeafe',
            ),
          ]
        : []),
    );
    this.y = CONTENT_TOP;
  }

  private ensureSpace(height: number): boolean {
    if (this.y - height >= CONTENT_BOTTOM) return false;
    this.newPage();
    return true;
  }

  private identity(): void {
    const titleLines = wrapToWidth(this.model.title, 285, 25, 'bold');
    const height = Math.max(78, titleLines.length * 28 + 28);
    this.ensureSpace(height);
    let titleY = this.y;
    for (const title of titleLines) {
      this.page.commands.push(textCommand(title, LEFT, titleY, 25, 'bold', NAVY));
      titleY -= 28;
    }
    if (this.model.type === 'OFFER') {
      const number = this.model.documentNumber ?? 'ENTWURF - Nummer wird bei Übergabe vergeben';
      this.page.commands.push(textCommand(number, LEFT, titleY - 4, 9.5, 'regular', MUTED));
    }

    const infoX = 365;
    const valueX = 418;
    const eventLines = wrapToWidth(this.model.eventName, PAGE_WIDTH - RIGHT - valueX, 9.5, 'bold');
    const information: Array<[string, string[]]> = [
      ['Event', eventLines],
      ['Datum', [formatDate(this.model.eventDate)]],
      ['Location', wrapToWidth(this.model.locationName, PAGE_WIDTH - RIGHT - valueX, 9.5)],
    ];
    let infoY = this.y - 2;
    for (const [label, values] of information) {
      this.page.commands.push(textCommand(label, infoX, infoY, 7.5, 'regular', MUTED));
      values.forEach((value, index) =>
        this.page.commands.push(
          textCommand(
            value,
            valueX,
            infoY - index * 11,
            9.5,
            index === 0 ? 'bold' : 'regular',
            INK,
          ),
        ),
      );
      infoY -= Math.max(20, values.length * 11 + 6);
    }
    this.y -= height;
  }

  private offer(): void {
    if (this.model.recipient) this.recipient();
    if (this.model.introduction) this.textSection('Einleitung', this.model.introduction);
    for (const block of this.model.blocks) this.textSection(block.heading, block.body);
    if (this.model.positions?.length) this.offerTable(this.model.positions);
    if (this.model.totals) this.totals();
    if (this.model.standardTerms) this.textSection('Bedingungen', this.model.standardTerms);
    if (this.model.closing) this.textSection('Schlussformel', this.model.closing);
  }

  private recipient(): void {
    const recipient = this.model.recipient!;
    const lines = [
      { text: recipient.name, font: 'bold' as const },
      ...(recipient.contactName ? [{ text: recipient.contactName, font: 'regular' as const }] : []),
      ...(recipient.address ?? '')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((text) => ({ text, font: 'regular' as const })),
      ...(recipient.email ? [{ text: recipient.email, font: 'regular' as const }] : []),
      ...(this.model.validUntil
        ? [{ text: `Gültig bis ${formatDate(this.model.validUntil)}`, font: 'regular' as const }]
        : []),
    ];
    const height = 32 + lines.length * 14;
    this.sectionHeading('Empfänger', height);
    for (const [index, line] of lines.entries()) {
      this.page.commands.push(
        textCommand(
          line.text,
          LEFT,
          this.y,
          9.5,
          line.font,
          index === lines.length - 1 ? NAVY : INK,
        ),
      );
      this.y -= 14;
    }
    this.y -= 4;
  }

  private textSection(title: string, value: string): void {
    const lines = value
      .split(/\r?\n/)
      .flatMap((paragraph) => wrapToWidth(paragraph || ' ', BODY_WIDTH, 9.5, 'regular'));
    this.sectionHeading(title, Math.min(lines.length, 2) * 13 + 28);
    for (const line of lines) {
      this.ensureSpace(18);
      this.page.commands.push(textCommand(line, LEFT, this.y, 9.5, 'regular', INK));
      this.y -= 13;
    }
    this.y -= 8;
  }

  private sectionHeading(title: string, followingHeight = 24): void {
    this.ensureSpace(34 + followingHeight);
    this.page.commands.push(
      lineCommand(LEFT, this.y, PAGE_WIDTH - RIGHT, this.y, RULE),
      textCommand(title, LEFT, this.y - 19, 10.5, 'bold', NAVY),
    );
    this.y -= 34;
  }

  private offerTable(positions: DocumentPdfPosition[]): void {
    this.sectionHeading('Angebotspositionen', 50);
    this.offerTableHeader();
    for (const position of positions) {
      const description = wrapToWidth(position.description, 142, 8.2, 'regular');
      const rowHeight = Math.max(29, description.length * 10 + 12);
      if (this.ensureSpace(rowHeight + 8)) {
        this.page.commands.push(
          textCommand('Angebotspositionen - Fortsetzung', LEFT, this.y, 10.5, 'bold', NAVY),
        );
        this.y -= 22;
        this.offerTableHeader();
      }
      this.offerTableRow(position, description, rowHeight);
    }
    this.y -= 6;
  }

  private offerTableHeader(): void {
    const height = 24;
    this.page.commands.push(fillRectCommand(LEFT, this.y - height, BODY_WIDTH, height, SOFT));
    for (const column of offerColumns()) {
      this.page.commands.push(
        textCommand(column.heading, column.x + 4, this.y - 15, 6.5, 'bold', NAVY),
      );
    }
    this.page.commands.push(
      lineCommand(LEFT, this.y - height, PAGE_WIDTH - RIGHT, this.y - height, RULE),
    );
    this.y -= height;
  }

  private offerTableRow(
    position: DocumentPdfPosition,
    description: string[],
    height: number,
  ): void {
    const columns = offerColumns();
    const baseline = this.y - 17;
    this.page.commands.push(
      textCommand(String(position.position), columns[0]!.x + 4, baseline, 8, 'regular', INK),
    );
    description.forEach((line, index) =>
      this.page.commands.push(
        textCommand(line, columns[1]!.x + 4, baseline - index * 10, 8, 'regular', INK),
      ),
    );
    const values = [
      position.quantity,
      formatMoney(position.unitPriceNetMinor),
      formatRate(position.taxRateBasisPoints),
      BigInt(position.discountNetMinor) > 0n ? formatMoney(position.discountNetMinor) : '-',
      formatMoney(position.totalNetMinor),
    ];
    values.forEach((value, index) => {
      const column = columns[index + 2]!;
      this.page.commands.push(
        rightTextCommand(value, column.x + column.width - 4, baseline, 7.6, 'regular', INK),
      );
    });
    this.page.commands.push(
      lineCommand(LEFT, this.y - height, PAGE_WIDTH - RIGHT, this.y - height, RULE),
    );
    this.y -= height;
  }

  private totals(): void {
    const totals = this.model.totals!;
    const rows: Array<{ label: string; value: string; strong?: boolean; negative?: boolean }> = [
      { label: 'Zwischensumme netto', value: formatMoney(totals.subtotalNetMinor) },
      ...(BigInt(totals.positionDiscountNetMinor) > 0n
        ? [
            {
              label: 'Positionsrabatte',
              value: `-${formatMoney(totals.positionDiscountNetMinor)}`,
              negative: true,
            },
          ]
        : []),
      ...(BigInt(totals.totalDiscountNetMinor) > 0n
        ? [
            {
              label: 'Gesamtrabatt',
              value: `-${formatMoney(totals.totalDiscountNetMinor)}`,
              negative: true,
            },
          ]
        : []),
      { label: 'Gesamt netto', value: formatMoney(totals.totalNetMinor) },
      ...totals.taxGroups.map((group) => ({
        label: `Umsatzsteuer ${formatRate(group.taxRateBasisPoints)}`,
        value: formatMoney(group.taxMinor),
      })),
      { label: 'Gesamt brutto', value: formatMoney(totals.totalGrossMinor), strong: true },
    ];
    this.ensureSpace(rows.length * 18 + 20);
    const x = 320;
    const right = PAGE_WIDTH - RIGHT;
    for (const row of rows) {
      if (row.strong)
        this.page.commands.push(lineCommand(x, this.y + 14, right, this.y + 14, NAVY, 1.2));
      this.page.commands.push(
        textCommand(
          row.label,
          x,
          this.y,
          row.strong ? 10 : 8.5,
          row.strong ? 'bold' : 'regular',
          row.negative ? MUTED : INK,
        ),
        rightTextCommand(
          row.value,
          right,
          this.y,
          row.strong ? 11 : 9,
          row.strong ? 'bold' : 'regular',
          row.strong ? NAVY : INK,
        ),
      );
      this.y -= row.strong ? 22 : 18;
    }
    this.y -= 4;
  }

  private schedule(): void {
    this.y -= 12;
    this.scheduleTable(this.model.scheduleRows ?? []);
  }

  private scheduleTable(rows: DocumentPdfScheduleRow[]): void {
    this.scheduleTableHeader();
    if (rows.length === 0) {
      this.page.commands.push(
        textCommand(
          'Noch keine Programmpunkte hinterlegt.',
          LEFT + 5,
          this.y - 17,
          9,
          'regular',
          MUTED,
        ),
      );
      this.y -= 31;
      return;
    }
    for (const [index, row] of rows.entries()) {
      const labelLines = wrapToWidth(row.label, 175, 9, row.kind === 'BREAK' ? 'regular' : 'bold');
      const noteLines = wrapToWidth(row.note ?? '-', 180, 8.5);
      const height = Math.max(31, labelLines.length * 11 + 12, noteLines.length * 10 + 12);
      if (this.ensureSpace(height + 8)) {
        this.scheduleTableHeader();
      }
      const baseline = this.y - 18;
      this.page.commands.push(
        fillRectCommand(
          LEFT,
          this.y - height,
          BODY_WIDTH,
          height,
          index % 2 === 0 ? '#ffffff' : SCHEDULE_STRIPE,
        ),
        textCommand(row.startTime ?? '-', LEFT + 5, baseline, 8.5, 'bold', INK),
      );
      labelLines.forEach((line, index) =>
        this.page.commands.push(
          textCommand(
            line,
            LEFT + 75,
            baseline - index * 11,
            9,
            row.kind === 'BREAK' ? 'regular' : 'bold',
            INK,
          ),
        ),
      );
      this.page.commands.push(
        rightTextCommand(
          row.durationMinutes ? `${row.durationMinutes} Min.` : '-',
          LEFT + 316,
          baseline,
          8.5,
          'regular',
          INK,
        ),
        ...noteLines.map((line, noteIndex) =>
          textCommand(line, LEFT + 324, baseline - noteIndex * 10, 8.5, 'regular', MUTED),
        ),
        lineCommand(LEFT, this.y - height, PAGE_WIDTH - RIGHT, this.y - height, RULE),
      );
      this.y -= height;
    }
  }

  private scheduleTableHeader(): void {
    const height = 24;
    this.page.commands.push(
      fillRectCommand(LEFT, this.y - height, BODY_WIDTH, height, SOFT),
      textCommand('START', LEFT + 5, this.y - 15, 6.5, 'bold', NAVY),
      textCommand('PROGRAMMPUNKT', LEFT + 68, this.y - 15, 6.5, 'bold', NAVY),
      textCommand('DAUER', LEFT + 259, this.y - 15, 6.5, 'bold', NAVY),
      textCommand('NOTIZ', LEFT + 324, this.y - 15, 6.5, 'bold', NAVY),
      lineCommand(LEFT, this.y - height, PAGE_WIDTH - RIGHT, this.y - height, RULE),
    );
    this.y -= height;
  }
}

function offerColumns(): Array<{ heading: string; x: number; width: number }> {
  const definitions: Array<[string, number]> = [
    ['POS.', 30],
    ['BEZEICHNUNG', 154],
    ['MENGE', 45],
    ['EINZEL NETTO', 74],
    ['UST.', 42],
    ['RABATT', 64],
    ['GESAMT NETTO', 102],
  ];
  let x = LEFT;
  return definitions.map(([heading, width]) => {
    const column = { heading, x, width };
    x += width;
    return column;
  });
}

function typeHeading(type: DocumentPdfModel['type']): string {
  return type === 'OFFER' ? 'ANGEBOT' : 'ABLAUF';
}

function fillRectCommand(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): string {
  const [r, g, b] = colorToRgb(color);
  return `q ${r} ${g} ${b} rg ${x} ${y} ${width} ${height} re f Q`;
}

function lineCommand(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 0.6,
): string {
  const [r, g, b] = colorToRgb(color);
  return `q ${r} ${g} ${b} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function textCommand(
  text: string,
  x: number,
  y: number,
  size: number,
  font: Font,
  color: string,
): string {
  const [r, g, b] = colorToRgb(color);
  return `BT /${font === 'bold' ? 'F2' : 'F1'} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
}

function rightTextCommand(
  text: string,
  right: number,
  y: number,
  size: number,
  font: Font,
  color: string,
): string {
  return textCommand(text, right - approximateTextWidth(text, size, font), y, size, font, color);
}

function approximateTextWidth(value: string, size: number, font: Font): number {
  return [...value].reduce((total, character) => {
    const factor = /[MW@%]/.test(character) ? 0.82 : /[ilI1.,: ]/.test(character) ? 0.28 : 0.53;
    return total + size * factor * (font === 'bold' ? 1.03 : 1);
  }, 0);
}

function wrapToWidth(value: string, width: number, size: number, font: Font = 'regular'): string[] {
  const normalized = value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of normalized.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || approximateTextWidth(candidate, size, font) <= width) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function serializePdf(contents: Buffer[]): Buffer {
  const pageIds = contents.map((_, index) => 5 + index * 2);
  const contentIds = contents.map((_, index) => 6 + index * 2);
  const objects = new Map<number, Buffer>();
  objects.set(1, ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(
    2,
    ascii(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    ),
  );
  objects.set(
    3,
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
  );
  objects.set(
    4,
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
  );
  contents.forEach((content, index) => {
    objects.set(
      pageIds[index]!,
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
      ),
    );
    objects.set(
      contentIds[index]!,
      Buffer.concat([
        ascii(`<< /Length ${content.length} >>\nstream\n`),
        content,
        ascii('\nendstream'),
      ]),
    );
  });
  const count = Math.max(...objects.keys());
  const chunks: Buffer[] = [ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = new Array<number>(count + 1).fill(0);
  let offset = chunks[0]!.length;
  for (let id = 1; id <= count; id += 1) {
    const body = objects.get(id)!;
    offsets[id] = offset;
    const object = Buffer.concat([ascii(`${id} 0 obj\n`), body, ascii('\nendobj\n')]);
    chunks.push(object);
    offset += object.length;
  }
  const xrefOffset = offset;
  chunks.push(
    ascii(
      [
        `xref\n0 ${count + 1}\n`,
        '0000000000 65535 f \n',
        ...offsets.slice(1).map((value) => `${value.toString().padStart(10, '0')} 00000 n \n`),
        `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      ].join(''),
    ),
  );
  return Buffer.concat(chunks);
}

function formatMoney(value: string): string {
  const minor = BigInt(value);
  const absolute = minor < 0n ? -minor : minor;
  const euros = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, '0');
  const grouped = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(euros);
  return `${minor < 0n ? '-' : ''}${grouped},${cents} €`;
}

function formatRate(basisPoints: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(basisPoints / 100)} %`;
}

function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function escapePdfText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function colorToRgb(hex: string): [string, string, string] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) / 255).toFixed(3),
    (((value >> 8) & 255) / 255).toFixed(3),
    ((value & 255) / 255).toFixed(3),
  ];
}

function winAnsiBuffer(value: string): Buffer {
  const replacements: Record<string, number> = {
    '€': 128,
    '‚': 130,
    '„': 132,
    '…': 133,
    '†': 134,
    '‡': 135,
    '‰': 137,
    Š: 138,
    '‹': 139,
    Œ: 140,
    Ž: 142,
    '‘': 145,
    '’': 146,
    '“': 147,
    '”': 148,
    '•': 149,
    '–': 150,
    '—': 151,
    '™': 153,
    š: 154,
    '›': 155,
    œ: 156,
    ž: 158,
    Ÿ: 159,
  };
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes.push(code <= 255 ? code : (replacements[character] ?? 63));
  }
  return Buffer.from(bytes);
}

function ascii(value: string): Buffer {
  return Buffer.from(value, 'latin1');
}
