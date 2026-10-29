/**
 * "Résumé jusqu’ici": the person says where they stopped (a season, an episode or the whole season),
 * and Claude recaps the series up to there from summaries on the web, nothing after: the story so
 * far, where its people stand. Nothing is written; the server keeps a recap a month. The phone's
 * `RecapSheet`.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { formatDay } from '@unlease/core/services/format';
import { linkShop } from '@unlease/notes/services/modules';
import { RECAP_LIMITS, recapStopWords } from '@unlease/notes/services/works';

import { useMinute } from '../../../app/hooks/useMinute';
import { findRecap } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { useOutline } from '../../components/Outline';
import { DialogFrame } from '../../components/Dialog';
import { Layer } from '../../components/Layer';
import { ReadingTrack } from './ReadingTrack';
import { Stepper } from './Stepper';
import { useModuleSearch } from './useModuleSearch';
import styles from './links.module.css';

interface Stop {
  readonly season: number;
  /** Null: the whole season. */
  readonly episode: number | null;
}

/** Where each series was left, for the visit: the dialog opens on it again. */
const lastStops = new Map<string, Stop>();

export function RecapDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <RecapBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

function RecapBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const now = useMinute();
  const [stop, setStop] = useState<Stop>(() => lastStops.get(id) ?? { season: 1, episode: null });
  const [picking, setPicking] = useState(true);
  const { phase, search } = useModuleSearch((fresh, signal) => findRecap(id, stop.season, stop.episode, fresh, signal), false);
  const { ref: wellRef, vars: wellVars } = useOutline<HTMLDListElement>('panel');
  if (!link) return null;
  const series = link.title || linkShop(link);
  const pick = (next: Stop): void => {
    setStop(next);
    lastStops.set(id, next);
  };
  const recap = (): void => {
    setPicking(false);
    search(false);
  };

  if (picking) {
    const { season, episode } = stop;
    return (
      <DialogFrame
        title={MODULE_NAMES.recap}
        titleId={titleId}
        onClose={onDismiss}
        className={styles.couponsFrame}
        foot={
          <>
            <Button kind="text" onClick={onDismiss}>
              {t('Annuler')}
            </Button>
            <Button icon="rewind" onClick={recap}>
              {t('Résumer')}
            </Button>
          </>
        }
      >
        <p className="t-body-strong">{t('Où vous êtes-vous arrêté ?')}</p>
        <div className={styles.recapPicker}>
          <Stepper
            label={t('Saison')}
            value={t('Saison {season}', { season })}
            lessLabel={t('Saison précédente')}
            moreLabel={t('Saison suivante')}
            onLess={season > 1 ? () => pick({ season: season - 1, episode }) : undefined}
            onMore={season < RECAP_LIMITS.seasons ? () => pick({ season: season + 1, episode }) : undefined}
          />
          <Stepper
            label={t('Épisode')}
            value={episode === null ? t('Toute la saison') : t('Épisode {episode}', { episode })}
            lessLabel={t('Épisode précédent')}
            moreLabel={t('Épisode suivant')}
            onLess={episode !== null ? () => pick({ season, episode: episode > 1 ? episode - 1 : null }) : undefined}
            onMore={(episode ?? 0) < RECAP_LIMITS.episodes ? () => pick({ season, episode: (episode ?? 0) + 1 }) : undefined}
          />
        </div>
        <p className="t-meta">{t('Claude s’arrête là : rien de la suite, ni d’indice sur ce qui vient.')}</p>
      </DialogFrame>
    );
  }

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Claude résume {series} jusqu’à {stop}…', { series, stop: recapStopWords(stop.season, stop.episode) })}</p>
        <p className="t-meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Claude n’a pas pu chercher : {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        {phase.answer.stop ? <p className="t-body-strong">{phase.answer.stop}</p> : null}
        <div className={styles.answerText}>
          {phase.answer.recap.split('\n\n').map((paragraph, index) => (
            <p key={index} className="t-body">
              {paragraph}
            </p>
          ))}
        </div>
        {phase.answer.characters.length > 0 ? (
          <section className={styles.couponTips} aria-labelledby={`${titleId}-people`}>
            <h3 id={`${titleId}-people`} className="t-section">
              {t('Personnages')}
            </h3>
            <dl ref={wellRef} className={`${styles.couponsWell} ${styles.people} paper`} style={wellVars}>
              {phase.answer.characters.map(person => (
                <div key={person.name} className={styles.person}>
                  <dt className="t-body-strong">{person.name}</dt>
                  {person.note ? <dd className="t-body">{person.note}</dd> : null}
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <p className="t-meta">{t('Écrit par Claude le {day} d’après des résumés trouvés sur le web, sans rien de la suite.', { day: formatDay(phase.answer.searchedAt, now) })}</p>
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : (
      <>
        <Button kind="text" onClick={() => setPicking(true)}>
          {t('Changer d’épisode')}
        </Button>
        {phase.kind === 'failed' ? (
          <Button onClick={() => search(false)}>{t('Réessayer')}</Button>
        ) : (
          <Button kind="tonal" icon="refresh" onClick={() => search(true)}>
            {t('Chercher à nouveau')}
          </Button>
        )}
      </>
    );

  return (
    <DialogFrame title={MODULE_NAMES.recap} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
