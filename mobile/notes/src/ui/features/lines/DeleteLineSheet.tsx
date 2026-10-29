/** Deleting collections that hold links (one from its page, or a selection on the board): the person says where the links go. */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, useSettingsStore } from '@app/store/settingsStore';
import { selectSorting, useUiStore } from '@app/store/uiStore';

import { AppText, ListRow, Sheet } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

/** Where a deleted collection's links go: sorted by Claude, to one collection ("Non classé" included), or to the bin. */
export type LinksFate = { readonly kind: 'claude' } | { readonly kind: 'move'; readonly to: string } | { readonly kind: 'bin' };

/** `ids`: the notes being deleted; the collections among them hold the links. */
export function DeleteLineSheet({ ids, visible, onDismiss, onChoose, onPickLine }: { ids: readonly string[]; visible: boolean; onDismiss: () => void; onChoose: (fate: LinksFate) => void; onPickLine: () => void }) {
  const theme = useTheme();
  const lines = useLines();
  const deleting = lines.filter(line => ids.includes(line.id) && line.id !== INBOX_ID);
  const count = useLibraryStore(s => ids.reduce((sum, id) => sum + (id !== INBOX_ID && s.notes[id]?.kind === 'links' ? (s.linksByNote[id]?.length ?? 0) : 0), 0));
  const reading = useSettingsStore(selectCanRead);
  const sorting = useUiStore(selectSorting);
  const others = lines.some(line => !ids.includes(line.id) && line.id !== INBOX_ID);
  const choose = (fate: LinksFate) => {
    onDismiss();
    onChoose(fate);
  };
  const words = {
    title: deleting.length === 1 ? t('Supprimer {collection}', { collection: shownTitle(deleting[0]!) }) : t('Supprimer {count} collections', { count: deleting.length }),
    lead: deleting.length === 1 ? t('Elle contient {links}. Où les mettre ?', { links: plural(count, 'lien') }) : t('Elles contiennent {links}. Où les mettre ?', { links: plural(count, 'lien') }),
  };
  // Once the choice is made the collections are gone: while it leaves, the sheet keeps the words it opened with.
  const [shown, setShown] = useState(words);
  if (visible && (shown.title !== words.title || shown.lead !== words.lead)) setShown(words);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={shown.title}>
      <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
        {shown.lead}
      </AppText>
      {reading && others && !sorting ? <ListRow icon="sparkle" title={t('Les ranger avec Claude')} supporting={t('Dans vos autres collections, sinon dans Non classé')} onPress={() => choose({ kind: 'claude' })} /> : null}
      <ListRow icon="inbox" title={t('Les mettre dans Non classé')} onPress={() => choose({ kind: 'move', to: INBOX_ID })} />
      {others ? (
        <ListRow
          icon="transfer"
          title={t('Les déplacer vers…')}
          supporting={t('Une autre collection')}
          onPress={() => {
            onDismiss();
            onPickLine();
          }}
        />
      ) : null}
      <ListRow icon="trash" danger title={t('Les supprimer aussi')} supporting={deleting.length === 1 ? t('Avec la collection, dans la corbeille') : t('Avec les collections, dans la corbeille')} onPress={() => choose({ kind: 'bin' })} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { paddingHorizontal: 8, paddingBottom: 8 },
});
