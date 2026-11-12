/**
 * The bar that rides on the keyboard while a block of a page holds the caret, as the web's touch
 * bar: with the caret, a block under it, its kind, out of or into the item above, up, down, and
 * its actions, led by « Modifier la date » when the caret sits by a date; with words selected,
 * their marks (bold, italic, underline, strikethrough, code, keys), a colour and a link; while
 * « :word » is typed, the emoji it names. While « @word » or « [[word » is typed, what it may mention
 * rides over it (`MentionSuggestions`). A press here keeps the caret, and so the keyboard, in the text.
 * Held, up or down opens « Réorganiser », where the block is dragged to its place (`ReorderBlocks`).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t, tx } from '@unlease/core/i18n';
import { RICH_KINDS } from '@unlease/pages/models/blocks';
import { emojiName, searchEmoji } from '@unlease/design/emojiSearch';
import { rangeHas, rangeValue, type FlagMark } from '@unlease/core/services/richText';
import { useLibraryStore } from '@app/store/libraryStore';
import { indentBlocks, nudgeBlocks, outdentBlocks } from '@app/store/pages';
import { haptic } from '@shared/platform/haptics';

import { AppText, footEdge, GroundSlice, ICON_PEBBLE, IconButton, MentionSuggestions, Tappable } from '@shared/ui/components';
import { useKeyboardVisible } from '@shared/ui/components/useKeyboardVisible';
import { accelerate, decelerate, duration } from '@shared/ui/theme/motion';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { toggleFlag } from './blockKeys';
import { openDateSheet } from './DateSheet';
import { flushAll, focusBlock, holdCaret, richHandle, setEmojiQuery, useEditorStore, visibleOutline } from './editorStore';
import { emojiCatalogue, emojiLanguages, loadedEmojiCatalogue } from './EmojiCatalogue';
import { dateBesideCaret, dateInRange, isEmojiWord, withEmoji } from './inline';
import { useMentionRows } from './mentionRows';
import { usePageContext } from './PageContext';
import { openReorder } from './ReorderBlocks';
import { openPageSheet } from './sheetStore';

export const BLOCK_BAR_HEIGHT = 52;

const BAR_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.short);
const BAR_OUT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: accelerate } }).duration(duration.short);

const FLAGS: readonly { readonly flag: FlagMark; readonly icon: GlyphName; readonly label: string }[] = [
  { flag: 'b', icon: 'bold', label: tx('Gras') },
  { flag: 'i', icon: 'italic', label: tx('Italique') },
  { flag: 'u', icon: 'underline', label: tx('Souligné') },
  { flag: 's', icon: 'strike', label: tx('Barré') },
  { flag: 'c', icon: 'code', label: tx('Code') },
  { flag: 'k', icon: 'keyboard', label: tx('Touches') },
];

/** As many emoji as the bar offers for « :word » (the web's menu offers as many). */
const EMOJI_OFFERED = 8;

