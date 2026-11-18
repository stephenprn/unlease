/**
 * Clock's drawer, in the suite's frame (`NavDrawer`): Réglages and the Administration (its four places
 * are the bar at the home's foot, never twice); the suite's other apps under them (`NavDrawer`).
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';

import { DrawerItem, NavDrawer } from '@shared/ui/components/NavDrawer';

/** A place the drawer can show as chosen. */
export type DrawerPlace = 'settings' | 'admin' | null;

export interface DrawerProps {
  readonly open: boolean;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  readonly onPlace: (place: Exclude<DrawerPlace, null>) => void;
}

function DrawerComponent({ open, current, onClose, onPlace }: DrawerProps) {
  return (
    <NavDrawer open={open} app="clock" onClose={onClose}>
      <DrawerItem label={t('Settings')} icon="settings" selected={current === 'settings'} onPress={() => onPlace('settings')} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={() => onPlace('admin')} />
    </NavDrawer>
  );
}

export const Drawer = memo(DrawerComponent);
