/**
 * A gradient of one's own for the ground: two to four colours, each picked precisely (or drawn at
 * random, in harmony), blended from the top to the foot (Fondu) or pooled as soft clouds (Nuées),
 * grainy or not. The day and the night it makes show above; nothing
 * changes on the screens until "Utiliser ce fond".
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';

import { GRADIENT_COLORS, GRADIENT_FORM_NAMES, GRADIENT_FORMS, randomGradient, type Appearance, type GradientForm, type GradientSpec } from '@unlease/design/appearance';
import { mixOklab } from '@unlease/design/color';
import { t } from '@unlease/core/i18n';
import { selectAppearance, useSettingsStore } from '@shared/app/store/settingsStore';

import { AnimatedOrganic, AppText, Button, FormFoot, Icon, IconButton, Segmented, Sheet, SHEET_INSET, SheetScroll, Tappable, useUnsaved } from '../../components';
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
      accessibilityLabel={t('Colour {n}: {color}', { n: index + 1, color })}
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
  // A gradient made is not dropped by a slip: a drag, the scrim or Back ask first; « Annuler » is the word for it.
  const unsaved = useUnsaved(visible && (grain !== initialGrain || JSON.stringify(gradient) !== JSON.stringify(initial)));
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

  return (
    <>
      <Sheet visible={visible} onDismiss={unsaved.guard(onDismiss)} title={t('Make a gradient')} tall>
        <SheetScroll contentContainerStyle={styles.body}>
          <AppearancePreview appearance={draft} />

          {/* The colours as pebbles say what they are: no word over them (TalkBack hears « Couleurs »); the dice at their row's end. */}
          <View style={styles.colors}>
            <View style={styles.stops} accessibilityRole="radiogroup" accessibilityLabel={t('Colours')}>
              {gradient.colors.map((color, index) => (
                <Stop key={index} color={color} index={index} selected={index === at} onPress={() => setPicked(index)} />
              ))}
              {gradient.colors.length < GRADIENT_COLORS.max ? (
                <Tappable accessibilityLabel={t('Add a colour')} onPress={add} pebble={gradient.colors.length} style={[styles.stop, styles.add]}>
                  <Icon name="plus" size={20} color={theme.color.link} />
                </Tappable>
              ) : null}
            </View>
            <IconButton icon="dice" label={t('Random colours')} onPress={roll} shape={3} />
          </View>

          <ColorPicker value={gradient.colors[at]!} onChange={recolour} />
          {gradient.colors.length > GRADIENT_COLORS.min ? <Button kind="text" icon="minus" label={t('Remove this colour')} onPress={remove} small style={styles.remove} /> : null}

          <View style={styles.group}>
            <AppText variant="metaStrong">{t('Style')}</AppText>
            <Segmented<GradientForm> label={t('Style')} value={gradient.form} onChange={form => setGradient(current => ({ ...current, form }))} options={GRADIENT_FORMS.map(form => ({ value: form, label: GRADIENT_FORM_NAMES[form] }))} />
          </View>

          <View style={styles.row}>
            <SwitchRow title={t('Grain on the background')} value={grain} onChange={setGrain} />
          </View>
        </SheetScroll>
        <FormFoot>
          <Button kind="text" label={t('Cancel')} onPress={onDismiss} />
          <Button
            label={t('Use this background')}
            onPress={() => {
              unsaved.saved();
              onUse(gradient, grain);
            }}
          />
        </FormFoot>
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

export const GradientSheet = memo(GradientSheetComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 16 },
    group: { gap: 8 },
    colors: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // The pebbles' own 2 of margin given back, so the first stands on the sheet's column.
    stops: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginLeft: -2 },
    stop: { width: STOP, height: STOP, margin: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.hairline },
    ring: { borderWidth: 3, borderColor: theme.color.ink },
    // An "add" pebble is drawn by its edge alone, its plus in the link's ink.
    add: { borderWidth: 1.5, borderColor: theme.color.edge },
    // A list row's own inset and padding (16) given back: its words on the sheet's column (24), its switch at the segments' end.
    row: { marginHorizontal: -16 },
    // A text button's padding given back: its glyph on the sheet's column, under the colour's pebble.
    remove: { marginLeft: -14 },
  });
