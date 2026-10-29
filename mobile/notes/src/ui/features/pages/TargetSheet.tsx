/**
 * Picks a note, a collection, a link or a page to mention, bookmark or embed: a search field, then
 * what matches by kind (what changed last while nothing is typed), each row with its own mark. An
 * embed shows a note, a collection or a link whole; a page is better opened, so it is not offered.
 * A mention may be a date: what is typed read as one (« demain 14h ») comes first, today, tomorrow
 * and now come last while nothing is. « [[ » cites a page: pages alone.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/notes/models/blocks';
import { asLineColor } from '@unlease/design/colors';
import { dateShown, dateSuggestions, dateWords, daysFrom } from '@unlease/core/services/dates';
import type { DateRun } from '@unlease/core/services/richText';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmblemStone, Icon, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { listPressDelay } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { KIND_ICONS } from '../links/kindIcon';
import { usePageContext } from './PageContext';
import { searchTargets, type TargetHit, type TargetSection } from './TargetSearch';

export interface TargetSheetProps {
  readonly visible: boolean;
  /** An embed never offers a page. */
  readonly purpose: 'mention' | 'bookmark' | 'embed';
  /** A page cited (« [[ »): pages alone, no date. */
  readonly pagesOnly?: boolean;
  readonly onPick: (target: BlockTarget) => void;
  /** Given, a mention offers dates too. */
  readonly onPickDate?: (date: DateRun) => void;
  readonly onDismiss: () => void;
}

const TITLES: Record<TargetSheetProps['purpose'], string> = { mention: tx('Mentionner'), bookmark: tx('Ajouter un signet'), embed: tx('Intégrer') };
const PLACEHOLDERS: Record<TargetSheetProps['purpose'], string> = {
  mention: tx('Une page, une note, une collection ou un lien'),
  bookmark: tx('Une page, une note, une collection ou un lien'),
  embed: tx('Une note, une collection ou un lien'),
};
const EMBED_SECTIONS: readonly TargetSection[] = [tx('Notes'), tx('Collections'), tx('Liens')];
const PAGE_SECTIONS: readonly TargetSection[] = [tx('Pages')];

/** A row's mark: a page's emoji, a collection's emblem on its stone, a link's kind, a note's glyph. */
const HitMark = memo(function HitMarkView({ target }: { target: BlockTarget }) {
  const theme = useTheme();
  const look = useLibraryStore(
    useShallow(s => {
      if (target.type === 'page') return { emoji: s.blocks[target.id]?.icon ?? null, line: null, glyph: 'page' as GlyphName };
      if (target.type === 'link') return { emoji: null, line: null, glyph: s.links[target.id] ? KIND_ICONS[s.links[target.id]!.kind] : ('link' as GlyphName) };
      const note = s.notes[target.id];
      if (note?.kind === 'links') return { emoji: null, line: { emblem: note.emblem, color: note.color }, glyph: 'collections' as GlyphName };
      return { emoji: null, line: null, glyph: (note?.kind === 'checklist' ? 'checklist' : 'note') as GlyphName };
    }),
  );
  if (look.emoji) return <AppText style={markStyles.emoji}>{look.emoji}</AppText>;
  if (look.line) return <EmblemStone id={target.id} emblem={collectionEmblem(target.id, look.line.emblem)} color={asLineColor(look.line.color)} size={20} width={36} height={32} />;
  return <Icon name={look.glyph} size={24} color={theme.color.ink} />;
});

const markStyles = StyleSheet.create({ emoji: { fontSize: 22, lineHeight: 28 } });

