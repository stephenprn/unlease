import { getLocale } from '@unlease/core/i18n';

/** Dollars as Claude's costs are shown: "1,42 $", and three decimals below a cent ("0,001 $" a link with Haiku), as on the web; "$1.42" in English. */
export function formatUsd(value: number): string {
  const digits = value > 0 && value < 0.01 ? 3 : 2;
  return getLocale() === 'en' ? `$${value.toFixed(digits)}` : `${value.toFixed(digits).replace('.', ',')} $`;
}
