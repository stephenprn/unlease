/**
 * « Suivi des prix » on the link page, under the price, while its collection watches prices and the
 * link is something to buy (`notes/services/priceWatch`): the price before its last change and since
 * when (a drop in the `ok` ink, a rise quiet), when the server last read it, and « Vérifier le
 * prix », busy while the server reads the page, its answer as a slip of its tone. The phone's
 * `PriceWatch`.
 */
import { useEffect, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { PRICE_WATCH, priceChangeText, priceCheckedText } from '@unlease/notes/services/priceWatch';
import { lineModules, moduleFits } from '@unlease/notes/services/modules';

import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { checkPriceNow, runningPriceCheck } from '../../../app/priceWatch';
import { useLibraryStore } from '../../../app/store/library';
import styles from './priceWatch.module.css';

/** `underPrice`: right under the price's row, it sits close to it. */
export function PriceWatch({ id, underPrice }: { id: string; underPrice: boolean }) {
  const link = useLibraryStore(s => s.links[id]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const server = useSettingsStore(selectServer);
  const now = useMinute();
  const [checking, setChecking] = useState(() => runningPriceCheck(id) !== null);
  // Opened again while its check runs: busy until it ends (a press joins it).
  useEffect(() => {
    const running = runningPriceCheck(id);
    if (!running) return;
    let live = true;
    void running.finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [id]);
  // The server reads the page: without one, nothing is watched here.
  if (!link || !server || !lineModules(line).includes(PRICE_WATCH) || !moduleFits(PRICE_WATCH, link)) return null;
  const change = priceChangeText(link, now);

  const check = (): void => {
    setChecking(true);
    void checkPriceNow(id)
      .then(slip => showSnack(slip.text, undefined, { tone: slip.tone }))
      .finally(() => setChecking(false));
  };

  return (
    <div className={styles.watch} data-under-price={underPrice || undefined}>
      {change ? <p className={change.down ? `${styles.drop} t-meta-strong` : 't-meta'}>{change.text}</p> : null}
      <div className={styles.foot}>
        <p className="t-meta">{priceCheckedText(link, now)}</p>
        <Button kind="text" small icon="refresh" busy={checking} onClick={check}>
          {t('Vérifier le prix')}
        </Button>
      </div>
    </div>
  );
}
