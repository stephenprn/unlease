/** Deleting collections that hold links (one from its page, or a selection on the board): the person says where the links go. */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { selectSorting, useCaptureStore } from '@app/store/captureStore';

import { AppText, ListRow, Sheet, SHEET_INSET } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** Where a deleted collection's links go: sorted by Claude, to one collection ("Non classé" included), or to the bin. */
export type LinksFate = { readonly kind: 'claude' } | { readonly kind: 'move'; readonly to: string } | { readonly kind: 'bin' };

/** `ids`: the notes being deleted; the collections among them hold the links. */
export function DeleteLineSheet({ ids, visible, onDismiss, onChoose, onPickLine }: { ids: readonly string[]; visible: boolean; onDismiss: () => void; onChoose: (fate: LinksFate) => void; onPickLine: () => void }) {
  const theme = useTheme();
  const lines = useLines();
  const deleting = lines.filter(line => ids.includes(line.id) && line.id !== INBOX_ID);
  const count = useLibraryStore(s => ids.reduce((sum, id) => sum + (id !== INBOX_ID && s.notes[id]?.kind === 'links' ? (s.linksByNote[id]?.length ?? 0) : 0), 0));
  // « Les ranger avec Claude » once the server said it has a key.
  const reading = useServerFeature('claude');
  const sorting = useCaptureStore(selectSorting);
  const others = lines.some(line => !ids.includes(line.id) && line.id !== INBOX_ID);
  const choose = (fate: LinksFate) => {
    onDismiss();
    onChoose(fate);
  };
  const words = {
    title: deleting.length === 1 ? t('Delete {collection}', { collection: shownTitle(deleting[0]!) }) : t('Delete {count} collections', { count: deleting.length }),
    lead: deleting.length === 1 ? t('It holds {links}. Where should they go?', { links: plural(count, 'link') }) : t('They hold {links}. Where should they go?', { links: plural(count, 'link') }),
  };
  // Once the choice is made the collections are gone: while it leaves, the sheet keeps the words it opened with.
  const [shown, setShown] = useState(words);
  if (visible && (shown.title !== words.title || shown.lead !== words.lead)) setShown(words);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={shown.title}>
      <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
        {shown.lead}
      </AppText>
      {reading && others && !sorting ? <ListRow icon="sparkle" title={t('Sort them with Claude')} supporting={t('Into your other collections, otherwise into Unsorted')} onPress={() => choose({ kind: 'claude' })} /> : null}
      <ListRow icon="inbox" title={t('Put them in Unsorted')} onPress={() => choose({ kind: 'move', to: INBOX_ID })} />
      {others ? (
        // « … » says a collection is picked next: no line under it to say so again.
        <ListRow
          icon="transfer"
          title={t('Move them to…')}
          onPress={() => {
            onDismiss();
            onPickLine();
          }}
        />
      ) : null}
      <ListRow icon="trash" danger title={t('Delete them too')} supporting={deleting.length === 1 ? t('With the collection, into the bin') : t('With the collections, into the bin')} onPress={() => choose({ kind: 'bin' })} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
});
