/**
 * « Jours fériés », Agenda's: the country (and its region, when it has days of its own) whose public
 * holidays the server fetches from Nager.Date and every device's calendar shows. In the setup (the
 * row « Jours fériés » of « Votre serveur » once Agenda is chosen) and in Agenda's Administration.
 * The shell knows no app: it asks the server's routes by their address (`/api/calendar/holidays/…`,
 * Agenda's `sync/routes`), and the settings through the shared ones (`ServerSettings.calendar`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { COUNTRY_NAMES, countryName } from '@unlease/core/services/setup';
import { authHeader } from '@unlease/core/sync/protocol';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { AppText, Button, EmptyLine, Icon, ListRow, TextField } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { StatusRow } from './StatusRow';

export const HOLIDAYS_INFO = tx('Les jours fériés viennent de Nager.Date, une base ouverte et gratuite. Le serveur les garde pour l’année passée, celle-ci et les deux suivantes, et les montre dans l’agenda de chaque appareil, comme un agenda auquel vous êtes abonné.');

interface Country {
  readonly code: string;
  readonly name: string;
}

/** A GET on the server read as JSON; null when it does not answer (Agenda off, no network). */
async function getJson(server: ServerConfig, path: string): Promise<unknown> {
  try {
    const response = await fetch(`${server.url}${path}`, { headers: authHeader(server.token) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** The line it says on the Administration's home and in the setup. */
export function holidaysLine(country: string | null, region: string | null): string {
  return country ? (region ? `${countryName(country)} · ${region}` : countryName(country)) : t('Aucun pays choisi');
}

export function HolidaysSection({ server, admin }: { server: ServerConfig; admin: AdminState }) {
  const theme = useTheme();
  const current = admin.settings!.calendar.holidays;
  const [countries, setCountries] = useState<readonly Country[]>(() => Object.keys(COUNTRY_NAMES).map(code => ({ code, name: countryName(code) })));
  const [regions, setRegions] = useState<readonly string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getJson(server, '/api/calendar/holidays/countries').then(value => {
      const list = (value as { countries?: unknown } | null)?.countries;
      if (!live || !Array.isArray(list)) return;
      // The names this build knows in the interface's language, Nager's English otherwise.
      const read = list.flatMap(entry => (typeof entry?.code === 'string' && typeof entry?.name === 'string' ? [{ code: entry.code as string, name: COUNTRY_NAMES[entry.code] ? countryName(entry.code) : (entry.name as string) }] : []));
      if (read.length > 0) setCountries(read.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      live = false;
    };
  }, [server]);

  useEffect(() => {
    setRegions([]);
    if (!current.country) return undefined;
    let live = true;
    getJson(server, `/api/calendar/holidays/regions?country=${encodeURIComponent(current.country)}`).then(value => {
      const list = (value as { regions?: unknown } | null)?.regions;
      if (live && Array.isArray(list)) setRegions(list.filter((each): each is string => typeof each === 'string'));
    });
    return () => {
      live = false;
    };
  }, [server, current.country]);

  const save = async (country: string | null, region: string | null): Promise<void> => {
    setBusy(true);
    try {
      admin.setSettings(await saveServerSettings(server, { calendar: { holidays: { country, region } } }));
      showSnack(country ? t('Jours fériés : {place}', { place: holidaysLine(country, region) }) : t('Plus de jours fériés dans l’agenda'), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const words = foldText(query.trim());
    return (words ? countries.filter(country => foldText(country.name).includes(words) || country.code.toLowerCase() === words) : countries.filter(country => COUNTRY_NAMES[country.code])).slice(0, 40);
  }, [countries, query]);

  // A choice among others: the tick in the glyphs' slot, kept empty on the rows not chosen, so every name stands on one column.
  const choice = (key: string, title: string, chosen: boolean, onPress: () => void) => (
    <ListRow
      key={key}
      title={title}
      leading={<View style={styles.mark}>{chosen ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>}
      disabled={busy}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen, disabled: busy }}
    />
  );

  return (
    <View>
      {/* The same head as every section's, its removal in it. */}
      <StatusRow line={{ tone: current.country ? 'ok' : 'off', title: holidaysLine(current.country, current.region), meta: '' }}>
        {current.country ? <Button label={t('Ne plus afficher de jours fériés')} kind="dangerText" small disabled={busy} onPress={() => void save(null, null)} /> : null}
      </StatusRow>
      {regions.length > 0 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Région')}>
          <AppText variant="metaStrong" style={styles.heading}>
            {t('Région')}
          </AppText>
          {choice('whole', t('Tout le pays'), current.region === null, () => void save(current.country, null))}
          {regions.map(region => choice(`region:${region}`, region, current.region === region, () => void save(current.country, region)))}
        </View>
      ) : null}
      <View style={styles.field}>
        <TextField label={t('Pays')} kind="search" value={query} onChangeText={setQuery} placeholder={t('Rechercher un pays')} returnKeyType="search" />
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('Pays')} style={styles.list}>
        {shown.map(country => choice(country.code, country.name, current.country === country.code, () => void save(country.code, null)))}
      </View>
      {shown.length === 0 && query.trim() && countries.length > 0 ? <EmptyLine text={t('Rien ne correspond à « {query} »', { query: query.trim() })} glyph="search" replayKey="none" style={styles.none} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // On the panel's column (16 in), as the other sections' fields and heads.
  heading: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  field: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  list: { paddingBottom: 4 },
  none: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  mark: { width: 24, alignItems: 'center' },
});
