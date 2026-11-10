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
  STANDARD: localized({ name: tx('Standard'), meta: tx('Lisible à tout moment. Le plus simple.') }),
  STANDARD_IA: localized({ name: tx('Accès rare'), meta: tx('Moins cher à garder ; chaque lecture est facturée.') }),
  ONEZONE_IA: localized({ name: tx('Accès rare, une zone'), meta: tx('Moins cher à garder, dans un seul centre ; chaque lecture est facturée.') }),
  GLACIER_IR: localized({ name: tx('Glacier, lecture immédiate'), meta: tx('Bien moins cher à garder, lisible à tout moment ; chaque lecture est facturée.') }),
  GLACIER: localized({ name: tx('Glacier'), meta: tx('Le moins cher à garder. Pour restaurer, la sauvegarde sort d’abord du froid : comptez quelques heures.') }),
  DEEP_ARCHIVE: localized({ name: tx('Archive profonde'), meta: tx('Le moins cher de tous. Jusqu’à 48 h pour sortir une sauvegarde du froid.') }),
};

/** Under the choice, translated: what changes, and for a provider this does not know, why only two are offered. */
export function storageClassHelp(endpoint: string): string[] {
  const lines = [t('Vaut pour ce qui sera envoyé ensuite : ce qui est déjà sur S3 garde sa classe.')];
  if (storageProviderOf(endpoint) === 'other') lines.push(t('Service non reconnu : Standard et Glacier sont proposés, et la classe est essayée sur le bucket avant d’être gardée.'));
  return lines;
}
