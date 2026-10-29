/**
 * A gradient of one's own for the ground: two to four colours, each picked precisely (or drawn at
 * random, in harmony), blended from the top to the foot (Fondu) or pooled as soft clouds (Nuées)
 * that "Mélanger" lays out again, grainy or not. The day and the night it makes show above; nothing
 * changes on the screens until "Utiliser ce fond".
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';

import { GRADIENT_COLORS, GRADIENT_FORM_NAMES, GRADIENT_FORMS, randomGradient, shuffleSeed, type Appearance, type GradientForm, type GradientSpec } from '@unlease/design/appearance';
import { mixOklab } from '@unlease/design/color';
import { t } from '@unlease/core/i18n';
import { selectAppearance, useSettingsStore } from '@app/store/settingsStore';

import { AnimatedOrganic, AppText, Button, Icon, IconButton, Segmented, Sheet, SheetScroll, Tappable } from '../../components';
import { useChosen } from '../../components/useChosen';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { AppearancePreview } from './AppearancePreview';
import { ColorPicker } from './ColorPicker';
import { SwitchRow } from './SwitchRow';

export interface GradientSheetProps {
  readonly visible: boolean;
  /** The gradient it opens on, and whether the ground is grainy. */
  readonly initial: GradientSpec;
  readonly initialGrain: boolean;
  readonly onDismiss: () => void;
  readonly onUse: (gradient: GradientSpec, grain: boolean) => void;
}

const STOP = 44;

/** A new seed for the dice. */
const freshSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

/** One of the gradient's colours, as a pebble: the one being picked is ringed in ink. */
function StopComponent({ color, index, selected, onPress }: { color: string; index: number; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const progress = useChosen(selected);
  const ring = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.6) }));
  return (
    <Tappable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t('Couleur {n} : {color}', { n: index + 1, color })}
      onPress={onPress}
      pebble={index}
      style={[styles.stop, { backgroundColor: color }]}
    >
      <AnimatedOrganic pointerEvents="none" pebble={index} style={[StyleSheet.absoluteFill, styles.ring, ring]} />
    </Tappable>
  );
}

const Stop = memo(StopComponent);

function GradientSheetComponent({ visible, initial, initialGrain, onDismiss, onUse }: GradientSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const appearance = useSettingsStore(selectAppearance);
  const [gradient, setGradient] = useState<GradientSpec>(initial);
  const [grain, setGrain] = useState(initialGrain);
  const [picked, setPicked] = useState(0);
  // Each opening starts again from the gradient it opens on.
  const [open, setOpen] = useState(visible);
  if (visible !== open) {
    setOpen(visible);
    if (visible) {
      setGradient(initial);
      setGrain(initialGrain);
      setPicked(0);
    }
  }
  const at = Math.min(picked, gradient.colors.length - 1);
  const draft: Appearance = { ...appearance, ground: { kind: 'gradient', ...gradient }, grain };

  const recolour = (hex: string) => setGradient(current => ({ ...current, colors: current.colors.map((color, index) => (index === at ? hex : color)) }));
  const add = () => {
    if (gradient.colors.length >= GRADIENT_COLORS.max) return;
    // Between the last and the first: it belongs with them from the start.
    const next = mixOklab(gradient.colors[gradient.colors.length - 1]!, gradient.colors[0]!, 0.5);
    setGradient(current => ({ ...current, colors: [...current.colors, next] }));
    setPicked(gradient.colors.length);
  };
  const remove = () => {
    if (gradient.colors.length <= GRADIENT_COLORS.min) return;
    setGradient(current => ({ ...current, colors: current.colors.filter((_, index) => index !== at) }));
    setPicked(Math.max(0, at - 1));
  };
  const roll = () => {
    // New colours in harmony, the style kept.
    const drawn = randomGradient(freshSeed());
    setGradient(current => ({ ...drawn, form: current.form }));
    setPicked(0);
  };
  const shuffle = () => setGradient(current => ({ ...current, seed: shuffleSeed(current.seed) }));

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Créer un dégradé')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <AppearancePreview appearance={draft} />

        <View style={styles.group}>
          <View style={styles.head}>
            <AppText variant="metaStrong" style={styles.flex}>
              {t('Couleurs')}
            </AppText>
            <IconButton icon="dice" label={t('Couleurs au hasard')} onPress={roll} shape={3} />
          </View>
          <View style={styles.stops} accessibilityRole="radiogroup" accessibilityLabel={t('Couleurs')}>
            {gradient.colors.map((color, index) => (
              <Stop key={index} color={color} index={index} selected={index === at} onPress={() => setPicked(index)} />
            ))}
            {gradient.colors.length < GRADIENT_COLORS.max ? (
              <Tappable accessibilityLabel={t('Ajouter une couleur')} onPress={add} pebble={gradient.colors.length} style={[styles.stop, styles.add]}>
                <Icon name="plus" size={20} color={theme.color.link} />
              </Tappable>
            ) : null}
          </View>
        </View>

        <ColorPicker value={gradient.colors[at]!} onChange={recolour} />
        {gradient.colors.length > GRADIENT_COLORS.min ? <Button kind="text" icon="minus" label={t('Retirer cette couleur')} onPress={remove} small /> : null}

        <View style={styles.group}>
          <AppText variant="metaStrong">{t('Style')}</AppText>
          <Segmented<GradientForm> value={gradient.form} onChange={form => setGradient(current => ({ ...current, form }))} options={GRADIENT_FORMS.map(form => ({ value: form, label: GRADIENT_FORM_NAMES[form] }))} />
          {gradient.form === 'nuees' ? <Button kind="text" icon="shuffle" label={t('Mélanger')} accessibilityLabel={t('Mélanger les nuées')} onPress={shuffle} small /> : null}
        </View>

        <SwitchRow title={t('Grain sur le fond')} supporting={t('Le grain de film sur le fond de l’écran.')} value={grain} onChange={setGrain} />
      </SheetScroll>
      <View style={styles.foot}>
        <Button kind="text" label={t('Annuler')} onPress={onDismiss} />
        <Button label={t('Utiliser ce fond')} onPress={() => onUse(gradient, grain)} />
      </View>
    </Sheet>
  );
}

export const GradientSheet = memo(GradientSheetComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: 8, paddingBottom: 16 },
    group: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    flex: { flex: 1 },
    stops: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    stop: { width: STOP, height: STOP, margin: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.hairline },
    ring: { borderWidth: 3, borderColor: theme.color.ink },
    // An "add" pebble is drawn by its edge alone, its plus in the link's ink.
    add: { borderWidth: 1.5, borderColor: theme.color.edge },
    foot: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
  });
