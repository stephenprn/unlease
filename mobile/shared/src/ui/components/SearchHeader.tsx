/**
 * The top of an app's home (Carnet's board, Pages' list, Contacts' list): a search strip shaped like
 * habits-garden's field, pinned, the menu at its start and the sync dot at its end. `SyncLine` goes at
 * the head of what scrolls under it: a line when changes cannot reach the server. A search on a screen
 * of its own (Agenda's) is the same strip with Back at its start and no dot.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { selectLastSync, selectPendingCount, selectSyncMessage, selectSyncPhase, useSyncStore, type SyncPhase } from '@shared/app/store/syncStore';
import { showSnack } from '@shared/app/store/uiStore';

import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { Organic } from './Organic';
import { Tappable } from './Tappable';

export interface SearchHeaderProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** The drawer, on a home: while searching, Back takes its place and ends the search. */
  readonly onMenu?: () => void;
  /** A search on a screen of its own: Back always leads, and leaves it. */
  readonly onBack?: () => void;
  /** The board's wall or list toggle; none on the pages' home. */
  readonly layout?: 'wall' | 'list';
  readonly onToggleLayout?: () => void;
  readonly placeholder: string;
  /** The dot's slip offers the server's settings when something there can put the sync right. No dot without it. */
  readonly onServer?: () => void;
  /** Raised to put the keyboard in the search strip (a search asked for from the home screen, or a search screen opening). */
  readonly focusKey?: number;
  /** What the dot says with no server: where this app's things stay (« Pas de serveur : les notes restent sur ce téléphone. »). */
  readonly localText?: string;
}

/** The strip's own height, which the selection bar takes over exactly. */
export const SEARCH_HEIGHT = 54;
export const SEARCH_TOP = 8;

function syncText(phase: SyncPhase, pending: number, lastSync: number | null, message: string | null, clock: string | null, localText: string): string {
  switch (phase) {
    case 'local':
      return localText;
    case 'unauthorized':
      return t('Le serveur refuse le jeton. Vérifiez les réglages.');
    case 'offline':
      return pending > 0 ? t('Hors ligne : {changes} en attente.', { changes: plural(pending, 'modification') }) : message ? t('Hors ligne ({message}).', { message: t(message) }) : t('Hors ligne.');
    case 'syncing':
      return pending > 0 ? t('Envoi de {changes}…', { changes: plural(pending, 'modification') }) : t('Synchronisation…');
    default:
      return `${lastSync ? t('Synchronisé {when}.', { when: formatRelative(lastSync, Date.now()) }) : t('Synchronisé.')}${clock ? ` ${clock}` : ''}`;
  }
}

function SearchHeaderComponent({ query, onQuery, onMenu, onBack, layout, onToggleLayout, placeholder, onServer, focusKey = 0, localText = '' }: SearchHeaderProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (focusKey > 0) input.current?.focus();
  }, [focusKey]);
  const phase = useSyncStore(selectSyncPhase);
  const pending = useSyncStore(selectPendingCount);
  const lastSync = useSyncStore(selectLastSync);
  const message = useSyncStore(selectSyncMessage);
  const clock = useSyncStore(s => s.clock);
  const searching = query.length > 0;
  const dot = phase === 'synced' ? theme.color.ok : phase === 'unauthorized' ? theme.color.danger : phase === 'local' ? theme.color.inkFaint : theme.color.waiting;
  const status = syncText(phase, pending, lastSync, message, clock, localText);

  return (
    <View style={[styles.header, { paddingTop: insets.top + SEARCH_TOP }]}>
      <StatusBar barStyle={theme.barStyle} />
      <Organic frost style={styles.search}>
        {onBack ? (
          <IconButton icon="back" label={t('Fermer la recherche')} onPress={onBack} />
        ) : searching ? (
          <IconButton icon="back" label={t('Fermer la recherche')} onPress={() => { onQuery(''); input.current?.blur(); }} />
        ) : onMenu ? (
          <IconButton icon="menu" label={t('Menu')} onPress={onMenu} />
        ) : null}
        <TextInput
          ref={input}
          value={query}
          onChangeText={onQuery}
          placeholder={placeholder}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          returnKeyType="search"
          accessibilityLabel={t('Rechercher')}
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {searching ? (
          <IconButton icon="close" label={t('Effacer')} onPress={() => onQuery('')} />
        ) : (
          <>
            {layout && onToggleLayout ? <IconButton icon={layout === 'wall' ? 'rows' : 'grid'} label={layout === 'wall' ? t('Afficher en liste') : t('Afficher en mur')} onPress={onToggleLayout} shape={1} /> : null}
            {onServer ? (
              <Tappable
                accessibilityLabel={status}
                hitSlop={8}
                // Unless a sync is fine or under way, the fix is in the Administration (a server, a token, an address).
                onPress={() => (phase === 'synced' || phase === 'syncing' ? showSnack(status, undefined, { tone: phase === 'synced' ? 'success' : 'info' }) : showSnack(status, { label: t('Serveur'), run: onServer }, { tone: phase === 'local' ? 'info' : phase === 'offline' ? 'warning' : 'error' }))}
                style={styles.dotTarget}
              >
                <View style={[styles.dot, { backgroundColor: dot }]} />
              </Tappable>
            ) : null}
          </>
        )}
      </Organic>
    </View>
  );
}

/**
 * The dot's news in words, at the head of the wall, while changes cannot reach the server or the
 * token is refused. A retry while offline passes through `syncing`: the line holds until a sync
 * lands, so it never blinks. Nothing while syncing, synced, or alone on the phone by choice.
 */
function SyncLineComponent() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const phase = useSyncStore(selectSyncPhase);
  const pending = useSyncStore(selectPendingCount);
  const message = useSyncStore(selectSyncMessage);
  const [held, setHeld] = useState(phase);
  if (phase !== 'syncing' && phase !== held) setHeld(phase);
  if (held !== 'offline' && held !== 'unauthorized') return null;
  return (
    <AppText variant="meta" color={held === 'unauthorized' ? theme.color.danger : undefined} style={styles.syncLine}>
      {syncText(held, pending, null, message, null, '')}
    </AppText>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // A little ground under the strip: the wall scrolls out of sight there, never against its edge.
    header: { paddingBottom: 6 },
    search: {
      marginHorizontal: 12,
      height: SEARCH_HEIGHT,
      ...corners(SHAPES.search),
      backgroundColor: theme.color.fieldVeil,
      borderWidth: 1,
      borderColor: theme.color.outline,
      flexDirection: 'row',
      alignItems: 'center',
      // The menu and the dot sit clear of the bar's rounded ends.
      paddingHorizontal: 4,
    },
    input: { flex: 1, color: theme.color.ink, paddingVertical: 0, height: SEARCH_HEIGHT - 2 },
    dotTarget: { width: 32, height: 32, marginRight: 8, ...corners(SHAPES.dot), alignItems: 'center', justifyContent: 'center' },
    dot: { width: 11, height: 11, ...corners(SHAPES.dot) },
    // In line with the section heads, close under the strip as a field's help sits under its field.
    syncLine: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  });

export const SearchHeader = memo(SearchHeaderComponent);
export const SyncLine = memo(SyncLineComponent);
