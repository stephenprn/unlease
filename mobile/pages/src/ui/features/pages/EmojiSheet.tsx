/**
 * The emoji picker for a page's or a callout's icon, on the phone: a tall sheet with a search on
 * top (French and English names and keywords), then the everyday ones and Unicode's groups, or what
 * the search found; a pasted emoji is offered as it is. Each emoji lies on its own pebble, the
 * current one on matcha. The grid is a list of rows, so the whole catalogue scrolls smoothly.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type ListRenderItemInfo } from 'react-native';

import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import { emojiName, EVERYDAY_EMOJI, searchEmoji, typedEmoji, type EmojiCatalogue } from '@unlease/design/emojiSearch';

import { AppText, Button, EmptyLine, Sheet, SHEET_INSET, SheetFlatList, Tappable, TextField } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { emojiCatalogue, emojiLanguages, loadedEmojiCatalogue } from './EmojiCatalogue';

export interface EmojiSheetProps {
  readonly visible: boolean;
  /** Offers « Retirer l’icône » (a page's icon may go; a callout's may not). */
  readonly allowNone: boolean;
  readonly onPick: (emoji: string | null) => void;
  readonly onDismiss: () => void;
  /** The icon worn now: it lies on matcha, and « Retirer l’icône » shows only while there is one. */
  readonly value?: string | null;
  readonly title?: string;
}

const CELL = 48;
const HEAD = 40;
/** From the screen's edge to the grid's: the sheet's own 8, then its column. */
const SHEET_SIDE = 8 + SHEET_INSET;
/** Once the sheet has risen, the catalogue is made searchable: never during its motion. */
const PREPARE_AFTER_MS = 320;

type Cell = { readonly emoji: string; readonly name: string };
type Row = { readonly kind: 'head'; readonly key: string; readonly title: string } | { readonly kind: 'cells'; readonly key: string; readonly row: number; readonly cells: readonly Cell[] } | { readonly kind: 'note'; readonly key: string; readonly text: string };

const rowHeight = (row: Row): number => (row.kind === 'head' ? HEAD : row.kind === 'cells' ? CELL : 56);

/** A section's emoji cut into rows of `columns`; `row` counts on, so neighbours across rows lie on other turns. */
function cellRows(key: string, cells: readonly Cell[], columns: number): Row[] {
  const rows: Row[] = [];
  for (let at = 0; at < cells.length; at += columns) rows.push({ kind: 'cells', key: `${key}-${at}`, row: at / columns, cells: cells.slice(at, at + columns) });
  return rows;
}

const EmojiCell = memo(function EmojiCell({ emoji, name, turn, current, onPick }: { emoji: string; name: string; turn: number; current: boolean; onPick: (emoji: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.slot}>
      <Tappable pebble={turn} accessibilityLabel={name} accessibilityState={{ selected: current }} onPress={() => onPick(emoji)} style={[styles.cell, current ? { backgroundColor: theme.color.actionContainer } : null]}>
        <AppText style={styles.emoji} allowFontScaling={false}>
          {emoji}
        </AppText>
      </Tappable>
    </View>
  );
});

