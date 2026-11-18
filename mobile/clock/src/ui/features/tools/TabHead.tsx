/**
 * The head of Clock's timers, stopwatch and world clocks: the drawer's button alone, as tall as the
 * alarms' search strip (`SearchHeader`), so nothing jumps between places; actions at its end. The
 * place's name is the bar's at the foot, never written twice: TalkBack hears it as the head.
 * Transparent: the ground runs under it.
 */
import React, { memo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { IconButton, SEARCH_HEIGHT, SEARCH_TOP } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

interface Props {
  readonly title: string;
  readonly onMenu: () => void;
  readonly actions?: React.ReactNode;
}

function TabHeadComponent({ title, onMenu, actions }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + SEARCH_TOP }]}>
      <StatusBar barStyle={theme.barStyle} />
      <View style={styles.row}>
        <IconButton icon="menu" label={t('Menu')} onPress={onMenu} />
        <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={title} />
        {actions}
      </View>
    </View>
  );
}

export const TabHead = memo(TabHeadComponent);

const styles = StyleSheet.create({
  head: { paddingHorizontal: 12 },
  row: { height: SEARCH_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, marginLeft: 4 },
});
