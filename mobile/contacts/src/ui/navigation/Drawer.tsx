/**
 * Contacts' drawer, in the suite's frame (`NavDrawer`), as Google's: Contacts, Favoris, Anniversaires;
 * the labels, each with its colour and how many wear it, the heading's « Modifier » leading to them
 * (« Créer un libellé » while there are none); the duplicates
 * to merge while there are some; the bin, the settings (where the imports are) and the Administration
 * at the foot; the suite's other apps under them (`NavDrawer`).
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { useDuplicates, useLabelCounts } from '@app/hooks/useContacts';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, LabelTag } from '@shared/ui/components';
import { DrawerDivider, DrawerHeading, DrawerItem, NavDrawer } from '@shared/ui/components/NavDrawer';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** A place the drawer can show as chosen. */
export type DrawerPlace = 'contacts' | 'favorites' | 'birthdays' | 'labels' | 'duplicates' | 'trash' | 'settings' | 'admin' | `label:${string}` | null;

export interface DrawerProps {
  readonly open: boolean;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  readonly onPlace: (place: Exclude<DrawerPlace, null>) => void;
}

function Count({ count }: { count: number }) {
  return count > 0 ? <AppText variant="meta">{count}</AppText> : null;
}

function DrawerComponent({ open, current, onClose, onPlace }: DrawerProps) {
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const counts = useLabelCounts();
  const total = useLibraryStore(s => s.liveContacts.length);
  const duplicates = useDuplicates().length;
  return (
    <NavDrawer open={open} app="contacts" onClose={onClose}>
      <DrawerItem label={t('Contacts')} icon="people" selected={current === 'contacts'} onPress={() => onPlace('contacts')} trailing={<Count count={total} />} />
      <DrawerItem label={t('Favoris')} icon="star" selected={current === 'favorites'} onPress={() => onPlace('favorites')} />
      <DrawerItem label={t('Anniversaires')} icon="cake" selected={current === 'birthdays'} onPress={() => onPlace('birthdays')} />
      <DrawerDivider />
      <DrawerHeading title={t('Libellés')} action={order.length > 0 ? { label: t('Modifier'), accessibilityLabel: t('Gérer les libellés'), onPress: () => onPlace('labels') } : undefined} />
      {order.map(id => {
        const label = labels[id];
        if (!label) return null;
        const place = `label:${id}` as const;
        return (
          <DrawerItem
            key={id}
            label={label.name}
            selected={current === place}
            onPress={() => onPlace(place)}
            leading={<LabelTag color={label.color} size={20} />}
            wash={theme.line[label.color].tint}
            trailing={<Count count={counts[id] ?? 0} />}
          />
        );
      })}
      {/* The heading's « Modifier » leads to them; with none yet, a row makes the first (Carnet's and Agenda's drawers). */}
      {order.length === 0 ? <DrawerItem label={t('Créer un libellé')} icon="tag" selected={current === 'labels'} onPress={() => onPlace('labels')} /> : null}
      <DrawerDivider />
      {duplicates > 0 ? <DrawerItem label={t('Doublons')} icon="copy" selected={current === 'duplicates'} onPress={() => onPlace('duplicates')} trailing={<Count count={duplicates} />} /> : null}
      <DrawerItem label={t('Corbeille')} icon="trash" selected={current === 'trash'} onPress={() => onPlace('trash')} />
      <DrawerItem label={t('Réglages')} icon="settings" selected={current === 'settings'} onPress={() => onPlace('settings')} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={() => onPlace('admin')} />
    </NavDrawer>
  );
}

export const Drawer = memo(DrawerComponent);
