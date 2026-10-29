/**
 * The appearance, as Réglages and the first run show it: "Couleurs" (the day and the night it makes,
 * the pairs that go together, then the primary and the accent each picked precisely) and "Fond" (the
 * gradients, the plain colours, the person's own and the two ways to make one, then the ground's
 * grain). A choice applies at once; the two editors (`useAppearanceEditors`, mounted at the screen's
 * root) apply on their own button.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import {
  accentRoles,
  COLOR_ROLE_WORDS,
  COLORS_INFO,
  GROUND_COLORS,
  GROUND_GRADIENTS,
  GROUND_INFO,
  GROUND_NAMES,
  GROUND_PRESETS,
  groundName,
  groundPaint,
  PALETTE_COLORS,
  PALETTE_NAMES,
  paletteOf,
  PALETTES,
  presetGradient,
  primaryRoles,
  randomGradient,
  sameGradient,
  type ColorRole,
  type GradientSpec,
  type GroundChoice,
  type GroundPreset,
  type PickTarget,
} from '@unlease/design/appearance';
import { SERVICES_CSS_WORDS } from '@unlease/design/customCss';
import { t } from '@unlease/core/i18n';
import { selectAppearance, setAppearance, useSettingsStore } from '@app/store/settingsStore';
import { setServicesCssOpen } from '@app/store/uiStore';

import { AppText, Button, Icon, ListRow, Organic, groundStyle } from '../../components';
import { Swatch, SwatchGroup, swatchCells, swatchTurn } from '../../components/Swatch';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { Section } from '../settings/Section';
import { AppearancePreview } from './AppearancePreview';
import { ColorSheet } from './ColorSheet';
import { GradientSheet } from './GradientSheet';
import { SwitchRow } from './SwitchRow';

/** A ground as its swatch paints it: the ground of the mode on screen, edged in a hairline. */
function groundSwatch(choice: GroundChoice, theme: Theme): ViewStyle {
  return { ...groundStyle(groundPaint(choice, theme.mode)), borderWidth: 1, borderColor: theme.color.hairline };
}

/** A gradient as it is kept: its colours, its style, its seed (a ground choice carries its kind too). */
const specOf = ({ colors, form, seed }: GradientSpec): GradientSpec => ({ colors: [...colors], form, seed });

