/**
 * While notes are picked, the search strip turns into this bar: the same place, the same size,
 * washed matcha. Nothing on the board moves; Back puts the strip back.
 */
import React, { memo, useCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';

import { AnimatedOrganic, AppText, IconButton } from '../../components';
import { duration } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { SEARCH_HEIGHT, SEARCH_TOP } from './BoardHeader';

function SelectionBarComponent({ count, onClose, children }: { count: number; onClose: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Only while the board is the screen shown: a screen opened over it (a widget, a share) takes its own Back.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => subscription.remove();
    }, [onClose]),
  );
  return (
    <AnimatedOrganic
      entering={FadeIn.duration(duration.short)}
      exiting={FadeOut.duration(duration.short)}
      style={[styles.bar, { top: insets.top + SEARCH_TOP }]}
      accessibilityLiveRegion="polite"
    >
      <IconButton icon="close" label={t('Annuler la sélection')} color={styles.ink.color} onPress={onClose} />
      <AppText variant="title" color={styles.ink.color} style={styles.count} accessibilityLabel={plural(count, 'sélectionnée')}>
        {`${count}`}
      </AppText>
      <View style={styles.actions}>{children}</View>
    </AnimatedOrganic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 12,
      right: 12,
      height: SEARCH_HEIGHT,
      ...corners(SHAPES.search),
      backgroundColor: theme.color.actionContainer,
      borderWidth: 1,
      borderColor: theme.color.focus,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    ink: { color: theme.color.onActionContainer },
    count: { flex: 1, marginLeft: 4 },
    actions: { flexDirection: 'row', alignItems: 'center' },
  });

export const SelectionBar = memo(SelectionBarComponent);
