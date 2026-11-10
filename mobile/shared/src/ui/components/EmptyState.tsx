/**
 * An empty place, the same in every app and on both clients (the web's `EmptyState`): a collage, a
 * title, what goes there, then one action. Centred on the screen's column, so switching views it
 * never moves.
 */
import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { CollageScene } from '@unlease/design/collage';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Collage } from './Collage';

/** The collage's width, the web's too. */
export const EMPTY_COLLAGE_WIDTH = 252;

export interface EmptyStateProps {
  readonly scene: CollageScene;
  readonly title: string;
  readonly text?: string;
  /** One action (a tonal or filled `Button`), under the text. */
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

function EmptyStateComponent({ scene, title, text, children, style }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, style]}>
      {/* Keyed by its scene, so another empty view lays its own collage down afresh. */}
      <Collage key={scene} scene={scene} width={EMPTY_COLLAGE_WIDTH} />
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {text ? (
        <AppText variant="body" color={theme.color.inkMuted} style={styles.text}>
          {text}
        </AppText>
      ) : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, paddingBottom: 24, gap: 10 },
  title: { textAlign: 'center', marginTop: 18 },
  text: { textAlign: 'center', maxWidth: 360 },
  action: { marginTop: 8, alignItems: 'center', gap: 8 },
});

export const EmptyState = memo(EmptyStateComponent);
