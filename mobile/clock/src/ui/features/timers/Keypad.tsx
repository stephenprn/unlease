/**
 * A timer's length, typed as on a microwave (Google's Clock types it so): digits come in on the right,
 * `5 0 0` is 5 minutes. The display shows hours, minutes and seconds in Signika at 48, what was typed
 * in ink and the zeros before it in the faint ink; the keypad is twelve keys, 64 high at the row radius
 * on the raised paper, each click a tick; « ⌫ » takes the last digit back, held it clears them all.
 * TalkBack hears the length whole and each key by its name.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { keypadFields, keypadSeconds, lengthSentence } from '@unlease/clock/services/timers';
import { haptic } from '@shared/platform/haptics';
import { AppText, Icon, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { SHAPES } from '@unlease/design/shapes';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'erase'] as const;

interface DisplayProps {
  readonly digits: string;
}

/** `00h 05m 00s`: the typed digits in ink, the zeros before them faint. */
function LengthDisplayComponent({ digits }: DisplayProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const fields = keypadFields(digits);
  // Of the six places, those from here on were typed.
  const typedFrom = 6 - digits.length;
  const units = [t('h [hours]'), t('m [minutes]'), t('s [seconds]')];
  const seconds = keypadSeconds(digits);
  return (
    <View style={styles.display} accessible accessibilityLiveRegion="polite" accessibilityLabel={seconds > 0 ? lengthSentence(seconds) : t('No length yet')}>
      {fields.map((field, index) => (
        <View key={index} style={styles.group}>
          {[...field].map((digit, at) => (
            <AppText key={at} style={[styles.digit, { color: index * 2 + at >= typedFrom ? theme.color.ink : theme.color.inkFaint }]}>
              {digit}
            </AppText>
          ))}
          <AppText variant="bodyStrong" color={index * 2 + 1 >= typedFrom ? theme.color.inkMuted : theme.color.inkFaint} style={styles.unit}>
            {units[index]}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export const LengthDisplay = memo(LengthDisplayComponent);

interface KeypadProps {
  readonly onKey: (key: string) => void;
  readonly onErase: () => void;
  readonly onClear: () => void;
  /** Nothing typed: « ⌫ » has nothing to take back. */
  readonly empty: boolean;
}

function KeypadComponent({ onKey, onErase, onClear, empty }: KeypadProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.pad}>
      {KEYS.map(key =>
        key === 'erase' ? (
          <Tappable
            key={key}
            onPress={() => {
              haptic('tick');
              onErase();
            }}
            onLongPress={() => {
              haptic('confirm');
              onClear();
            }}
            disabled={empty}
            accessibilityRole="button"
            accessibilityLabel={t('Erase a digit')}
            accessibilityHint={t('Hold to erase everything')}
            style={[styles.key, styles.eraseKey]}
          >
            <Icon name="back" size={26} color={empty ? theme.color.inkFaint : theme.color.ink} />
          </Tappable>
        ) : (
          <Tappable
            key={key}
            onPress={() => {
              haptic('tick');
              onKey(key);
            }}
            accessibilityRole="button"
            accessibilityLabel={key}
            style={styles.key}
          >
            <AppText style={styles.keyText}>{key}</AppText>
          </Tappable>
        ),
      )}
    </View>
  );
}

export const Keypad = memo(KeypadComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    display: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 14, paddingVertical: 8 },
    group: { flexDirection: 'row', alignItems: 'baseline' },
    digit: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 48, lineHeight: 56, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    unit: { marginLeft: 3 },
    pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    key: { width: '31.5%', height: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paperHigh, ...corners(SHAPES.tab) },
    eraseKey: { backgroundColor: 'transparent' },
    keyText: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 26, lineHeight: 32, color: theme.color.ink, fontVariant: ['tabular-nums'] },
  });
}
