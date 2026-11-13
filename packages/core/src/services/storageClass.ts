/**
 * Which S3 storage classes a provider offers, read from its address, and what each one means to
 * the person choosing. A provider this does not know offers Standard and Glacier, the two most
 * stores take: the bucket tries the one chosen before it is kept, so a refusal says so at once.
 */
import { localized, t, tx } from '../i18n';
import type { StorageClass } from '../sync/settings';

export type StorageProvider = 'scaleway' | 'aws' | 'other';

/** The provider an S3 address belongs to. */
export function storageProviderOf(endpoint: string): StorageProvider {
  let host: string;
  try {
    host = new URL(endpoint.trim()).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host.endsWith('.scw.cloud')) return 'scaleway';
  if (host.endsWith('.amazonaws.com')) return 'aws';
  return 'other';
}

const OFFERED: Record<StorageProvider, readonly StorageClass[]> = {
  scaleway: ['STANDARD', 'ONEZONE_IA', 'GLACIER'],
  aws: ['STANDARD', 'STANDARD_IA', 'GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'],
  other: ['STANDARD', 'GLACIER'],
};

/** The classes to offer for this address, the one already chosen always among them. */
export function storageClassesFor(endpoint: string, current: StorageClass): StorageClass[] {
  const offered = OFFERED[storageProviderOf(endpoint)];
  return offered.includes(current) ? [...offered] : [...offered, current];
}

/** Each class's name and what it costs or delays, in French (translated where shown). */
export const STORAGE_CLASS_WORDS: Readonly<Record<StorageClass, { readonly name: string; readonly meta: string }>> = {
  STANDARD: localized({ name: tx('Standard'), meta: tx('Readable at any time. The simplest.') }),
  STANDARD_IA: localized({ name: tx('Infrequent access'), meta: tx('Cheaper to keep; each read is billed.') }),
  ONEZONE_IA: localized({ name: tx('Infrequent access, one zone'), meta: tx('Cheaper to keep, in a single data centre; each read is billed.') }),
  GLACIER_IR: localized({ name: tx('Glacier, instant retrieval'), meta: tx('Much cheaper to keep, readable at any time; each read is billed.') }),
  GLACIER: localized({ name: tx('Glacier'), meta: tx('The cheapest to keep. To restore, the backup first comes out of cold storage: allow a few hours.') }),
  DEEP_ARCHIVE: localized({ name: tx('Deep archive'), meta: tx('The cheapest of all. Up to 48 hours to bring a backup out of cold storage.') }),
};

/** Under the choice, translated: what changes, and for a provider this does not know, why only two are offered. */
export function storageClassHelp(endpoint: string): string[] {
  const lines = [t('Applies to what is sent from now on: what is already on S3 keeps its class.')];
  if (storageProviderOf(endpoint) === 'other') lines.push(t('Service not recognised: Standard and Glacier are offered, and the class is tried on the bucket before it is kept.'));
  return lines;
}
