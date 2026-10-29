/**
 * The quick window's root (`quickWindow` in index.js): the same bootstrap and theme as the app, no
 * navigator, nothing behind the sheet but the home screen. A library that cannot open closes it.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@ui/theme/ThemeProvider';
import { QuickRoot, type QuickLaunch } from '@ui/features/widgets/QuickRoot';

import { bootstrap } from '../bootstrap';
import { leaveQuick } from '../widgets';

/** What QuickActivity hands over (its launch options); anything missing reads as the link field. */
export function QuickProviders(props: Partial<QuickLaunch>): React.ReactElement | null {
  const [boot] = useState(bootstrap);
  useEffect(() => {
    if (!boot.ok) leaveQuick(false);
  }, [boot.ok]);
  if (!boot.ok) return null;
  const launch: QuickLaunch = {
    mode: props.mode === 'collection' || props.mode === 'label' || props.mode === 'note' ? props.mode : 'link',
    widgetId: typeof props.widgetId === 'number' ? props.widgetId : -1,
    target: typeof props.target === 'string' ? props.target : '',
    configuring: props.configuring === true,
  };
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <QuickRoot launch={launch} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
