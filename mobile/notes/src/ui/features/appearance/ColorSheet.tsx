/**
 * A colour picked precisely, for the primary, the accent or the ground: the day and the night it
 * would make, a line saying whether the colour shows as picked or moved to stay readable, Carnet's
 * own colours to start from, then the picker. Nothing changes on the screens until "Choisir".
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COLOR_ROLE_WORDS, longestPickNote, pickAdjusted, pickNote, pickSuggestions, resolveAppearance, type Appearance, type PickNote, type PickTarget } from '@unlease/design/appearance';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import { selectAppearance, useSettingsStore } from '@app/store/settingsStore';

import { AppText, Button, Icon, PressSurface, Sheet, SheetScroll, Tappable } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { AppearancePreview } from './AppearancePreview';
import { ColorPicker } from './ColorPicker';

export interface ColorSheetProps {
  readonly visible: boolean;
  readonly target: PickTarget;
  /** The colour it opens on. */
  readonly initial: string;
  readonly onDismiss: () => void;
  readonly onChoose: (hex: string) => void;
}

/** The appearance with `hex` where the picker puts it. */
function withPick(appearance: Appearance, target: PickTarget, hex: string): Appearance {
  if (target === 'ground') return { ...appearance, ground: { kind: 'color', color: hex } };
  return target === 'primary' ? { ...appearance, primary: hex } : { ...appearance, accent: hex };
}

/**
 * What the colour does, under the preview. An invisible twin holding the longest line keeps the
 * room, so the sheet never changes height as a drag crosses into a colour that moves (the web's).
 */
export function PickLine({ note }: { note: PickNote }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = note.adjusted ? theme.color.ink : theme.color.inkMuted;
  return (
    <View>
      <View style={[styles.noteLine, styles.noteSizer]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon name="info" size={16} color={ink} />
        <AppText variant="meta" style={styles.noteWords}>
          {longestPickNote()}
        </AppText>
      </View>
      <View style={[styles.noteLine, styles.noteShown]} accessible accessibilityLiveRegion="polite">
        <Icon name={note.adjusted ? 'info' : 'check'} size={16} color={ink} />
        <AppText variant="meta" color={ink} style={styles.noteWords}>
          {note.text}
        </AppText>
      </View>
    </View>
  );
}

/** Carnet's own colours to start from, as small pebbles; the one the picker stands on is ringed in ink. */
export function PickSuggestions({ target, value, onPick }: { target: PickTarget; value: string; onPick: (hex: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.suggestions} accessibilityRole="radiogroup" accessibilityLabel={t('Suggestions')}>
      {pickSuggestions(target).map(({ name, color }, index) => {
        const chosen = color.toUpperCase() === value.toUpperCase();
        return (
          <Tappable key={color} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ selected: chosen }} onPress={() => onPick(color)} noTint style={styles.suggestion}>
            <PressSurface pebble={pebbleTurn(index)} style={[styles.suggestionPaint, { backgroundColor: color }, chosen ? styles.suggestionChosen : null]} />
          </Tappable>
        );
      })}
    </View>
  );
}

function ColorSheetComponent({ visible, target, initial, onDismiss, onChoose }: ColorSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const appearance = useSettingsStore(selectAppearance);
  const [hex, setHex] = useState(initial);
  // Each opening starts again from the colour it opens on.
  const [open, setOpen] = useState(visible);
  if (visible !== open) {
    setOpen(visible);
    if (visible) setHex(initial);
  }
  const draft = withPick(appearance, target, hex);
  const grounds = { light: resolveAppearance(draft, 'light').ground.colors, dark: resolveAppearance(draft, 'dark').ground.colors };
  const note = pickNote(pickAdjusted(target, hex, 'light', grounds.light), pickAdjusted(target, hex, 'dark', grounds.dark));
  const title = target === 'ground' ? t('Couleur du fond') : COLOR_ROLE_WORDS[target].title;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <View style={styles.top}>
          <AppearancePreview appearance={draft} compact />
          <PickLine note={note} />
        </View>
        <PickSuggestions target={target} value={hex} onPick={setHex} />
        <ColorPicker value={hex} onChange={setHex} />
      </SheetScroll>
      <View style={styles.foot}>
        <Button kind="text" label={t('Annuler')} onPress={onDismiss} />
        <Button label={t('Choisir')} onPress={() => onChoose(hex)} />
      </View>
    </Sheet>
  );
}

export const ColorSheet = memo(ColorSheetComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 14, paddingHorizontal: 8, paddingBottom: 16 },
    top: { gap: 10 },
    noteLine: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 6 },
    noteSizer: { opacity: 0 },
    noteShown: { position: 'absolute', top: 0, left: 0, right: 0 },
    noteWords: { flexShrink: 1, textAlign: 'center' },
    suggestions: { flexDirection: 'row', justifyContent: 'space-between' },
    // A 40 by 48 target around a 32 pebble: eight fit across the narrowest sheet.
    suggestion: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
    suggestionPaint: { width: 32, height: 32, borderWidth: 1, borderColor: theme.color.hairline },
    suggestionChosen: { borderWidth: 2.5, borderColor: theme.color.ink },
    foot: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
  });