/** The colours: the pairs, then each colour on its own row. `onEdit` opens the editor for one. */
export function ColorsSection({ onEdit }: { onEdit: (role: ColorRole) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const appearance = useSettingsStore(selectAppearance);
  const palette = paletteOf(appearance.primary, appearance.accent);
  // Each pair as it shows in this mode, the capture pebble's colour then a filled button's, split across its pebble.
  const pairs = useMemo(
    () =>
      PALETTES.map(key => {
        const seeds = PALETTE_COLORS[key];
        const primary = primaryRoles(seeds.primary, theme.mode).leaf;
        const accent = accentRoles(seeds.accent, theme.mode).action;
        return { key, seeds, paint: { backgroundColor: primary, backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${accent} 50%, ${accent} 100%)` } };
      }),
    [theme.mode],
  );
  // Each colour on its own: what it paints, in the words of the screens it paints; its code waits in its editor.
  const roleRow = (role: ColorRole, shown: string) => (
    <ListRow
      key={role}
      leading={<Organic pebble={role === 'primary' ? 1 : 3} style={[styles.dot, { backgroundColor: shown }]} />}
      title={COLOR_ROLE_WORDS[role].name}
      supporting={COLOR_ROLE_WORDS[role].hint}
      trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />}
      onPress={() => onEdit(role)}
    />
  );
  return (
    <Section title={t('Couleurs')} info={COLORS_INFO}>
      <View style={styles.body}>
        <AppearancePreview appearance={appearance} />
        <SwatchGroup title={t('Palettes')} chosen={palette ? PALETTE_NAMES[palette] : t('Sur mesure')}>
          {pairs.map(({ key, seeds, paint }, index) => (
            <Swatch
              key={key}
              label={PALETTE_NAMES[key]}
              name={PALETTE_NAMES[key]}
              selected={key === palette}
              turn={swatchTurn(index, 4)}
              paint={{ ...paint, borderWidth: 1, borderColor: theme.color.hairline }}
              ring="ink"
              checkRing
              cell={swatchCells.quarter}
              onPress={() => setAppearance({ ...useSettingsStore.getState().appearance, ...seeds })}
            />
          ))}
        </SwatchGroup>
        <AppText variant="metaStrong" style={styles.rolesHead} accessibilityRole="header">
          {t('Sur mesure')}
        </AppText>
      </View>
      {roleRow('primary', appearance.primary)}
      {roleRow('accent', appearance.accent)}
    </Section>
  );
}

/** The ground: presets, the person's own, the two editors, its grain, and the way to the other services' sheets. */
export function GroundSection({ onEditColor, onEditGradient }: { onEditColor: () => void; onEditGradient: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const appearance = useSettingsStore(selectAppearance);
  const { ground, ownColor, ownGradient } = appearance;
  const choose = (next: GroundChoice) => setAppearance({ ...useSettingsStore.getState().appearance, ground: next });
  // The chosen ground's name heads the group that holds it.
  const holder = ground.kind === 'preset' ? ((GROUND_GRADIENTS as readonly GroundPreset[]).includes(ground.key) ? 'gradients' : 'colors') : 'own';
  const chosen = groundName(ground);
  const paint = (choice: GroundChoice) => groundSwatch(choice, theme);
  // The presets' paints, worked out once per theme (the clouds take a little working out).
  const presets = useMemo(() => new Map(GROUND_PRESETS.map(key => [key, groundSwatch({ kind: 'preset', key }, theme)])), [theme]);
  const preset = (key: GroundPreset, index: number) => (
    <Swatch
      key={key}
      label={GROUND_NAMES[key]}
      name={GROUND_NAMES[key]}
      selected={ground.kind === 'preset' && ground.key === key}
      turn={swatchTurn(index, 4)}
      paint={presets.get(key)!}
      ring="focus"
      cell={swatchCells.quarter}
      onPress={() => choose({ kind: 'preset', key })}
    />
  );
  // The person's own first, then the two ways to make one: each on the next turn of the pebble.
  const turns = { color: 0, gradient: ownColor ? 1 : 0 };
  const after = (ownColor ? 1 : 0) + (ownGradient ? 1 : 0);
  return (
    <Section title={t('Fond')} info={GROUND_INFO}>
      <View style={styles.body}>
        <SwatchGroup title={t('Dégradés')} chosen={holder === 'gradients' ? chosen : null}>
          {GROUND_GRADIENTS.map(preset)}
        </SwatchGroup>
        <SwatchGroup title={t('Couleurs unies')} chosen={holder === 'colors' ? chosen : null}>
          {GROUND_COLORS.map(preset)}
        </SwatchGroup>
        <SwatchGroup title={t('Les vôtres')} chosen={holder === 'own' ? chosen : null}>
          {ownColor ? (
            <Swatch
              label={t('Votre couleur')}
              name={t('Votre couleur')}
              selected={ground.kind === 'color' && ground.color === ownColor}
              turn={swatchTurn(turns.color, 4)}
              paint={paint({ kind: 'color', color: ownColor })}
              ring="focus"
              cell={swatchCells.quarter}
              onPress={() => choose({ kind: 'color', color: ownColor })}
            />
          ) : null}
          {ownGradient ? (
            <Swatch
              label={t('Votre dégradé')}
              name={t('Votre dégradé')}
              selected={ground.kind === 'gradient' && sameGradient(ground, ownGradient)}
              turn={swatchTurn(turns.gradient, 4)}
              paint={paint({ kind: 'gradient', ...ownGradient })}
              ring="focus"
              cell={swatchCells.quarter}
              onPress={() => choose({ kind: 'gradient', ...ownGradient })}
            />
          ) : null}
          <Swatch role="button" label={t('Couleur du fond')} name={t('Couleur…')} selected={false} turn={swatchTurn(after, 4)} paint={styles.add} ring="focus" cell={swatchCells.quarter} onPress={onEditColor}>
            <Icon name="plus" size={22} color={theme.color.link} />
          </Swatch>
          <Swatch role="button" label={t('Créer un dégradé')} name={t('Dégradé…')} selected={false} turn={swatchTurn(after + 1, 4)} paint={styles.add} ring="focus" cell={swatchCells.quarter} onPress={onEditGradient}>
            <Icon name="plus" size={22} color={theme.color.link} />
          </Swatch>
        </SwatchGroup>
      </View>
      <SwitchRow title={t('Grain sur le fond')} supporting={t('Le grain de film sur le fond de l’écran.')} value={appearance.grain} onChange={grain => setAppearance({ ...useSettingsStore.getState().appearance, grain })} />
      <View style={styles.servicesOpen}>
        <Button kind="text" small icon="palette" label={SERVICES_CSS_WORDS.open} onPress={() => setServicesCssOpen(true)} />
      </View>
    </Section>
  );
}

type Editing = { readonly kind: 'color'; readonly target: PickTarget; readonly from: string } | { readonly kind: 'gradient'; readonly from: GradientSpec; readonly grain: boolean };

/**
 * The two editors, and the ways to open them: `editors` goes at the root of the screen (a sheet
 * draws over everything there). Each opens on what is there already and, chosen, applies at once;
 * a ground made here is also kept as the person's own, to be chosen again later.
 */
export function useAppearanceEditors(): { readonly editColor: (target: PickTarget) => void; readonly editGradient: () => void; readonly editors: React.ReactElement } {
  const theme = useTheme();
  const [open, setOpen] = useState<Editing['kind'] | null>(null);
  // What each editor opened on, kept while it leaves.
  const [color, setColor] = useState<Extract<Editing, { kind: 'color' }>>({ kind: 'color', target: 'primary', from: useSettingsStore.getState().appearance.primary });
  const [gradient, setGradient] = useState<Extract<Editing, { kind: 'gradient' }> | null>(null);
  const base = theme.ground.base;

  const editColor = useCallback(
    (target: PickTarget) => {
      const appearance = useSettingsStore.getState().appearance;
      const from = target === 'primary' ? appearance.primary : target === 'accent' ? appearance.accent : (appearance.ownColor ?? (appearance.ground.kind === 'color' ? appearance.ground.color : base));
      setColor({ kind: 'color', target, from });
      setOpen('color');
    },
    [base],
  );

  const editGradient = useCallback(() => {
    const appearance = useSettingsStore.getState().appearance;
    const { ground } = appearance;
    const from = appearance.ownGradient ?? (ground.kind === 'gradient' ? specOf(ground) : null) ?? (ground.kind === 'preset' ? presetGradient(ground.key) : null) ?? randomGradient(Math.floor(Math.random() * 0x7fffffff));
    setGradient({ kind: 'gradient', from, grain: appearance.grain });
    setOpen('gradient');
  }, []);

  const close = useCallback(() => setOpen(null), []);

  const editors = (
    <>
      <ColorSheet
        visible={open === 'color'}
        target={color.target}
        initial={color.from}
        onDismiss={close}
        onChoose={hex => {
          const appearance = useSettingsStore.getState().appearance;
          if (color.target === 'ground') setAppearance({ ...appearance, ground: { kind: 'color', color: hex }, ownColor: hex });
          else setAppearance(color.target === 'primary' ? { ...appearance, primary: hex } : { ...appearance, accent: hex });
          close();
        }}
      />
      {gradient ? (
        <GradientSheet
          visible={open === 'gradient'}
          initial={gradient.from}
          initialGrain={gradient.grain}
          onDismiss={close}
          onUse={(made, grain) => {
            const spec = specOf(made);
            setAppearance({ ...useSettingsStore.getState().appearance, ground: { kind: 'gradient', ...spec }, ownGradient: spec, grain });
            close();
          }}
        />
      ) : null}
    </>
  );

  return { editColor, editGradient, editors };
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The swatches' grids fill the panel in full rows; the preview stands in line with the rows' text.
    body: { gap: 18, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
    dot: { width: 28, height: 28, borderWidth: 1, borderColor: theme.color.hairline },
    // On the swatch groups' heads' line, heading the two rows under it.
    rolesHead: { marginTop: 2 },
    // An "add" pebble: drawn by its edge alone, its plus in the link's ink.
    add: { backgroundColor: theme.color.paper, borderWidth: 1.5, borderColor: theme.color.edge },
    // « Habiller vos autres services… », the quiet way out at the ground's foot, inset as its rows.
    servicesOpen: { flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 8 },
  });
