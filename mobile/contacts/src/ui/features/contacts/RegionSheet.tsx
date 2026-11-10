/**
 * A calling code picked in a sheet of rows, the chosen one ticked: Réglages' « Indicatif par défaut »,
 * as the web's (the country whose code a number written without its `+` takes: a contact's page shows
 * and dials it with it, WhatsApp needs it, a new number in the form starts with it), the phone's own
 * (its language's region) first, the countries by name, then none; and a number's own code in the
 * contact form (`CodeSheet`), the default first.
 */
import React from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { countryName as knownCountryName } from '@unlease/core/services/setup';
import { CALLING_CODES } from '@unlease/contacts/services/phones';

import { Icon, ListRow, Sheet, SheetScroll } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** A country's name in the interface's language (`FR` -> « France »), from the platform when it can, else from the suite's own names. */
export function countryName(region: string): string {
  try {
    const name = new Intl.DisplayNames([getLocale()], { type: 'region' }).of(region);
    if (name && name !== region) return name;
  } catch {
    // Hermes may not name regions: the suite's own list does.
  }
  return knownCountryName(region);
}

/** A country with its calling code: « France (+33) ». */
export const callingCountry = (region: string): string => `${countryName(region)} (+${CALLING_CODES[region] ?? ''})`;

/** Every country of `CALLING_CODES`, by name. */
function callingCountries(): { readonly region: string; readonly name: string }[] {
  return Object.keys(CALLING_CODES)
    .map(region => ({ region, name: callingCountry(region) }))
    .sort((a, b) => a.name.localeCompare(b.name, getLocale()));
}

/** What the setting reads as: the chosen country, the phone's, or none. */
export function regionWords(chosen: string | null, phone: string | null): string {
  if (chosen === 'none') return t('Aucun : les numéros sont écrits avec leur +');
  if (chosen) return callingCountry(chosen);
  return phone ? t('Celui de ce téléphone : {country}', { country: callingCountry(phone) }) : t('Celui de ce téléphone (aucun)');
}

/** A row's value: a country, `none`, or null (the setting: follow the phone). */
type Choice = string | null;

function ChoiceSheet({ visible, title, rows, chosen, onChoose, onDismiss }: { visible: boolean; title: string; rows: readonly { readonly value: Choice; readonly title: string }[]; chosen: Choice; onChoose: (value: Choice) => void; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll>
        {rows.map(row => {
          const on = row.value === chosen;
          return (
            <ListRow
              key={row.value ?? 'phone'}
              title={row.title}
              onPress={() => {
                onChoose(row.value);
                onDismiss();
              }}
              trailing={on ? <Icon name="check" size={20} color={theme.color.focus} /> : undefined}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            />
          );
        })}
      </SheetScroll>
    </Sheet>
  );
}

/** Réglages' « Indicatif par défaut »: a country, `none`, or null to follow the phone. */
export function RegionSheet({ visible, chosen, phone, onChoose, onDismiss }: { visible: boolean; chosen: string | null; phone: string | null; onChoose: (region: string | null) => void; onDismiss: () => void }) {
  const rows = [
    { value: null, title: regionWords(null, phone) },
    ...callingCountries().map(country => ({ value: country.region, title: country.name })),
    { value: 'none', title: regionWords('none', phone) },
  ];
  return <ChoiceSheet visible={visible} title={t('Indicatif par défaut')} rows={rows} chosen={chosen} onChoose={onChoose} onDismiss={onDismiss} />;
}

/** A number's calling code in the contact form: the default first, the countries by name, then none (the number kept as written). */
export function CodeSheet({ visible, chosen, fallback, onChoose, onDismiss }: { visible: boolean; chosen: string | null; fallback: string | null; onChoose: (region: string | null) => void; onDismiss: () => void }) {
  const countries = callingCountries();
  const rows = [
    ...countries.filter(country => country.region === fallback),
    ...countries.filter(country => country.region !== fallback),
  ].map(country => ({ value: country.region as Choice, title: country.name }));
  rows.push({ value: 'none', title: t('Aucun : le numéro tel qu’il est écrit') });
  return <ChoiceSheet visible={visible} title={t('Indicatif du numéro')} rows={rows} chosen={chosen ?? 'none'} onChoose={value => onChoose(value === 'none' ? null : value)} onDismiss={onDismiss} />;
}
