/**
 * "Autres regards": Claude looks for the same story in other outlets, with each one's angle and what
 * it adds to the saved article or contradicts in it. Nothing is written; the server keeps the answer
 * half a day. The phone's `CoverageSheet`.
 */
import { type CSSProperties, useId } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatClock, formatDay, formatIsoDay } from '@unlease/core/services/format';
import type { CoverageOutlet } from '@unlease/notes/sync/coverage';

import { useMinute } from '../../../app/hooks/useMinute';
import { findCoverage } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { useOutline } from '../../components/Outline';
import { ReadingTrack } from './ReadingTrack';
import { useModuleSearch } from './useModuleSearch';
import styles from './links.module.css';

export function CoverageDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <CoverageBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** One outlet: its name and day, its title, how it tells the story and what it adds; its article from its end. */
function OutletRow({ outlet, index }: { outlet: CoverageOutlet; index: number }) {
  const url = outlet.url;
  return (
    <li className={`${styles.coupon} ${styles.arriving}`} style={{ '--arrive': index } as CSSProperties}>
      <div className={styles.couponText}>
        <p className={styles.offerHead}>
          <span className="t-body-strong">{outlet.outlet}</span>
          {outlet.date ? <span className="t-meta">{formatIsoDay(outlet.date)}</span> : null}
        </p>
        {outlet.title ? <p className="t-body">{outlet.title}</p> : null}
        <p className="t-meta-strong">{outlet.angle}</p>
        {outlet.adds ? <p className="t-meta">{outlet.adds}</p> : null}
      </div>
      {url ? <IconButton icon="external" label={t('Lire sur {outlet}', { outlet: outlet.outlet })} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} /> : <span className={styles.offerSpace} aria-hidden="true" />}
    </li>
  );
}

function CoverageBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const now = useMinute();
  const { phase, search } = useModuleSearch((fresh, signal) => findCoverage(id, fresh, signal));
  const { ref: wellRef, vars: wellVars } = useOutline<HTMLUListElement>('panel');
  if (!link) return null;

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Claude cherche le même sujet dans d’autres médias…')}</p>
        <p className="t-meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Claude n’a pas pu chercher : {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        {phase.answer.story ? <p className="t-body-strong">{phase.answer.story}</p> : null}
        {phase.answer.outlets.length === 0 ? (
          <p className="t-body">{t('Aucun autre média trouvé sur ce sujet pour l’instant.')}</p>
        ) : (
          <ul ref={wellRef} className={`${styles.couponsWell} paper`} style={wellVars} aria-label={MODULE_NAMES.coverage}>
            {phase.answer.outlets.map((outlet, index) => (
              <OutletRow key={`${outlet.outlet}-${outlet.url ?? index}`} outlet={outlet} index={index} />
            ))}
          </ul>
        )}
        {phase.answer.note ? <p className="t-body">{phase.answer.note}</p> : null}
        <p className="t-meta">{t('Trouvé sur le web par Claude le {day} à {time}.', { day: formatDay(phase.answer.searchedAt, now), time: formatClock(phase.answer.searchedAt) })}</p>
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : (
      <>
        {phase.kind === 'failed' ? (
          <Button kind="text" onClick={() => search(false)}>
            {t('Réessayer')}
          </Button>
        ) : (
          <Button kind="text" icon="refresh" onClick={() => search(true)}>
            {t('Chercher à nouveau')}
          </Button>
        )}
        <Button icon="external" href={link.url}>
          {t('Ouvrir la page')}
        </Button>
      </>
    );

  return (
    <DialogFrame title={MODULE_NAMES.coverage} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
