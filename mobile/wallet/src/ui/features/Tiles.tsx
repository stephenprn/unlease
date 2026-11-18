/**
 * A card or a paper as a tile, the shape of the thing itself (ID-1, 85.6 × 54), two to a row: a card
 * in its pigment's wash with its name and the end of its number, a gift card's balance, a star when it
 * is a favourite; a paper on paper with its kind's glyph on a stone of its colour (`PAPER_INKS`),
 * whose it is, and how long it is valid (Safran once its first reminder is near, danger once
 * expired). A press opens it.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatPrice } from '@unlease/core/services/format';
import type { WalletItem } from '@unlease/wallet/models/item';
import { expiryOf } from '@unlease/wallet/services/expiry';
import { expiryWords, itemInk, kindName, KIND_GLYPHS } from '@unlease/wallet/services/words';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export const TILE_RATIO = 85.6 / 54;

const numberEnd = (number: string): string => {
  const clean = number.replace(/\s+/g, '');
  return clean.length > 4 ? `•• ${clean.slice(-4)}` : clean;
};

function ExpiryLine({ item, today }: { item: WalletItem; today: string }) {
  const theme = useTheme();
  const state = expiryOf(item, today);
  const words = expiryWords(state);
  if (!words || state.tone === 'valid') return null;
  return (
    <AppText variant="metaStrong" color={state.tone === 'expired' ? theme.color.danger : theme.color.waiting} numberOfLines={1}>
      {words}
    </AppText>
  );
}

interface TileProps {
  readonly item: WalletItem;
  readonly today: string;
  readonly person?: string | null;
  readonly onOpen: (id: string) => void;
}

function TileComponent({ item, today, person, onOpen }: TileProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const d = item.details;
  const card = item.tier === 'cards';
  const ink = theme.line[itemInk(item)];
  const background = card ? ink.tint : theme.color.paper;
  const foot = card
    ? item.kind === 'emergency'
      ? t('In case of emergency')
      : d.balance
        ? formatPrice(d.balance.amount, d.balance.currency)
        : numberEnd(d.number || d.barcode?.value || '')
    : (person ?? d.holder);
  const title = item.title || kindName(item.kind);
  return (
    <Tappable outline="card" style={[styles.tile, { backgroundColor: background }]} onPress={() => onOpen(item.id)} accessibilityRole="button" accessibilityLabel={[title, kindName(item.kind), foot].filter(Boolean).join(', ')}>
      <View style={styles.head}>
        <AppText variant="cardTitle" numberOfLines={2} style={styles.title}>
          {title}
        </AppText>
        {card ? (
          item.favourite ? (
            <Icon name="star" solid size={18} color={theme.color.ink} />
          ) : (
            <Icon name={KIND_GLYPHS[item.kind]} size={20} color={theme.color.inkMuted} />
          )
        ) : (
          <Organic pebble={pebbleTurnOf(item.id)} style={[styles.stone, { backgroundColor: ink.tint }]}>
            <Icon name={KIND_GLYPHS[item.kind]} size={20} color={ink.text} />
          </Organic>
        )}
      </View>
      <View style={styles.foot}>
        <AppText variant="meta" numberOfLines={1} style={styles.end}>
          {foot}
        </AppText>
        <ExpiryLine item={item} today={today} />
      </View>
    </Tappable>
  );
}

export const Tile = memo(TileComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    tile: { flex: 1, aspectRatio: TILE_RATIO, padding: 14, paddingBottom: 12, justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    title: { flex: 1 },
    stone: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
    foot: { gap: 2 },
    end: { fontVariant: ['tabular-nums'] },
  });
}
