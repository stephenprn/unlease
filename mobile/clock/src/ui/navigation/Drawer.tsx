/**
 * Clock's drawer, in the suite's frame (`NavDrawer`): the alarms, then Réglages and the
 * Administration at the foot; the suite's other apps under them (`NavDrawer`).
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText } from '@shared/ui/components';
import { DrawerDivider, DrawerItem, NavDrawer } from '@shared/ui/components/NavDrawer';

/** A place the drawer can show as chosen. */
export type DrawerPlace = 'alarms' | 'settings' | 'admin' | null;

export interface DrawerProps {
  readonly open: boolean;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  readonly onPlace: (place: Exclude<DrawerPlace, null>) => void;
}

function DrawerComponent({ open, current, onClose, onPlace }: DrawerProps) {
  const count = useLibraryStore(s => s.alarmOrder.length);
  return (
    <NavDrawer open={open} app="clock" onClose={onClose}>
      <DrawerItem label={t('Alarms')} icon="clock" selected={current === 'alarms'} onPress={() => onPlace('alarms')} trailing={count > 0 ? <AppText variant="meta">{count}</AppText> : null} />
      <DrawerDivider />
      <DrawerItem label={t('Settings')} icon="settings" selected={current === 'settings'} onPress={() => onPlace('settings')} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={() => onPlace('admin')} />
    </NavDrawer>
  );
}

export const Drawer = memo(DrawerComponent);
