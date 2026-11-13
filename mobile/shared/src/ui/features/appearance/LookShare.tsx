/**
 * Each app of the suite keeps its own look (the theme, the colours, the ground); « Appliquer aux
 * autres » sends this one's to those of the suite's other apps on this phone that the person ticks
 * (all, at first), each taking it the next time it opens (`applyLookTo`, through SuiteLink). Three
 * ways to it: the slip after a change of look in Réglages (`useLookShareHint`), the quiet button at
 * the ground's foot (`LookShareButton`), and the sheet they both open (`LookShareSheet`, mounted at
 * the app's root as the services' sheet is).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS, READY_APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { useInstalledApps } from '@shared/app/hooks/useAppReachable';
import { ownApp } from '@shared/app/store/library';
import { applyLookTo, useSettingsStore } from '@shared/app/store/settingsStore';
import { selectLookShareOpen, setLookShareOpen, showSnack, useUiStore } from '@shared/app/store/uiStore';

import { AppText, Button, CheckMark, FormFoot, Sheet, SHEET_INSET, SheetScroll, Tappable } from '../../components';
import { BrandMark } from '../../icons/BrandMark';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

/** How long the look must stay put before the slip comes: a person trying swatches is not interrupted. */
const HINT_DELAY_MS = 1200;

/** The suite's other ready apps installed on this phone, in the suite's order. */
function useOtherApps(): readonly AppId[] {
  const own = ownApp();
  return useInstalledApps(READY_APPS.filter(id => id !== own));
}

/** The look as one key: the theme, the colours and the ground (the ground's grain is the grains', the suite's). */
function lookKey(state: { readonly theme: string; readonly appearance: object }): string {
  return JSON.stringify([state.theme, { ...state.appearance, grain: null }]);
}

/** Réglages: each time the look changes and settles, a slip says it is this app's, with the way to send it to the others (when there are others). */
export function useLookShareHint(): void {
  const key = useSettingsStore(lookKey);
  const others = useOtherApps();
  const settled = useRef(key);
  const reachable = useRef(others.length > 0);
  useEffect(() => {
    reachable.current = others.length > 0;
  }, [others.length]);
  useEffect(() => {
    if (key === settled.current) return undefined;
    const timer = setTimeout(() => {
      settled.current = key;
      if (!reachable.current) return;
      showSnack(t('Appearance changed in {app}', { app: APPS[ownApp()].name }), { label: t('Apply to other apps'), run: () => setLookShareOpen(true) });
    }, HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);
}

/** A text button at a panel's foot, inset and padded as its rows (6 and 10): its glyph on their glyphs' column. */
export const FOOT_BUTTON = { paddingHorizontal: 10 } as const;

/** The quiet way to it at any time, at the ground's foot, once set up (the first run's look is the app's own). */
export function LookShareButton() {
  const onboarded = useSettingsStore(state => state.onboarded);
  const others = useOtherApps();
  if (!onboarded || others.length === 0) return null;
  return (
    <View style={styles.open}>
      <Button kind="text" small icon="apps" label={t('Apply to other apps…')} onPress={() => setLookShareOpen(true)} style={FOOT_BUTTON} />
    </View>
  );
}

/** « Appliquer cette apparence »: the other apps, each ticked, and « Appliquer ». */
export function LookShareSheet() {
  const open = useUiStore(selectLookShareOpen);
  const others = useOtherApps();
  const close = (): void => setLookShareOpen(false);
  return (
    <Sheet visible={open} onDismiss={close} title={t('Apply this appearance')}>
      {open ? <LookShareBody others={others} onClose={close} /> : null}
    </Sheet>
  );
}

/** Mounted as the sheet opens, so every app starts ticked each time. */
function LookShareBody({ others, onClose }: { others: readonly AppId[]; onClose: () => void }) {
  const theme = useTheme();
  const [left, setLeft] = useState<ReadonlySet<AppId>>(() => new Set());
  const chosen = others.filter(app => !left.has(app));
  const toggle = (app: AppId): void =>
    setLeft(current => {
      const next = new Set(current);
      if (!next.delete(app)) next.add(app);
      return next;
    });
  const apply = (): void => {
    applyLookTo(chosen);
    onClose();
    showSnack(sentWords(chosen), undefined, { tone: 'success' });
  };
  return (
    <>
      <SheetScroll contentContainerStyle={styles.body}>
        <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
          {t('{app}’s theme, colours and background, for the apps ticked. Each takes them the next time it opens.', { app: APPS[ownApp()].name })}
        </AppText>
        <View>
          {others.map(app => {
            const on = !left.has(app);
            return (
              <Tappable key={app} onPress={() => toggle(app)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={APPS[app].name} style={styles.row}>
                <View style={styles.slot}>
                  <CheckMark checked={on} />
                </View>
                <BrandMark app={app} size={28} />
                <AppText variant="body" style={styles.name}>
                  {APPS[app].name}
                </AppText>
              </Tappable>
            );
          })}
        </View>
      </SheetScroll>
      <FormFoot>
        <Button kind="text" label={t('Cancel')} onPress={onClose} />
        <Button label={t('Apply')} disabled={chosen.length === 0} onPress={apply} />
      </FormFoot>
    </>
  );
}

/** « Agenda prendra cette apparence… », « Pages et Agenda prendront… »: the names are brands, the same in every language. */
function sentWords(apps: readonly AppId[]): string {
  const names = apps.map(app => APPS[app].name);
  if (names.length === 1) return t('{app} will take this appearance the next time it opens.', { app: names[0]! });
  return t('{apps} and {last} will take this appearance the next time they open.', { apps: names.slice(0, -1).join(', '), last: names[names.length - 1]! });
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  // On the sheet's column, as its title.
  lead: { paddingHorizontal: SHEET_INSET },
  // The row is the checkbox: its box, the app's mark, its name; a list row's geometry (6 in, 10, a 24 slot, 16), so the box stands on the sheet's column.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
  slot: { width: 24, alignItems: 'center' },
  name: { flex: 1 },
  // At the ground's foot with « Habiller vos autres services… », inset as its rows.
  open: { flexDirection: 'row', paddingHorizontal: 6 },
});
