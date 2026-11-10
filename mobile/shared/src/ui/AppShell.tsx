/**
 * Every phone app's root: the providers, the navigator the app hands in, the overlays above every
 * screen (the snackbar, the sheet that sends the look to the other apps, the app's own, and the
 * app-off screen when the server does not run it).
 * Bootstrap runs once, synchronously, before the theme provider mounts: the stored theme applies from
 * the first frame and no store changes mid-render.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type InitialState, type LinkingOptions, type NavigationContainerRefWithCurrent, type Theme as NavigationTheme } from '@react-navigation/native';

import type { AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { selectLocale, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, Snackbar } from './components';
import { LookShareSheet } from './features/appearance/LookShare';
import { AppOffScreen, useAppOff } from './screens/AppOffScreen';
import type { Theme } from './theme/theme';
import { ThemeProvider, useTheme, useThemedStyles } from './theme/ThemeProvider';
import { fontFamily } from './theme/typography';

export type BootResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

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

export interface AppShellProps<P extends object> {
  /** The app this phone is: the app-off screen covers everything while the server does not run it. */
  readonly app: AppId;
  /** Everything true before the first screen renders (the database, the settings, the library). */
  readonly bootstrap: () => BootResult;
  readonly linking: LinkingOptions<P>;
  readonly navigationRef: NavigationContainerRefWithCurrent<P>;
  /** The app's navigator. */
  readonly children: React.ReactNode;
  /** Drawn above every screen, under the snackbar (Carnet's capture sheet, its transfer panel). */
  readonly overlays?: React.ReactNode;
  /** From the app-off screen: the way to the Réglages (another server, or this phone alone). */
  readonly onSettings?: () => void;
}

function Gate<P extends object>({ boot, app, linking, navigationRef, children, overlays, onSettings }: Omit<AppShellProps<P>, 'bootstrap'> & { boot: BootResult }): React.ReactElement {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  // The navigator's own colours follow the theme: its mode, and the accent the appearance chose.
  const navigationTheme = useMemo(() => navigationThemeFor(theme), [theme]);
  // A new language draws every screen again: the stack is kept and laid back as it was.
  const locale = useSettingsStore(selectLocale);
  const navigation = useRef<InitialState | undefined>(undefined);
  const off = useAppOff(app);
  if (!boot.ok) {
    return (
      <View style={styles.centre}>
        <AppText variant="title">{t('L’application n’a pas pu s’ouvrir')}</AppText>
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
      {/* Off, the app's screens stay mounted under its notice, out of TalkBack's reach. */}
      <View style={styles.fill} importantForAccessibility={off ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={off}>
        {children}
        {overlays}
        <LookShareSheet />
      </View>
      {off ? <AppOffScreen app={app} onSettings={onSettings} /> : null}
      <Snackbar />
    </NavigationContainer>
  );
}

export function AppShell<P extends object>({ bootstrap, ...props }: AppShellProps<P>): React.ReactElement {
  const [boot] = useState(bootstrap);
  return (
    <ThemeProvider>
      <Shell>
        <Gate boot={boot} {...props} />
      </Shell>
    </ThemeProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.wall },
    blank: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: theme.color.wall },
    error: { textAlign: 'center' },
  });
