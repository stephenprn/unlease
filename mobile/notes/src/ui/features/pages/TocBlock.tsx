/**
 * A page's table of contents: its headings in reading order (`pageHeadings`), each a quiet row of
 * the second ink, further in the smaller it is, that scrolls the page to its heading and lights it
 * a moment. Live as the headings change; without a frame; on a page in the bin too.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { pageHeadings } from '@unlease/notes/services/blocks';
import { dateWords } from '@unlease/core/services/dates';
import { markupToPlain } from '@unlease/core/services/richText';
import { targetTitle } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';

import { AppText, Tappable } from '../../components';
import { listPressDelay } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { usePageContext } from './PageContext';

/** Further in for each step down from the page's biggest heading. */
const STEP = 16;
const FIELD = '\u0001';
const ENTRY = '\u0002';

interface Line {
  readonly id: string;
  readonly depth: number;
  readonly words: string;
}

/** The headings as one string, so the block is drawn again only when one of them changes. */
function headingsKey(s: LibraryState, page: string): string {
  return pageHeadings(s.blocks, s.blocksByParent, page)
    .flatMap(entry => {
      const words = markupToPlain(entry.text, target => targetTitle(s, target) ?? t('(supprimé)'), dateWords).replace(/\s+/g, ' ').trim();
      return words ? [[entry.id, entry.depth, words].join(FIELD)] : [];
    })
    .join(ENTRY);
}

function TocBlockComponent() {
  const theme = useTheme();
  const { page, jumpTo } = usePageContext();
  const key = useLibraryStore(s => headingsKey(s, page));
  const lines = useMemo<Line[]>(
    () =>
      key
        ? key.split(ENTRY).map(entry => {
            const [id = '', depth = '0', words = ''] = entry.split(FIELD);
            return { id, depth: Number(depth), words };
          })
        : [],
    [key],
  );
  if (lines.length === 0) {
    return (
      <AppText variant="meta" style={styles.empty}>
        {t('Ajoutez des titres à la page : ils apparaîtront ici.')}
      </AppText>
    );
  }
  return (
    <View>
      {lines.map(line => (
        <Tappable key={line.id} unstable_pressDelay={listPressDelay} accessibilityRole="link" accessibilityLabel={line.words} onPress={() => jumpTo?.(line.id)} style={[styles.row, { paddingLeft: 8 + STEP * line.depth }]}>
          <AppText variant="body" color={theme.color.inkMuted} numberOfLines={2}>
            {line.words}
          </AppText>
        </Tappable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Its press stays inside the row's own shape, the words in line with the page's.
  row: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingRight: 8, marginHorizontal: -8, ...corners(SHAPES.tab) },
  empty: { paddingVertical: 6 },
});

export const TocBlock = memo(TocBlockComponent);