function EmojiSheetComponent({ visible, allowNone, onPick, onDismiss, value = null, title }: EmojiSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [catalogue, setCatalogue] = useState<EmojiCatalogue | null>(loadedEmojiCatalogue);
  // A catalogue that cannot be made searchable says so, never « Chargement… » for good.
  const [failed, setFailed] = useState(false);
  const columns = Math.max(5, Math.floor((width - 2 * SHEET_SIDE) / CELL));
  const languages = emojiLanguages();

  // Each opening starts on an empty search; the catalogue arriving later keeps what was typed, and searches it.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  useEffect(() => {
    if (!visible || catalogue || failed) return;
    const timer = setTimeout(() => {
      try {
        setCatalogue(emojiCatalogue());
      } catch {
        setFailed(true);
      }
    }, PREPARE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible, catalogue, failed]);

  const pick = useCallback((emoji: string | null) => onPick(emoji), [onPick]);

  const byEmoji = useMemo(() => new Map(catalogue?.emojis.map(emoji => [emoji.emoji, emoji]) ?? []), [catalogue]);
  const pasted = typedEmoji(query);
  const searching = query.trim().length > 0 && !pasted;

  const rows = useMemo((): Row[] => {
    const named = (emoji: string): Cell => {
      const known = byEmoji.get(emoji);
      return { emoji, name: known ? emojiName(known, languages) : emoji };
    };
    if (pasted) return cellRows('pasted', [named(pasted)], columns);
    if (searching) {
      if (!catalogue) return [{ kind: 'note', key: 'loading', text: failed ? t('The emoji list couldn’t load. Paste one.') : t('Loading…') }];
      const found = searchEmoji(catalogue, query, languages).map(emoji => ({ emoji: emoji.emoji, name: emojiName(emoji, languages) }));
      return found.length > 0 ? cellRows('found', found, columns) : [{ kind: 'note', key: 'none', text: t('No emoji for “{query}”.', { query: query.trim() }) }];
    }
    const out: Row[] = [{ kind: 'head', key: 'everyday', title: t('Frequently used') }, ...cellRows('everyday', EVERYDAY_EMOJI.map(named), columns)];
    catalogue?.groups.forEach((group, index) => {
      out.push({ kind: 'head', key: group.key, title: languages[0] === 'en' ? group.en : group.fr });
      out.push(...cellRows(group.key, catalogue.emojis.filter(emoji => emoji.group === index).map(emoji => ({ emoji: emoji.emoji, name: emojiName(emoji, languages) })), columns));
    });
    return out;
  }, [byEmoji, catalogue, columns, failed, languages, pasted, query, searching]);

  const offsets = useMemo(() => {
    const out: number[] = [];
    let at = 0;
    for (const row of rows) {
      out.push(at);
      at += rowHeight(row);
    }
    return out;
  }, [rows]);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      if (item.kind === 'head') {
        return (
          <AppText variant="section" style={styles.head} accessibilityRole="header">
            {item.title}
          </AppText>
        );
      }
      // Nothing found names what is typed: it settles in once, not at every letter.
      if (item.kind === 'note') return <EmptyLine text={item.text} replayKey={item.key === 'none' ? 'none' : undefined} style={styles.note} />;
      return (
        <View style={styles.row}>
          {item.cells.map((cell, column) => (
            <EmojiCell key={cell.emoji} emoji={cell.emoji} name={cell.name} turn={pebbleTurn(column + 2 * item.row)} current={cell.emoji === value} onPick={pick} />
          ))}
          {/* The last row keeps the grid's columns. */}
          {Array.from({ length: columns - item.cells.length }, (_, index) => (
            <View key={`gap-${index}`} style={styles.slot} />
          ))}
        </View>
      );
    },
    [columns, pick, styles, value],
  );

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title ?? t('Icon')} tall>
      <View style={[styles.body, { height: height * 0.88 }]}>
        <View style={styles.top}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search: sun, soleil…')}
            accessibilityLabel={t('Search for an emoji by name, or paste one')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => {
              const first = pasted ?? (catalogue && searching ? searchEmoji(catalogue, query, languages, 1)[0]?.emoji : undefined);
              if (first) pick(first);
            }}
          />
          {allowNone && value !== null ? <Button kind="text" label={t('Remove icon')} onPress={() => pick(null)} style={styles.none} /> : null}
        </View>
        <SheetFlatList top={false}
          data={rows}
          keyExtractor={row => row.key}
          renderItem={renderRow}
          getItemLayout={(_data, index) => ({ length: rows[index] ? rowHeight(rows[index]) : CELL, offset: offsets[index] ?? 0, index })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // As tall as the sheet allows; it gives height back to the keyboard.
    body: { flexShrink: 1 },
    // The field on the sheet's column, with its title and the groups' names.
    top: { gap: 4, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    none: { alignSelf: 'flex-start' },
    list: { flex: 1 },
    // The groups' names and the grid on the sheet's column too; the list still scrolls the panel's width.
    listContent: { paddingHorizontal: SHEET_INSET, paddingBottom: 16 },
    head: { height: HEAD, paddingTop: 14 },
    note: { minHeight: 56, paddingTop: 16 },
    row: { height: CELL, flexDirection: 'row' },
    // Each cell is square, so its pebble stays a pebble, never an oval.
    slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 28, lineHeight: 34, textAlign: 'center', color: theme.color.ink },
  });

export const EmojiSheet = memo(EmojiSheetComponent);
