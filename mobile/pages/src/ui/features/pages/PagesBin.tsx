/**
 * A page in the bin (Pages' Corbeille, `TrashScreen`), as every app's (`BinRow`): its emoji or the page
 * glyph, when it went there, opening the page, « Restaurer » and « Supprimer définitivement ». Its
 * confirmation (`DeletePageDialog`) is mounted at the screen's root.
 */
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { formatRelative } from '@unlease/core/services/format';
import { useLibraryStore } from '@app/store/libraryStore';
import { deletePageForever, restorePage } from '@app/store/pages';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, BinRow, Dialog, Icon } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export const TrashedPageRow = memo(function TrashedPageRowView({ id, now, onOpen, onDelete }: { id: string; now: number; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const theme = useTheme();
  const page = useLibraryStore(s => s.blocks[id]);
  if (!page) return null;
  return (
    <BinRow
      title={page.text.trim() || t(UNTITLED_PAGE)}
      meta={tc('f', 'Moved to the bin {when}', { when: formatRelative(page.trashedAt ?? now, now) })}
      leading={page.icon ? <AppText style={styles.emoji}>{page.icon}</AppText> : <Icon name="page" size={24} color={theme.color.ink} />}
      onOpen={() => onOpen(id)}
      onRestore={() => {
        const undo = restorePage(id);
        showSnack(t('Page restored'), { label: t('Undo'), run: undo }, { tone: 'success' });
      }}
      onDelete={() => onDelete(id)}
    />
  );
});

/**
 * A binned page erased for good, asked over the whole screen: mount it at the screen's root, always,
 * so it plays its exit. `onDeleted`: once it is gone (the page's own screen leaves it).
 */
export function DeletePageDialog({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted?: () => void }) {
  return (
    <Dialog
      visible={id !== null}
      title={t('Delete forever?')}
      message={t('This page will disappear from all your devices, with everything in it.')}
      confirmLabel={t('Delete')}
      danger
      onCancel={onClose}
      onConfirm={() => {
        if (id) deletePageForever([id]);
        onClose();
        onDeleted?.();
        showSnack(t('Page deleted forever'), undefined, { tone: 'success' });
      }}
    />
  );
}

const styles = StyleSheet.create({
  emoji: { fontSize: 24, lineHeight: 30 },
});
