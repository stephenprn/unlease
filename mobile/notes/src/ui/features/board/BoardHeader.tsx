/**
 * The top of the board: a search strip shaped like habits-garden's field, pinned. Under it, at
 * the head of the wall and scrolling away with it: a line when changes cannot reach the server,
 * then a chip per collection (its emblem, name and count) ending in a dashed "+ Collection".
 * While notes are picked the selection bar lies over the strip and the chips rest: nothing moves.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseHex } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { formatRelative, plural } from '@unlease/core/services/format';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { useLines } from '@app/hooks/useLines';
import { selectLastSync, selectPendingCount, selectSyncMessage, selectSyncPhase, useSyncStore, type SyncPhase } from '@app/store/syncStore';
import { showSnack } from '@app/store/uiStore';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmblemStone, Icon, IconButton, Organic, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { variantStyle } from '../../theme/typography';

export interface BoardHeaderProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly onMenu: () => void;
  /** The board's wall or list toggle; none on the pages' home. */
  readonly layout?: 'wall' | 'list';
  readonly onToggleLayout?: () => void;
  readonly placeholder: string;
  /** The dot's slip offers the server's settings when something there can put the sync right. */
  readonly onServer: () => void;
  /** Raised to put the keyboard in the search strip (a search asked for from the home screen). */
  readonly focusKey?: number;
}

/** The strip's own height, which the selection bar takes over exactly. */
export const SEARCH_HEIGHT = 54;
export const SEARCH_TOP = 8;

function syncText(phase: SyncPhase, pending: number, lastSync: number | null, message: string | null, clock: string | null): string {
  switch (phase) {
    case 'local':
      return t('Pas de serveur : les notes restent sur ce téléphone.');
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

function BoardHeaderComponent({ query, onQuery, onMenu, layout, onToggleLayout, placeholder, onServer, focusKey = 0 }: BoardHeaderProps) {
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
  const status = syncText(phase, pending, lastSync, message, clock);

  return (
    <View style={[styles.header, { paddingTop: insets.top + SEARCH_TOP }]}>
      <StatusBar barStyle={theme.barStyle} />
      <Organic style={styles.search}>
        {searching ? (
          <IconButton icon="back" label={t('Fermer la recherche')} onPress={() => { onQuery(''); input.current?.blur(); }} />
        ) : (
          <IconButton icon="menu" label={t('Menu')} onPress={onMenu} />
        )}
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
            <Tappable
              accessibilityLabel={status}
              hitSlop={8}
              // Unless a sync is fine or under way, the fix is in the Administration (a server, a token, an address).
              onPress={() => (phase === 'synced' || phase === 'syncing' ? showSnack(status, undefined, { tone: phase === 'synced' ? 'success' : 'info' }) : showSnack(status, { label: t('Serveur'), run: onServer }, { tone: phase === 'local' ? 'info' : phase === 'offline' ? 'warning' : 'error' }))}
              style={styles.dotTarget}
            >
              <View style={[styles.dot, { backgroundColor: dot }]} />
            </Tappable>
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
      {syncText(held, pending, null, message, null)}
    </AppText>
  );
}

export interface LineChipsProps {
  readonly onOpenLine: (id: string) => void;
  readonly onNewLine: () => void;
  /** Notes are being picked: the chips rest while the selection bar is up. */
  readonly selecting: boolean;
}

/** The collections as chips, at the head of the wall: they scroll away with it, so only the strip stays pinned. */
function LineChipsComponent({ onOpenLine, onNewLine, selecting }: LineChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const lines = useLines();
  return (
    <View pointerEvents={selecting ? 'none' : 'auto'} style={selecting ? styles.resting : null}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} keyboardShouldPersistTaps="handled">
        {lines.map(line => (
          <LineChip key={line.id} id={line.id} onPress={onOpenLine} />
        ))}
        <Tappable accessibilityLabel={t('Nouvelle collection')} onPress={onNewLine} style={styles.newLine}>
          <Icon name="plus" size={18} color={theme.color.link} />
          <AppText variant="label" color={theme.color.link}>
            {t('Collection')}
          </AppText>
        </Tappable>
      </ScrollView>
    </View>
  );
}

const LineChip = memo(function LineChipView({ id, onPress }: { id: string; onPress: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const note = useLibraryStore(s => s.notes[id]);
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length);
  if (!note) return null;
  if (id === INBOX_ID && count === 0) return null;
  // A capsule of paper, its collection's emblem on its own stone at the left end.
  return (
    <Organic style={styles.chip}>
      <Tappable accessibilityLabel={`${shownTitle(note)}, ${plural(count, 'lien')}`} onPress={() => onPress(id)} style={styles.chipPress}>
        <EmblemStone id={id} emblem={collectionEmblem(id, note.emblem)} color={asLineColor(note.color)} size={21} width={36} height={32} />
        <AppText variant="label" numberOfLines={1} style={styles.chipName}>
          {shownTitle(note)}
        </AppText>
        <AppText variant="labelSmall" color={styles.count.color}>
          {count}
        </AppText>
      </Tappable>
    </Organic>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // A little ground under the strip: the wall scrolls out of sight there, never against its edge.
    header: { paddingBottom: 6 },
    search: {
      marginHorizontal: 12,
      height: SEARCH_HEIGHT,
      ...corners(SHAPES.search),
      backgroundColor: theme.color.field,
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
    // 12 under the strip with the header's own 6, as when the chips were pinned.
    lines: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 8, alignItems: 'center' },
    resting: { opacity: 0.4 },
    // It clips its press to its own shape.
    chip: { ...corners(SHAPES.chip), backgroundColor: `rgba(${parseHex(theme.color.paper).join(', ')}, 0.82)`, borderWidth: 1, borderColor: theme.color.hairline, maxWidth: 230, overflow: 'hidden' },
    chipPress: { height: 44, paddingLeft: 5, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
    chipName: { flexShrink: 1 },
    count: { color: theme.color.inkMuted },
    // The dashed affordance: an ink edge, the label in deep terracotta.
    newLine: {
      height: 44,
      paddingLeft: 14,
      paddingRight: 16,
      ...corners(SHAPES.dashed),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.color.dashed,
    },
  });

export const BoardHeader = memo(BoardHeaderComponent);
export const SyncLine = memo(SyncLineComponent);
export const LineChips = memo(LineChipsComponent);
