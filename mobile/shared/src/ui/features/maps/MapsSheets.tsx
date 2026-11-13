/**
 * Where a place opens, as sheets mounted once at the app's root (Contacts', Agenda's): the chooser
 * (`openPlace` with nothing chosen: the phone's maps apps by their own icon and name, OpenStreetMap in
 * the browser, « Copier l’adresse », and « Toujours utiliser ce choix »), and Réglages' « Ouvrir les
 * adresses dans » (`MapsChoiceField`), the same apps with « Demander à chaque fois » first, the
 * current one ticked. Either applies on the press and closes.
 */
import React, { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { MAP_APP_NAMES } from '@unlease/core/services/maps';
import type { GlyphName } from '@unlease/design/glyphs';
import { useMapApps } from '@shared/app/hooks/useMapApps';
import { answerPlace, copyPlace } from '@shared/app/openPlace';
import { closePlaceQuestion, mapsChoiceName, selectChoosingMaps, selectPlaceQuestion, setChoosingMaps, setMapsChoice, useMapsChoice, useMapsStore, type MapsChoice } from '@shared/app/store/mapsStore';
import type { MapAppInfo } from '@shared/platform/mapApps';

import { AppText, Icon, ListRow, PickerField, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { SwitchRow } from '../appearance/SwitchRow';

/** The mark's slot in these rows: an app's own icon, or a glyph centred in the same room. */
const MARK = 28;

/** A press's work, not awaited: what it says goes through its own slips. */
const later = (work: Promise<unknown>): void => {
  work.catch(() => undefined);
};

const OPEN_STREET_MAP: MapsChoice = { kind: 'web', app: 'openstreetmap' };

const appChoice = (app: MapAppInfo): MapsChoice => ({ kind: 'app', packageName: app.packageName, label: app.label });

const sameChoice = (a: MapsChoice | null, b: MapsChoice | null): boolean =>
  a === null || b === null ? a === b : a.kind === 'web' ? b.kind === 'web' : b.kind === 'app' && a.packageName === b.packageName;

/** An app's icon as the launcher draws it, or the pin when the phone could not. */
function AppMark({ app }: { app: MapAppInfo }) {
  const theme = useTheme();
  return (
    <View style={staticStyles.mark}>
      {app.icon ? <Image source={{ uri: app.icon }} style={staticStyles.icon} accessibilityIgnoresInvertColors /> : <Icon name="mapPin" size={24} color={theme.color.ink} />}
    </View>
  );
}

function GlyphMark({ name }: { name: GlyphName }) {
  const theme = useTheme();
  return (
    <View style={staticStyles.mark}>
      <Icon name={name} size={24} color={theme.color.ink} />
    </View>
  );
}

/** `openPlace` with nothing chosen: where this place opens, this time or from now on. */
function PlaceChooser() {
  const styles = useThemedStyles(makeStyles);
  const question = useMapsStore(selectPlaceQuestion);
  const apps = useMapApps(question !== null);
  const [remember, setRemember] = useState(false);
  // The sheet keeps what it showed while it leaves.
  const [shown, setShown] = useState(question);
  useEffect(() => {
    if (!question) return;
    setShown(question);
    setRemember(false);
  }, [question]);
  const pick = (choice: MapsChoice): void => {
    if (shown) later(answerPlace(shown, choice, remember));
  };
  const title = shown?.title ?? (shown?.directions ? t('Directions') : t('Open the address'));
  return (
    <Sheet visible={question !== null} onDismiss={closePlaceQuestion} title={title}>
      {/* Under the title, outside the scroll (which clips what rises above its top edge). */}
      {shown ? (
        <View style={styles.about}>
          <AppText variant="meta">
            {shown.place}
          </AppText>
          {shown.gone ? <AppText variant="meta">{t('{app} is no longer on this phone: choose where your addresses open.', { app: shown.gone })}</AppText> : null}
        </View>
      ) : null}
      <SheetScroll>
        {(apps ?? []).map(app => (
          <ListRow key={app.packageName} title={app.label} leading={<AppMark app={app} />} onPress={() => pick(appChoice(app))} />
        ))}
        <ListRow title={MAP_APP_NAMES.openstreetmap} supporting={t('In the browser')} leading={<GlyphMark name="globe" />} onPress={() => pick(OPEN_STREET_MAP)} />
        <ListRow title={t('Copy the address')} leading={<GlyphMark name="copy" />} onPress={() => shown && later(copyPlace(shown))} />
        <View style={styles.rule} />
        <SwitchRow title={t('Always use this choice')} supporting={t('Settings change it later.')} value={remember} onChange={setRemember} />
      </SheetScroll>
    </Sheet>
  );
}

/** Réglages' sheet: « Demander à chaque fois », the phone's maps apps, OpenStreetMap; the current one ticked. */
function ChoiceSheet() {
  const theme = useTheme();
  const open = useMapsStore(selectChoosingMaps);
  const chosen = useMapsChoice();
  const apps = useMapApps(open);
  const close = (): void => setChoosingMaps(false);
  const row = (key: string, title: string, mark: React.ReactNode, choice: MapsChoice | null, supporting?: string) => {
    const current = sameChoice(choice, chosen);
    return (
      <ListRow
        key={key}
        title={title}
        supporting={supporting}
        leading={mark}
        trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
        accessibilityRole="radio"
        accessibilityState={{ checked: current }}
        onPress={() => {
          if (!current) setMapsChoice(choice);
          close();
        }}
      />
    );
  };
  // A chosen app that is not among those found (uninstalled since) is still named, so the tick has its row.
  const listed = (apps ?? []).map(appChoice);
  const missing = chosen?.kind === 'app' && apps !== null && !listed.some(choice => sameChoice(choice, chosen)) ? chosen : null;
  return (
    <Sheet visible={open} onDismiss={close} title={t('Open addresses in')}>
      <SheetScroll>
        {row('ask', t('Ask every time'), <GlyphMark name="apps" />, null, t('The maps apps on this phone, to choose from'))}
        {(apps ?? []).map(app => row(app.packageName, app.label, <AppMark app={app} />, appChoice(app)))}
        {missing ? row(missing.packageName, missing.label, <GlyphMark name="mapPin" />, missing, t('No longer on this phone')) : null}
        {row('web', MAP_APP_NAMES.openstreetmap, <GlyphMark name="globe" />, OPEN_STREET_MAP, t('In the browser'))}
      </SheetScroll>
    </Sheet>
  );
}

/** Both sheets, mounted once at the app's root (a sheet cannot live inside a screen's scroll). */
export const MapsSheets = memo(function MapsSheets() {
  // Asked once at start: the chooser opens with its apps already listed.
  useMapApps(true);
  return (
    <>
      <PlaceChooser />
      <ChoiceSheet />
    </>
  );
});

/** Réglages' « Ouvrir les adresses dans »: the choice by name; pressed, the sheet of choices. */
export const MapsChoiceField = memo(function MapsChoiceField() {
  const chosen = useMapsChoice();
  return (
    <PickerField
      label={t('Open addresses in')}
      value={mapsChoiceName(chosen)}
      onPress={() => setChoosingMaps(true)}
      help={t('A tapped address opens there at once. “Ask every time” offers the phone’s maps apps.')}
    />
  );
});

const staticStyles = StyleSheet.create({
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  icon: { width: MARK, height: MARK },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Under the title, on its column: what is being opened.
    about: { marginHorizontal: SHEET_INSET, marginTop: -6, marginBottom: 8, gap: 4 },
    // From the rows' glyphs to their ends: the sheet's column.
    rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginHorizontal: SHEET_INSET, marginVertical: 4 },
  });
