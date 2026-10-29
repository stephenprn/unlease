/**
 * Material's small top app bar. Transparent by default, so the screen's own grained paper runs
 * through it. A collection's emblem before the title makes the bar that collection's; pressable,
 * the title is a picker (a chevron follows it).
 */
import React, { memo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CollectionEmblem } from '@unlease/design/emblems';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

import { corners } from '../theme/shape';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Emblem } from './Emblem';
import { Grain } from './Grain';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Tappable } from './Tappable';

export interface TopBarProps {
  readonly title?: string;
  readonly onBack?: () => void;
  readonly actions?: React.ReactNode;
  /** Paint behind the bar (a note's tint). */
  readonly background?: string;
  /** A collection's emblem before the title. */
  readonly emblem?: { readonly emblem: CollectionEmblem; readonly color: LineColor | null };
  readonly onTitlePress?: () => void;
  /** What pressing the title does, for screen readers. */
  readonly titleLabel?: string;
}

function TopBarComponent({ title, onBack, actions, background, emblem, onTitlePress, titleLabel }: TopBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fill = background;
  const text = title ? (
    <AppText variant="title" numberOfLines={1} style={styles.fill} accessibilityRole="header">
      {title}
    </AppText>
  ) : null;
  return (
    <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: fill }]}>
      {fill ? <Grain /> : null}
      <StatusBar barStyle={theme.barStyle} />
      <View style={styles.row}>
        {onBack ? <IconButton icon="back" label={t('Retour')} onPress={onBack} /> : <View style={styles.spacer} />}
        {emblem && onTitlePress ? (
          <View style={styles.title}>
            <Tappable onPress={onTitlePress} accessibilityLabel={titleLabel ?? title} accessibilityRole="button" style={styles.sign}>
              <Emblem emblem={emblem.emblem} color={emblem.color} size={30} />
              <View style={styles.pick}>
                {text}
                <Icon name="chevronDown" size={18} color={theme.color.inkMuted} />
              </View>
            </Tappable>
          </View>
        ) : title ? (
          <View style={styles.title}>
            <View style={styles.sign}>
              {emblem ? <Emblem emblem={emblem.emblem} color={emblem.color} size={30} /> : null}
              {text}
            </View>
          </View>
        ) : (
          <View style={styles.title} />
        )}
        <View style={styles.actions}>{actions}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { overflow: 'hidden' },
  row: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  spacer: { width: 12 },
  // A column, so the sign below hugs its text: centred on the row like the back pebble beside it.
  title: { flex: 1, marginLeft: 4, justifyContent: 'center' },
  fill: { flexShrink: 1 },
  sign: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 48, paddingLeft: 4, paddingRight: 12, ...corners(SHAPES.chip) },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
});

export const TopBar = memo(TopBarComponent);
