/**
 * Wallet's drawer, in the suite's frame (`NavDrawer`): « Verrouiller maintenant » while the papers are
 * open, Réglages and the Administration (its three places are the bar at the home's foot, never
 * twice); the suite's other apps under them (`NavDrawer`).
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';

import { lockPapers, useVaultStore } from '@app/store/vault';
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
  const papersOpen = useVaultStore(s => s.papers !== null);
  return (
    <NavDrawer open={open} app="wallet" onClose={onClose}>
      {papersOpen ? (
        <DrawerItem
          label={t('Lock now')}
          icon="lock"
          onPress={() => {
            lockPapers();
            onClose();
          }}
        />
      ) : null}
      <DrawerItem label={t('Settings')} icon="settings" selected={current === 'settings'} onPress={() => onPlace('settings')} />
      <DrawerItem label={t('Administration')} icon="server" selected={current === 'admin'} onPress={() => onPlace('admin')} />
    </NavDrawer>
  );
}

export const Drawer = memo(DrawerComponent);
