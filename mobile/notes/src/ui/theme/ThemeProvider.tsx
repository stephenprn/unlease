/**
 * The theme provider (resolves `system` against the OS and paints it with the device's appearance)
 * and `useThemedStyles`, which caches one sheet per (factory, theme): a factory runs again only
 * when the theme itself changes (another mode, colour or ground).
 */
import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

import { selectAppearance, selectThemePreference, useSettingsStore } from '@app/store/settingsStore';

import { lightTheme, themeFor, type Theme, type ThemeMode } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  mode,
  children,
}: {
  /** Pins a subtree to one theme; only for drawings of something that is not this app. */
  mode?: ThemeMode;
  children: React.ReactNode;
}): React.ReactElement {
  const preference = useSettingsStore(selectThemePreference);
  const appearance = useSettingsStore(selectAppearance);
  const system = useColorScheme();
  const resolved: ThemeMode =
    mode ?? (preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference);
  return <ThemeContext.Provider value={themeFor(resolved, appearance)}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Per theme (themes are kept as objects, `themeFor`), the sheet each factory made for it. */
const cache = new WeakMap<Theme, Map<(theme: Theme) => unknown, unknown>>();

export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  let byFactory = cache.get(theme);
  if (!byFactory) {
    byFactory = new Map();
    cache.set(theme, byFactory);
  }
  if (byFactory.has(factory)) return byFactory.get(factory) as T;
  const made = factory(theme);
  byFactory.set(factory, made);
  return made;
}