function TargetSheetComponent({ visible, purpose, pagesOnly = false, onPick, onPickDate, onDismiss }: TargetSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page } = usePageContext();
  const [query, setQuery] = useState('');
  // Each opening starts afresh.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const now = useMemo(() => Date.now(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const dates = useMemo(() => (visible && purpose === 'mention' && !pagesOnly && onPickDate ? dateSuggestions(query, now) : []), [visible, purpose, pagesOnly, onPickDate, query, now]);
  // What is typed reads as a date: the dates first; nothing typed, they close the list.
  const datesFirst = query.trim() !== '';
  const hits = useMemo<TargetHit[]>(() => {
    if (!visible) return [];
    const options = purpose === 'embed' ? { sections: EMBED_SECTIONS } : pagesOnly ? { sections: PAGE_SECTIONS, perSection: 8 } : {};
    const library = useLibraryStore.getState();
    // « Voyage]] » typed whole searches « Voyage »; a page's emoji is its row's mark, not part of its name.
    return searchTargets(library, pagesOnly ? query.replace(/\]+$/, '') : query, options)
      .filter(hit => !(hit.target.type === 'page' && hit.target.id === page))
      .map(hit => (hit.target.type === 'page' ? { ...hit, title: library.blocks[hit.target.id]?.text.trim() || t(UNTITLED_PAGE) } : hit));
  }, [visible, purpose, pagesOnly, query, page]);

  const dateRows =
    dates.length > 0 ? (
      <>
        <AppText variant="section" style={styles.section} accessibilityRole="header">
          {t('Dates')}
        </AppText>
        {dates.map((date, index) => {
          const shown = dateShown(date, now);
          // « Demain » says which day it is; « mer. 12 nov. » already does.
          const words = Math.abs(daysFrom(date.date, now)) <= 1 ? dateWords(date) : '';
          return (
            <Tappable key={index} unstable_pressDelay={listPressDelay} onPress={() => onPickDate?.(date)} accessibilityLabel={[shown, words].filter(Boolean).join(', ')} style={styles.row}>
              <View style={styles.mark}>
                <Icon name="calendar" size={24} color={theme.color.ink} />
              </View>
              <View style={styles.text}>
                <AppText variant="body" numberOfLines={1}>
                  {shown}
                </AppText>
                {words ? (
                  <AppText variant="meta" numberOfLines={1}>
                    {words}
                  </AppText>
                ) : null}
              </View>
            </Tappable>
          );
        })}
      </>
    ) : null;
  const pickFirst = (): void => {
    const date = dates[0];
    if (date && (datesFirst || hits.length === 0)) onPickDate?.(date);
    else if (hits[0]) onPick(hits[0].target);
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={pagesOnly ? t('Citer une page') : t(TITLES[purpose])} tall>
      <View style={styles.field}>
        <TextField
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          placeholder={pagesOnly ? t('Une page') : t(PLACEHOLDERS[purpose])}
          accessibilityLabel={t('Rechercher')}
          onSubmitEditing={pickFirst}
        />
      </View>
      <SheetScroll contentContainerStyle={styles.list}>
        {datesFirst ? dateRows : null}
        {hits.length === 0 && dates.length === 0 ? (
          <AppText variant="meta" style={styles.empty}>
            {t('Rien ne correspond.')}
          </AppText>
        ) : (
          hits.map((hit, index) => (
            <React.Fragment key={`${hit.target.type}:${hit.target.id}`}>
              {index === 0 || hits[index - 1]!.section !== hit.section ? (
                <AppText variant="section" style={styles.section} accessibilityRole="header">
                  {t(hit.section)}
                </AppText>
              ) : null}
              <Tappable unstable_pressDelay={listPressDelay} onPress={() => onPick(hit.target)} accessibilityLabel={[hit.title, hit.detail].filter(Boolean).join(', ')} style={styles.row}>
                <View style={styles.mark}>
                  <HitMark target={hit.target} />
                </View>
                <View style={styles.text}>
                  <AppText variant="body" numberOfLines={1}>
                    {hit.title}
                  </AppText>
                  {hit.detail ? (
                    <AppText variant="meta" numberOfLines={1}>
                      {hit.detail}
                    </AppText>
                  ) : null}
                </View>
              </Tappable>
            </React.Fragment>
          ))
        )}
        {datesFirst ? null : dateRows}
      </SheetScroll>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    field: { paddingHorizontal: 8, paddingBottom: 8 },
    list: { paddingBottom: 16 },
    empty: { color: theme.color.inkMuted, paddingHorizontal: 16, paddingVertical: 20 },
    section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    // Inset by 6 so its press stays inside the sheet.
    row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    mark: { width: 36, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, gap: 2 },
  });

export const TargetSheet = memo(TargetSheetComponent);
