/**
 * Providers and the overlays above every screen. Bootstrap runs once, synchronously, before the
 * theme provider mounts: the stored theme applies from the first frame and no store changes mid-render.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type InitialState, type Theme as NavigationTheme } from '@react-navigation/native';

import { t } from '@unlease/core/i18n';
import { selectLocale, useSettingsStore } from '@app/store/settingsStore';

import { AppText, Snackbar } from '@ui/components';
import type { Theme } from '@ui/theme/theme';
import { ThemeProvider, useTheme, useThemedStyles } from '@ui/theme/ThemeProvider';
import { fontFamily } from '@ui/theme/typography';
import { linking, RootNavigator } from '@ui/navigation/RootNavigator';
import { navigationRef } from '@ui/navigation/navigationRef';
import { Overlays } from '@ui/features/capture/Overlays';

import { bootstrap, type BootResult } from '../bootstrap';

function navigationThemeFor(theme: Theme): NavigationTheme {
  return {
    dark: theme.mode === 'dark',
    colors: {
      primary: theme.color.action,
      background: theme.color.wall,
      card: theme.color.wall,
      text: theme.color.ink,
      border: 'transparent',
      notification: theme.color.action,
    },
    fonts: {
      regular: { fontFamily: fontFamily(theme, 'Regular'), fontWeight: '400' },
      medium: { fontFamily: fontFamily(theme, 'Medium'), fontWeight: '400' },
      bold: { fontFamily: fontFamily(theme, 'Bold'), fontWeight: '400' },
      heavy: { fontFamily: fontFamily(theme, 'Bold'), fontWeight: '400' },
    },
  };
}

function Gate({ boot }: { boot: BootResult }): React.ReactElement {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The navigator's own colours follow the theme: its mode, and the accent the appearance chose.
  const navigationTheme = useMemo(() => navigationThemeFor(theme), [theme]);
  // A new language draws every screen again: the stack is kept and laid back as it was.
  const locale = useSettingsStore(selectLocale);
  const navigation = useRef<InitialState | undefined>(undefined);
  if (!boot.ok) {
    return (
      <View style={styles.centre}>
        <AppText variant="title">{t('Les notes n’ont pas pu être ouvertes')}</AppText>
        <AppText variant="meta" style={styles.error}>
          {boot.message}
        </AppText>
      </View>
    );
  }
  return (
    <NavigationContainer
      key={locale}
      ref={navigationRef}
      theme={navigationTheme}
      // Always given, or the links a widget or a notification opens stop arriving after the first redraw; the kept stack wins over the launch link.
      linking={linking}
      initialState={navigation.current}
      onStateChange={state => {
        navigation.current = state as InitialState | undefined;
      }}
      fallback={<View style={styles.blank} />}
    >
      <RootNavigator />
      <Overlays />
      <Snackbar />
    </NavigationContainer>
  );
}

function Shell({ boot }: { boot: BootResult }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Gate boot={boot} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function AppProviders(): React.ReactElement {
  const [boot] = useState(bootstrap);
  return (
    <ThemeProvider>
      <Shell boot={boot} />
    </ThemeProvider>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.wall },
    blank: { flex: 1, backgroundColor: theme.color.wall },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: theme.color.wall },
    error: { textAlign: 'center' },
  });
