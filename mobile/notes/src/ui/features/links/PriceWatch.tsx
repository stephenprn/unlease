/**
 * « Suivi des prix » on the link page, under the price, while its collection watches prices and the
 * link is something to buy (`notes/services/priceWatch`): the price before its last change and since
 * when (a drop in the `ok` ink, a rise quiet), when the server last read it, and « Vérifier le
 * prix », busy while the server reads the page, its answer as a slip of its tone. The web's
 * `PriceWatch`.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { lineModules, moduleFits } from '@unlease/notes/services/modules';
import { PRICE_WATCH, priceChangeText, priceCheckedText } from '@unlease/notes/services/priceWatch';
import { checkPriceNow, runningPriceCheck } from '@app/priceWatch';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** `underPrice`: right under the price's row, it sits close to it. */
export function PriceWatch({ id, underPrice }: { id: string; underPrice: boolean }) {
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[id]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const server = useSettingsStore(selectServer);
  const [checking, setChecking] = useState(() => runningPriceCheck(id) !== null);
  // Left and opened again while its check runs: busy until it ends (a press joins it).
  useEffect(() => {
    const running = runningPriceCheck(id);
    if (!running) return;
    let live = true;
    running.finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [id]);
  // The server reads the page: without one, nothing is watched here.
  if (!link || !server || !lineModules(line).includes(PRICE_WATCH) || !moduleFits(PRICE_WATCH, link)) return null;
  const now = Date.now();
  const change = priceChangeText(link, now);

  const check = () => {
    setChecking(true);
    checkPriceNow(id)
      .then(slip => showSnack(slip.text, undefined, { tone: slip.tone }))
      .finally(() => setChecking(false));
  };

  return (
    <View style={[styles.watch, underPrice ? styles.underPrice : null]}>
      {change ? (
        <AppText variant={change.down ? 'metaStrong' : 'meta'} color={change.down ? theme.color.ok : theme.color.inkMuted}>
          {change.text}
        </AppText>
      ) : null}
      <View style={styles.foot}>
        <AppText variant="meta">{priceCheckedText(link, now)}</AppText>
        <Button kind="text" small icon="refresh" label={t('Vérifier le prix')} busy={checking} onPress={check} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  watch: { gap: 2 },
  // Close to the price it speaks of: 4 under its row, not the heading's 10 (the web's).
  underPrice: { marginTop: -6 },
  // When it was read, and the way to read it now, on one line while they fit.
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, minHeight: 32 },
});
