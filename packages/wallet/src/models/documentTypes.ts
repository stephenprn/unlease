/**
 * A document's type, with how long France asks to keep it (service-public.gouv.fr, « Combien de temps
 * conserver ses papiers ? », F19134, read 2026-11-18): the minimum, from the document's date or from
 * the end of what it proves (a contract, a lease). A document can always be kept longer, or for good.
 */
import type { GlyphName } from '@unlease/design/glyphs';

export const DOCUMENT_TYPES = ['tax', 'work', 'bank', 'insurance', 'housing', 'property', 'utilities', 'health', 'vehicle', 'purchase', 'family', 'education', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const isDocumentType = (value: unknown): value is DocumentType => typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);

/**
 * How long to keep one:
 * - `years`: so many years from its date;
 * - `endOfYear`: until 31 December, so many years after its date's (a tax notice: the second year after);
 * - `afterEnd`: so many years after what it proves ends (its `expiresOn`: a contract closed, a lease left);
 * - `untilEnd`: until its end (a receipt, until the warranty ends), else so many years from its date;
 * - `retirement`: until the pension is settled (payslips, contracts);
 * - `forever`;
 * - `none`: no rule to tell (a vehicle's papers, as long as it is owned; anything else).
 */
export type KeepRule =
  | { readonly kind: 'years'; readonly years: number }
  | { readonly kind: 'endOfYear'; readonly years: number }
  | { readonly kind: 'afterEnd'; readonly years: number }
  | { readonly kind: 'untilEnd'; readonly fallbackYears: number }
  | { readonly kind: 'retirement' }
  | { readonly kind: 'forever' }
  | { readonly kind: 'none' };

export interface DocumentTypeInfo {
  readonly glyph: GlyphName;
  readonly keep: KeepRule;
}

export const DOCUMENT_TYPE_INFO: Readonly<Record<DocumentType, DocumentTypeInfo>> = {
  // Income tax return and notice: until 31 December of the second year after it is collected.
  tax: { glyph: 'landmark', keep: { kind: 'endOfYear', years: 2 } },
  // Payslips, employment contract, work certificate: until the pension is settled.
  work: { glyph: 'briefcase', keep: { kind: 'retirement' } },
  // Statements: 5 years from the transaction; a loan, 5 years after it closes (set its end).
  bank: { glyph: 'coins', keep: { kind: 'years', years: 5 } },
  // Home, car, liability: 2 years after the contract closes.
  insurance: { glyph: 'shield', keep: { kind: 'afterEnd', years: 2 } },
  // Lease, inventory, rent receipts: the tenancy and 3 years.
  housing: { glyph: 'home', keep: { kind: 'afterEnd', years: 3 } },
  // Deed of sale: for good.
  property: { glyph: 'key', keep: { kind: 'forever' } },
  // Electricity, gas, water, phone and internet bills: 5 years.
  utilities: { glyph: 'bolt', keep: { kind: 'years', years: 5 } },
  // Reimbursement statements: 2 years (a vaccination record, results: keep them for good).
  health: { glyph: 'heartPulse', keep: { kind: 'years', years: 2 } },
  // Purchase and repairs: as long as it is owned, and 2 years after it is sold.
  vehicle: { glyph: 'car', keep: { kind: 'none' } },
  // Proof of purchase: until the warranty ends; an appliance's invoice, 5 years from the purchase.
  purchase: { glyph: 'receipt', keep: { kind: 'untilEnd', fallbackYears: 5 } },
  // Civil status, family record book, marriage contract, judgments: for good.
  family: { glyph: 'people', keep: { kind: 'forever' } },
  // Diplomas and higher education transcripts: for good.
  education: { glyph: 'graduation', keep: { kind: 'forever' } },
  other: { glyph: 'page', keep: { kind: 'none' } },
};
