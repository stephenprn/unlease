/**
 * The countries a number's calling code is picked among (Réglages' « Indicatif par défaut », the
 * contact form's code beside each number), named in the interface's language, with their code.
 */
import { getLocale } from '@unlease/core/i18n';
import { CALLING_CODES } from '@unlease/contacts/services/phones';

/** A country's name in the interface's language (`FR` -> « France »), its code where the browser cannot name it. */
export function countryName(region: string): string {
  try {
    return new Intl.DisplayNames([getLocale()], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}

/** A country with its calling code: « France (+33) ». */
export const callingCountry = (region: string): string => `${countryName(region)} (+${CALLING_CODES[region] ?? ''})`;

/** Every country of `CALLING_CODES`, by name. */
export function callingCountries(): { readonly value: string; readonly label: string }[] {
  return Object.keys(CALLING_CODES)
    .map(region => ({ value: region, label: callingCountry(region) }))
    .sort((a, b) => a.label.localeCompare(b.label, getLocale()));
}
