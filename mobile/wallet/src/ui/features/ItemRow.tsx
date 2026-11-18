/**
 * An item as a row (the documents, a search's results): its type's glyph on a pebble in its colour, its title, what
 * it is and its date, and at its end how many pages it holds or how soon it expires.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatIsoDay, plural } from '@unlease/core/services/format';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { WalletItem } from '@unlease/wallet/models/item';
import { expiryOf } from '@unlease/wallet/services/expiry';
import { documentTypeGlyph, documentTypeName, expiryWords, itemInk, kindName, KIND_GLYPHS } from '@unlease/wallet/services/words';
import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

function ItemRowComponent({ item, today, onOpen }: { item: WalletItem; today: string; onOpen: (id: string) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const d = item.details;
  const ink = theme.line[itemInk(item)];
  const glyph = item.kind === 'document' && d.docType ? documentTypeGlyph(d.docType) : KIND_GLYPHS[item.kind];
  const what = item.kind === 'document' && d.docType ? documentTypeName(d.docType) : kindName(item.kind);
  const meta = [what, d.issuer, d.docDate ? formatIsoDay(d.docDate) : ''].filter(Boolean).join(' · ');
  const expiry = expiryOf(item, today);
  const warn = expiry.tone === 'soon' || expiry.tone === 'expired';
  const end = warn ? expiryWords(expiry) : d.files.length > 1 ? plural(d.files.length, 'page') : null;
  const title = item.title || kindName(item.kind);
  return (
    <Tappable outline="card" style={styles.row} onPress={() => onOpen(item.id)} accessibilityRole="button" accessibilityLabel={[title, meta, end].filter(Boolean).join(', ')}>
      <Organic pebble={pebbleTurnOf(item.id)} style={[styles.glyph, { backgroundColor: ink.tint }]}>
        <Icon name={glyph} size={22} color={ink.text} />
      </Organic>
      <View style={styles.words}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      {end ? (
        <AppText variant={warn ? 'metaStrong' : 'meta'} color={expiry.tone === 'expired' ? theme.color.danger : warn ? theme.color.waiting : theme.color.inkMuted}>
          {end}
        </AppText>
      ) : null}
    </Tappable>
  );
}

export const ItemRow = memo(ItemRowComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    glyph: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
    words: { flex: 1, minWidth: 0, gap: 2 },
  });
}