function BlockBarComponent() {
  const styles = useThemedStyles(makeStyles);
  const { page, readOnly } = usePageContext();
  const id = useEditorStore(s => s.focused);
  const range = useEditorStore(s => (s.selection && s.selection.start !== s.selection.end ? s.selection : null));
  const caret = useEditorStore(s => (s.selection && s.selection.start === s.selection.end ? s.selection.start : null));
  const query = useEditorStore(s => (s.emojiQuery && s.emojiQuery.block === s.focused ? s.emojiQuery : null));
  const ask = useEditorStore(s => (s.mentionQuery && s.mentionQuery.block === s.focused ? s.mentionQuery : null));
  const mentionRows = useMentionRows(ask, page);
  const block = useLibraryStore(s => (id ? s.blocks[id] : undefined));
  const keyboard = useKeyboardVisible();
  const insets = useSafeAreaInsets();
  const [catalogue, setCatalogue] = useState(loadedEmojiCatalogue);
  // Where the bar stands in the window, so it paints the slice of the ground under it (it moves with the keyboard).
  const barRef = useRef<React.ComponentRef<typeof View>>(null);
  const [barTop, setBarTop] = useState(0);
  const measureBar = useCallback(() => barRef.current?.measureInWindow((_x, y) => setBarTop(current => (Math.abs(current - y) < 0.5 ? current : y))), []);
  useEffect(() => {
    const frame = requestAnimationFrame(measureBar);
    return () => cancelAnimationFrame(frame);
  }, [keyboard, measureBar]);
  const asked = query !== null;
  // Made searchable as soon as a colon is typed, before the word it will search.
  useEffect(() => {
    if (!asked || catalogue) return;
    const timer = setTimeout(() => setCatalogue(emojiCatalogue()), 0);
    return () => clearTimeout(timer);
  }, [asked, catalogue]);
  const languages = emojiLanguages();
  const offered = useMemo(() => (query && isEmojiWord(query.word) && catalogue ? searchEmoji(catalogue, query.word, languages, EMOJI_OFFERED) : []), [query, catalogue, languages]);
  if (readOnly || !id || !block || block.deletedAt !== null) return null;
  const rich = RICH_KINDS.has(block.kind);

  /** Moves the block, then puts the caret back where it was in it (and keeps it there as the block's field is moved: `holdCaret`). */
  /** Held, an arrow opens « Réorganiser » at this block; the caret comes back here if nothing moves. */
  const reorder = (): void => {
    haptic('pick');
    openReorder(page, id, rich ? (richHandle(id)?.selection().start ?? null) : null);
  };

  const move = (act: (caret: number) => boolean): void => {
    const at = richHandle(id)?.selection().start ?? 0;
    flushAll();
    if (!act(at)) return;
    holdCaret(id, at);
    focusBlock(id, at);
  };

  const formatting = rich && range !== null;
  const handle = richHandle(id);
  const runs = rich ? (handle?.runs() ?? []) : [];
  // The date the caret sits by, or the one the selection holds: the field takes no tap on its words.
  const dateNear = rich && !formatting && caret !== null ? dateBesideCaret(runs, caret) : null;
  const dateChosen = formatting ? dateInRange(runs, range.start, range.end) : null;
  const emoji = rich && !formatting && offered.length > 0;

  const pickEmoji = (glyph: string): void => {
    if (!handle || !query) return;
    const placed = withEmoji(handle.runs(), query, glyph);
    setEmojiQuery(id, null);
    if (placed) handle.write(placed.runs, { start: placed.caret });
  };

  // A space after words nothing answers (« @rdv demain ») leaves them as words.
  const asking = rich && !formatting && ask !== null && !(mentionRows.length === 0 && /\s/.test(ask.word));

  return (
    <Animated.View entering={BAR_IN} exiting={BAR_OUT}>
      {asking ? (
        <MentionSuggestions
          rows={mentionRows}
          label={ask.typed === '[[' ? t('Citer une page') : t('Mentionner')}
          empty={ask.word.trim() ? t('Rien ne correspond.') : ask.typed === '[[' ? t('Aucune autre page pour l’instant.') : t('Rien à mentionner pour l’instant.')}
        />
      ) : null}
      <View
        ref={barRef}
        onLayout={measureBar}
        style={[styles.bar, { height: BLOCK_BAR_HEIGHT + (keyboard ? 0 : insets.bottom), paddingBottom: keyboard ? 0 : insets.bottom }]}
        accessibilityRole="toolbar"
        accessibilityLabel={formatting ? t('Mise en forme') : emoji ? t('Emojis') : t('Actions du bloc')}
      >
        {/* The ground itself, as a bar pinned over it paints it, so no seam shows where the page meets it. */}
        <GroundSlice top={barTop} />
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {formatting && handle ? (
            <>
              {dateChosen !== null ? <IconButton icon="calendar" label={t('Modifier la date')} shape={3} onPress={() => openDateSheet(id, dateChosen)} /> : null}
              {FLAGS.map(({ flag, icon, label }, index) => (
                <IconButton key={flag} icon={icon} label={t(label)} shape={index % 3} selected={rangeHas(runs, range.start, range.end, flag)} onPress={() => toggleFlag(handle, flag)} />
              ))}
              <IconButton icon="textColor" label={t('Couleur')} shape={0} selected={rangeValue(runs, range.start, range.end, 'fg') !== null || rangeValue(runs, range.start, range.end, 'bg') !== null} onPress={() => openPageSheet({ kind: 'textColor', block: id, start: range.start, end: range.end })} />
              <IconButton icon="link" label={t('Lien')} shape={1} selected={rangeValue(runs, range.start, range.end, 'a') !== null} onPress={() => openPageSheet({ kind: 'link', block: id, start: range.start, end: range.end })} />
            </>
          ) : emoji ? (
            offered.map((found, index) => (
              <Tappable key={found.emoji} pebble={pebbleTurn(index)} accessibilityLabel={emojiName(found, languages)} onPress={() => pickEmoji(found.emoji)} style={ICON_PEBBLE}>
                <AppText style={styles.emojiGlyph} allowFontScaling={false}>
                  {found.emoji}
                </AppText>
              </Tappable>
            ))
          ) : (
            <>
              {dateNear !== null ? <IconButton icon="calendar" label={t('Modifier la date')} shape={3} onPress={() => openDateSheet(id, dateNear, caret ?? dateNear + 1)} /> : null}
              <IconButton
                icon="plus"
                label={t('Ajouter un bloc')}
                shape={0}
                onPress={() => {
                  flushAll();
                  openPageSheet({ kind: 'insert', block: id });
                }}
              />
              {block.kind !== 'code' ? (
                <IconButton
                  icon="text"
                  label={t('Transformer en…')}
                  shape={1}
                  onPress={() => {
                    flushAll();
                    openPageSheet({ kind: 'turn', block: id });
                  }}
                />
              ) : null}
              <IconButton icon="outdent" label={t('Désimbriquer le bloc')} shape={2} onPress={() => move(at => outdentBlocks(page, [id], [id], { block: id, offset: at }))} />
              <IconButton icon="indent" label={t('Imbriquer le bloc')} shape={0} onPress={() => move(at => indentBlocks(page, [id], [id], { block: id, offset: at }))} />
              <IconButton icon="arrowUp" label={t('Monter le bloc')} shape={1} onPress={() => move(() => nudgeBlocks(page, [id], -1, visibleOutline(page)))} onLongPress={reorder} />
              <IconButton icon="arrowDown" label={t('Descendre le bloc')} shape={2} onPress={() => move(() => nudgeBlocks(page, [id], 1, visibleOutline(page)))} onLongPress={reorder} />
              <IconButton
                icon="more"
                label={t('Plus d’actions sur le bloc')}
                shape={0}
                onPress={() => {
                  flushAll();
                  openPageSheet({ kind: 'block', block: id });
                }}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { height: BLOCK_BAR_HEIGHT, ...footEdge(theme), backgroundColor: theme.color.wall, justifyContent: 'center', overflow: 'hidden' },
    row: { alignItems: 'center', gap: 2, paddingHorizontal: 6, minWidth: '100%', justifyContent: 'center' },
    // An icon button's pebble, an emoji in place of its glyph.
    emojiGlyph: { fontSize: 24, lineHeight: 30, textAlign: 'center', color: theme.color.ink },
  });

export const BlockBar = memo(BlockBarComponent);
