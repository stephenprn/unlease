/**
 * A small place with nothing in it (a picker's list, a sheet's answers, a block, a search inside a
 * sheet): a glyph, one sentence in the muted ink, and a way out. A whole place that is empty is an
 * `EmptyState`; this is its line, the same on the web (`EmptyLine`). It settles in a moment after it
 * is called for, so a list that fills at once never flashes it; another sentence settles in afresh,
 * the same one kept as more letters are typed does not. Reduce Motion shows it still.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import type { GlyphName } from '@unlease/design/glyphs';

import { decelerate, duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { VARIANTS } from '../theme/typography';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

/** The type role of the lines it stands among. */
export type EmptyLineSize = 'meta' | 'label' | 'card' | 'body';

const VARIANT = { meta: 'meta', label: 'label', card: 'cardBody', body: 'body' } as const;

/** How long it waits before settling in: a list that fills at once never shows it. */
export const EMPTY_LINE_DELAY = duration.beat;

/** Its arrival: a rise of 8 and a fade, on the decelerate curve. A dashed panel that says the same settles in with it. */
export const settleIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate },
})
  .duration(duration.medium)
  .delay(EMPTY_LINE_DELAY);

export interface EmptyLineProps {
  readonly text: string;
  readonly glyph?: GlyphName;
  /** `start` (default) where rows would begin; `center` alone in a panel or a block. */
  readonly align?: 'start' | 'center';
  /** Default `meta`, a list's small print. */
  readonly size?: EmptyLineSize;
  /** A quiet text button after the sentence. */
  readonly action?: { readonly label: string; readonly onPress: () => void };
  /** The glyph centred in a slot this wide, and the words this far after it: on the column of the rows it stands for. */
  readonly slot?: number;
  readonly gap?: number;
  /** Its place in the surrounding layout (paddings, margins). */
  readonly style?: StyleProp<ViewStyle>;
  /** What a new arrival follows: the sentence (default). One that names what is typed (« Aucun emoji pour « {query} » ») passes what it says instead, so more letters do not replay it. */
  readonly replayKey?: string;
}

function EmptyLineComponent({ text, glyph, align = 'start', size = 'meta', action, slot, gap, style, replayKey }: EmptyLineProps) {
  const theme = useTheme();
  const variant = VARIANT[size];
  const centred = align === 'center';
  return (
    <View style={style} accessibilityLiveRegion="polite">
      {/* Keyed by its sentence: another one settles in afresh. */}
      <Animated.View key={replayKey ?? text} entering={settleIn} style={[styles.settle, centred ? styles.centred : null]}>
        <View style={[styles.say, centred ? styles.sayCentred : null, gap !== undefined ? { gap } : null]}>
          {glyph ? (
            <View style={[styles.glyph, { height: VARIANTS[variant].lineHeight }, slot !== undefined ? { width: slot } : null]}>
              <Icon name={glyph} size={20} color={theme.color.inkMuted} />
            </View>
          ) : null}
          <AppText variant={variant} color={theme.color.inkMuted} style={[styles.text, centred ? styles.textCentred : null]}>
            {text}
          </AppText>
        </View>
        {action ? <Button kind="text" small label={action.label} onPress={action.onPress} style={centred ? styles.actionCentred : null} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  settle: { gap: 4 },
  centred: { alignItems: 'center', gap: 8 },
  say: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sayCentred: { justifyContent: 'center' },
  glyph: { justifyContent: 'center', alignItems: 'center' },
  text: { flexShrink: 1 },
  textCentred: { textAlign: 'center' },
  actionCentred: { alignSelf: 'center' },
});

export const EmptyLine = memo(EmptyLineComponent);
