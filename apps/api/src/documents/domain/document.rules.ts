import { resolveDiscount, type DiscountInput } from '../../deals/domain/deal.rules.js';
import { percentageOfMinor } from '../../revenue/domain/revenue-planning.rules.js';
import {
  calculateLineTotal,
  normalizeQuantity,
} from '../../services/domain/service-calculation.rules.js';

export const DOCUMENT_TYPES = ['OFFER', 'PRODUCTION_INFORMATION'] as const;
export const DOCUMENT_STATUSES = [
  'ENTWURF',
  'ERSTELLT',
  'UEBERGEBEN',
  'ANGENOMMEN',
  'ABGELEHNT',
  'ABGELAUFEN',
  'FREIGEGEBEN',
  'ARCHIVIERT',
] as const;
export const DOCUMENT_POSITION_SOURCES = ['DEAL_COMPONENT', 'DEAL_SERVICE', 'CUSTOM'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type DocumentPositionSource = (typeof DOCUMENT_POSITION_SOURCES)[number];

export interface OfferPositionCalculationInput {
  quantity: string;
  unitPriceNetMinor: bigint;
  taxRateBasisPoints: number;
  discount: DiscountInput;
}

export interface OfferPositionTotal {
  subtotalNetMinor: string;
  discountNetMinor: string;
  totalNetMinor: string;
  taxMinor: string;
  totalGrossMinor: string;
}

export interface OfferTotals {
  subtotalNetMinor: string;
  positionDiscountNetMinor: string;
  totalDiscountNetMinor: string;
  totalNetMinor: string;
  taxMinor: string;
  totalGrossMinor: string;
  taxGroups: Array<{
    taxRateBasisPoints: number;
    netMinor: string;
    taxMinor: string;
    grossMinor: string;
  }>;
  positions: OfferPositionTotal[];
}

export class DocumentValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

export function cleanDocumentText(
  value: string | null | undefined,
  field: string,
  maximum = 20_000,
  required = false,
): string | null {
  const cleaned = value?.normalize('NFKC').replace(/\r\n?/g, '\n').trim() ?? '';
  if (required && !cleaned) {
    throw new DocumentValidationError('DOCUMENT_TEXT_REQUIRED', `${field} ist erforderlich`);
  }
  if (cleaned.length > maximum) {
    throw new DocumentValidationError(
      'DOCUMENT_TEXT_TOO_LONG',
      `${field} darf höchstens ${maximum} Zeichen lang sein`,
    );
  }
  return cleaned || null;
}

export function normalizeTemplateName(value: string): { name: string; normalizedName: string } {
  const name = cleanDocumentText(value, 'Der Vorlagenname', 200, true)!;
  return { name, normalizedName: name.replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') };
}

export function calculateOffer(
  positions: OfferPositionCalculationInput[],
  totalDiscount: DiscountInput,
): OfferTotals {
  const lines = positions.map((position) => {
    if (position.taxRateBasisPoints < 0 || position.taxRateBasisPoints > 100_000) {
      throw new DocumentValidationError(
        'DOCUMENT_TAX_RATE_INVALID',
        'Der Umsatzsteuersatz ist ungültig',
      );
    }
    const quantity = normalizeQuantity(position.quantity);
    const subtotal = calculateLineTotal(quantity, position.unitPriceNetMinor);
    const discount = resolveDiscount(subtotal, position.discount, 'Der Positionsrabatt');
    return { ...position, quantity, subtotal, discount, net: subtotal - discount };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0n);
  const positionDiscount = lines.reduce((sum, line) => sum + line.discount, 0n);
  const netBeforeTotalDiscount = subtotal - positionDiscount;
  const resolvedTotalDiscount = resolveDiscount(
    netBeforeTotalDiscount,
    totalDiscount,
    'Der Gesamtrabatt',
  );
  const allocations = allocateProportionally(
    resolvedTotalDiscount,
    lines.map((line) => line.net),
  );
  const resolved = lines.map((line, index) => {
    const net = line.net - allocations[index]!;
    const tax = percentageOfMinor(net, line.taxRateBasisPoints);
    return { ...line, net, tax, gross: net + tax };
  });
  const groups = new Map<number, { net: bigint; tax: bigint; gross: bigint }>();
  for (const line of resolved) {
    const group = groups.get(line.taxRateBasisPoints) ?? { net: 0n, tax: 0n, gross: 0n };
    group.net += line.net;
    group.tax += line.tax;
    group.gross += line.gross;
    groups.set(line.taxRateBasisPoints, group);
  }
  return {
    subtotalNetMinor: subtotal.toString(),
    positionDiscountNetMinor: positionDiscount.toString(),
    totalDiscountNetMinor: resolvedTotalDiscount.toString(),
    totalNetMinor: resolved.reduce((sum, line) => sum + line.net, 0n).toString(),
    taxMinor: resolved.reduce((sum, line) => sum + line.tax, 0n).toString(),
    totalGrossMinor: resolved.reduce((sum, line) => sum + line.gross, 0n).toString(),
    taxGroups: [...groups.entries()]
      .sort(([left], [right]) => left - right)
      .map(([taxRateBasisPoints, value]) => ({
        taxRateBasisPoints,
        netMinor: value.net.toString(),
        taxMinor: value.tax.toString(),
        grossMinor: value.gross.toString(),
      })),
    positions: resolved.map((line) => ({
      subtotalNetMinor: line.subtotal.toString(),
      discountNetMinor: line.discount.toString(),
      totalNetMinor: line.net.toString(),
      taxMinor: line.tax.toString(),
      totalGrossMinor: line.gross.toString(),
    })),
  };
}

export function assertDocumentStatusTransition(
  type: DocumentType,
  previous: DocumentStatus,
  next: DocumentStatus,
): void {
  const offer: Partial<Record<DocumentStatus, readonly DocumentStatus[]>> = {
    ENTWURF: ['ERSTELLT'],
    ERSTELLT: ['ENTWURF'],
    UEBERGEBEN: ['ANGENOMMEN', 'ABGELEHNT', 'ABGELAUFEN'],
  };
  const production: Partial<Record<DocumentStatus, readonly DocumentStatus[]>> = {
    FREIGEGEBEN: ['ARCHIVIERT'],
  };
  const allowed = type === 'OFFER' ? offer : production;
  if (!allowed[previous]?.includes(next)) {
    throw new DocumentValidationError(
      'DOCUMENT_STATUS_TRANSITION_INVALID',
      'Dieser Dokumentstatuswechsel ist nicht erlaubt',
    );
  }
}

export function publishedStatus(type: DocumentType): DocumentStatus {
  return type === 'OFFER' ? 'UEBERGEBEN' : 'FREIGEGEBEN';
}

export function canDeleteDocumentDraft(status: DocumentStatus, versionCount: number): boolean {
  return status === 'ENTWURF' && versionCount === 0;
}

export function draftStatusAfterEdit(type: DocumentType, status: DocumentStatus): DocumentStatus {
  if (type === 'PRODUCTION_INFORMATION' && status === 'ARCHIVIERT') {
    throw new DocumentValidationError(
      'DOCUMENT_ARCHIVED',
      'Ein archivierter Ablauf kann nicht mehr bearbeitet werden',
    );
  }
  return status === 'ENTWURF' ? status : 'ENTWURF';
}

export function isOfferExpired(
  type: DocumentType,
  status: DocumentStatus,
  validUntil: Date | null,
  now = new Date(),
): boolean {
  if (type !== 'OFFER' || !validUntil || !['ERSTELLT', 'UEBERGEBEN'].includes(status)) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return validUntil.getTime() < today;
}

export function differsFromSource(
  current: {
    description: string;
    quantity: string;
    unitPriceNetMinor: string;
    taxRateBasisPoints: number;
    discountType: string | null;
    discountFixedMinor: string | null;
    discountPercentageBasisPoints: number | null;
  },
  source: unknown,
): boolean {
  if (!source || typeof source !== 'object') return false;
  const original = source as Record<string, unknown>;
  return (
    current.description !== original.description ||
    normalizeQuantity(current.quantity) !== original.quantity ||
    current.unitPriceNetMinor !== original.unitPriceNetMinor ||
    current.taxRateBasisPoints !== original.taxRateBasisPoints ||
    current.discountType !== (original.discountType ?? null) ||
    current.discountFixedMinor !== (original.discountFixedMinor ?? null) ||
    current.discountPercentageBasisPoints !== (original.discountPercentageBasisPoints ?? null)
  );
}

function allocateProportionally(total: bigint, weights: bigint[]): bigint[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (total === 0n || weightTotal === 0n) return weights.map(() => 0n);
  let allocated = 0n;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return total - allocated;
    const share = (total * weight) / weightTotal;
    allocated += share;
    return share;
  });
}
