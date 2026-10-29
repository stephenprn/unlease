/**
 * The pages in the bin, at the head of the Corbeille (one bin for notes and pages, as on the web):
 * each with when it went there, « Restaurer » and « Supprimer définitivement ». Nothing is drawn
 * while no page is in it; the Corbeille's own head empties notes and pages together. The section
 * scrolls with the wall, so its confirmation (`DeletePageDialog`) is mounted at the screen's root.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { formatRelative } from '@unlease/core/services/format';
import { useMinute } from '@app/hooks/useMinute';
import { useTrashedPages } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { deletePageForever, restorePage } from '@app/store/pages';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Dialog, Grain, Icon, IconButton, Organic } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

const BinRow = memo(function BinRow({ id, now, onDelete }: { id: string; now: number; onDelete: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const page = useLibraryStore(s => s.blocks[id]);
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <Organic outline="panel" style={styles.row}>
      <Grain />
      <View style={styles.icon}>{page.icon ? <AppText style={styles.emoji}>{page.icon}</AppText> : <Icon name="page" size={22} color={theme.color.ink} />}</View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>{t('Mise à la corbeille {when}', { when: formatRelative(page.trashedAt ?? now, now) })}</AppText>
      </View>
      <Button
        kind="tonal"
        label={t('Restaurer')}
        onPress={() => {
          const undo = restorePage(id);
          showSnack(t('Page restaurée'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        }}
      />
      <IconButton icon="trash" label={t('Supprimer définitivement')} shape={2} onPress={() => onDelete(id)} />
    </Organic>
  );
});

/** `notesFollow`: notes in the bin come after, under their own head. `onDelete`: the screen confirms it. */
function PagesBinSectionComponent({ notesFollow, onDelete }: { notesFollow: boolean; onDelete: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const binned = useTrashedPages();
  const now = useMinute();
  if (binned.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="section" style={styles.head} accessibilityRole="header">{t('Pages · {count}', { count: binned.length })}</AppText>
      <View style={styles.list}>
        {binned.map(id => (
          <BinRow key={id} id={id} now={now} onDelete={onDelete} />
        ))}
      </View>
      {notesFollow ? (
        <AppText variant="section" style={styles.head} accessibilityRole="header">
          {t('Notes')}
        </AppText>
      ) : null}
    </View>
  );
}

/** A binned page erased for good, asked over the whole screen: mount it at the screen's root, always, so it plays its exit. */
export function DeletePageDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Dialog
      visible={id !== null}
      title={t('Supprimer définitivement ?')}
      message={t('Cette page disparaîtra de tous vos appareils, avec tout ce qu’elle contient.')}
      confirmLabel={t('Supprimer')}
      danger
      onCancel={onClose}
      onConfirm={() => {
        if (id) deletePageForever([id]);
        onClose();
        showSnack(t('Page supprimée définitivement'), undefined, { tone: 'success' });
      }}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { paddingTop: 4 },
    head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    list: { gap: 8, paddingHorizontal: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingLeft: 14, paddingRight: 4, paddingVertical: 8, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, overflow: 'hidden' },
    icon: { width: 28, alignItems: 'center' },
    emoji: { fontSize: 22, lineHeight: 28 },
    text: { flex: 1, gap: 2 },
  });


export const PagesBinSection = memo(PagesBinSectionComponent);
