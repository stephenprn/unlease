/**
 * Wallet's three places at the screen's foot (the suite's `TabBar`, as Clock's): « Cartes »,
 * « Identité », « Documents ». A locked place wears a small dot in the second ink: its papers wait
 * under the frost.
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { TabBar, TAB_BAR_HEIGHT } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

import type { WalletPlace } from './types';

export { TAB_BAR_HEIGHT };

export const WALLET_PLACES: readonly WalletPlace[] = ['cards', 'papers', 'documents'];

const GLYPHS: Readonly<Record<WalletPlace, GlyphName>> = { cards: 'card', papers: 'idCard', documents: 'page' };

export const tabName = (tab: WalletPlace): string => {
  switch (tab) {
    case 'cards':
      return t('Cards');
    case 'papers':
      return t('Identity');
    case 'documents':
      return t('Documents');
  }
};

/** A place's state the bar shows: its papers locked. */
export type TabMark = 'locked' | null;

interface Props {
  readonly tab: WalletPlace;
  readonly marks: Readonly<Partial<Record<WalletPlace, TabMark>>>;
  readonly onTab: (tab: WalletPlace) => void;
}

function WalletTabBarComponent({ tab, marks, onTab }: Props) {
  const theme = useTheme();
  const places = WALLET_PLACES.map(each => ({
    key: each,
    icon: GLYPHS[each],
    name: tabName(each),
    dot: marks[each] === 'locked' ? theme.color.inkMuted : null,
    state: t('Locked'),
  }));
  return <TabBar places={places} chosen={tab} onChoose={onTab} />;
}

export const WalletTabBar = memo(WalletTabBarComponent);
