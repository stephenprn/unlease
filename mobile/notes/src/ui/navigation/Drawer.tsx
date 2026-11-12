/**
 * Carnet's drawer, in the suite's frame (`NavDrawer`): every place in the app (the board, reminders,
 * collections and labels each by name as on the web's navigation (`navOrder`), the archive), the bin, the settings and the Administration at the foot, and
 * the suite's other apps under them (`NavDrawer`).
 */
import React, { memo, useMemo } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { t } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { collectionsByName, labelsByName } from '@unlease/notes/services/navOrder';
import type { BoardView } from '@app/hooks/useBoard';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Emblem, LabelTag } from '../components';
import { DrawerDivider, DrawerHeading, DrawerItem, NavDrawer } from '@shared/ui/components/NavDrawer';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** A collection's open links, at the row's end as on the web's navigation; nothing at zero. */
const LineCount = memo(function LineCount({ id }: { id: string }) {
  const theme = useTheme();
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length);
  return count > 0 ? (
    <AppText variant="labelSmall" color={theme.color.inkMuted}>
      {count}
    </AppText>
  ) : null;
});

/** A place the drawer can show as chosen. */
export type DrawerPlace = BoardView | 'lines' | 'settings' | 'admin' | null;

export interface DrawerProps {
  readonly open: boolean;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  readonly onView: (view: BoardView) => void;
  readonly onLine: (id: string) => void;
  readonly onLines: () => void;
  /** « Nouvelle collection », after the collections. */
  readonly onNewLine: () => void;
  readonly onLabels: () => void;
  readonly onSettings: () => void;
  readonly onAdmin: () => void;
}

function DrawerComponent({ open, current, onClose, onView, onLine, onLines, onNewLine, onLabels, onSettings, onAdmin }: DrawerProps) {
  const theme = useTheme();
  const allLines = useLines();
  // As on the board: "Non classé" shows only while a link waits in it.
  const inboxHolds = useLibraryStore(s => (s.linksByNote[INBOX_ID] ?? []).some(lid => !!s.links[lid] && !s.links[lid]!.done));
  // By name in the interface's language (the app is drawn afresh in another).
  const lines = useMemo(() => collectionsByName(inboxHolds ? allLines : allLines.filter(line => line.id !== INBOX_ID)), [allLines, inboxHolds]);
  const labelOrder = useLibraryStore(s => s.labelOrder);
  const labelMap = useLibraryStore(s => s.labels);
  const labels = useMemo(() => labelsByName(labelOrder, labelMap), [labelOrder, labelMap]);

  return (
    <NavDrawer open={open} app="notes" onClose={onClose}>
      <DrawerItem label={t('Notes')} icon="note" selected={current === 'notes'} onPress={() => onView('notes')} />
      <DrawerItem label={t('Rappels')} icon="bell" selected={current === 'reminders'} onPress={() => onView('reminders')} />
      <DrawerDivider />
      <DrawerHeading title={t('Collections')} action={{ label: t('Tout voir'), accessibilityLabel: t('Toutes les collections'), onPress: onLines }} />
      {lines.map(line => (
        <DrawerItem
          key={`line-${line.id}`}
          label={shownTitle(line)}
          onPress={() => onLine(line.id)}
          leading={<Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={26} />}
          trailing={<LineCount id={line.id} />}
        />
      ))}
      {/* Always, after them, as the web's navigation (and Pages' « Nouvelle page »). */}
      <DrawerItem label={t('Nouvelle collection')} icon="plus" onPress={onNewLine} />
      <DrawerDivider />
      <DrawerHeading title={t('Labels')} action={{ label: t('Modifier'), accessibilityLabel: t('Modifier les labels'), onPress: onLabels }} />
      {labels.map(label => {
        const view: BoardView = `label:${label.id}`;
        return <DrawerItem key={`label-${label.id}`} label={label.name} selected={current === view} onPress={() => onView(view)} leading={<LabelTag color={label.color} size={20} />} wash={theme.line[label.color].tint} />;
      })}
      {labels.length === 0 ? <DrawerItem label={t('Créer un label')} icon="tag" onPress={onLabels} /> : null}
      <DrawerDivider />
      <DrawerItem label={t('Archives')} icon="archive" selected={current === 'archive'} onPress={() => onView('archive')} />
      <DrawerDivider />
      <DrawerItem label={t('Corbeille')} icon="trash" selected={current === 'trash'} onPress={() => onView('trash')} />
      <DrawerItem label={t('Réglages')} icon="settings" selected={current === 'settings'} onPress={onSettings} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={onAdmin} />
    </NavDrawer>
  );
}

export const Drawer = memo(DrawerComponent);
