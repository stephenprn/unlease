/**
 * « Souhaiter » on a birthday's page, as Contacts does it: one way (only a number to text, only an
 * e-mail) goes at once; several (SMS, WhatsApp, e-mail: those the person has) are rows of a sheet, the
 * message they open written quoted under its title, each row saying where it goes. The message is
 * changed, if wished, in the app it opens.
 */
import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { WISH_GLYPHS, wishChannelName, type WishWay } from '@unlease/contacts/services/wishes';
import { later } from '@app/later';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, ListRow, Sheet, SHEET_INSET, SheetScroll } from '@shared/ui/components';

/** The way opened with the wish written; a slip says so when nothing on the phone opens it. */
export function sendWish(way: WishWay): void {
  later(Linking.openURL(way.href).catch(() => showSnack(t('No app on this phone opens it.'), undefined, { tone: 'warning' })));
}

export function WishSheet({ visible, name, message, ways, onDismiss }: { visible: boolean; name: string; message: string; ways: readonly WishWay[]; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Wish {name} a happy birthday', { name })}>
      <AppText variant="meta" style={styles.message}>
        {t('“{message}”', { message })}
      </AppText>
      <SheetScroll>
        {ways.map(way => (
          <ListRow
            key={way.channel}
            icon={WISH_GLYPHS[way.channel]}
            title={wishChannelName(way.channel)}
            supporting={way.to}
            onPress={() => {
              onDismiss();
              sendWish(way);
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

/** `wish()` sends the one way there is, or opens the sheet (`asking`) to pick among several. */
export function useWish(ways: readonly WishWay[]): { wish: () => void; asking: boolean; stop: () => void } {
  const [asking, setAsking] = useState(false);
  const wish = useCallback(() => {
    if (ways.length === 1) sendWish(ways[0]!);
    else if (ways.length > 1) setAsking(true);
  }, [ways]);
  return { wish, asking, stop: () => setAsking(false) };
}

const styles = StyleSheet.create({
  // The message on the sheet's column, under its title, a step closer to it than the rows.
  message: { marginHorizontal: SHEET_INSET, marginTop: -6, marginBottom: 8 },
});
