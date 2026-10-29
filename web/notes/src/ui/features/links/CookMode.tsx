/**
 * "En cuisine": the recipe in the kitchen, the screen kept awake. Its ingredients to tick (for the
 * servings chosen), its method one step at a time, in large type; a duration in a step starts a
 * timer in one press. Wide, the ingredients stand beside the step; narrow, one or the other. Arrows
 * turn the steps. The phone's `CookingScreen`.
 */
import { type ReactNode, useEffect, useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { linkShop } from '@unlease/notes/services/modules';
import { scaleIngredient, stepTimers } from '@unlease/notes/services/recipes';

import { readRecipe } from '../../../app/modules';
import { selectFactor, selectTimers, startTimer, useKitchenStore } from '../../../app/store/kitchen';
import { useLibraryStore } from '../../../app/store/library';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { Segmented } from '../../components/Segmented';
import { NARROW, useMedia } from '../../useMedia';
import { primeChime, useSecond, useWakeLock } from './kitchen';
import { TimerPill } from './KitchenTimers';
import { ReadingTrack } from './ReadingTrack';
import { ServingsStepper, servingsLine } from './ServingsStepper';
import { useModuleSearch } from './useModuleSearch';
import styles from './links.module.css';

type View = 'steps' | 'ingredients';

export function CookMode({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId} full>
      <CookBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** A step's words, its durations marked in them, and under them a tonal chip per duration that starts its timer (the phone's). */
function StepText({ text, onTimer }: { text: string; onTimer: (seconds: number) => void }) {
  const timers = stepTimers(text);
  const parts: ReactNode[] = [];
  let at = 0;
  timers.forEach((timer, index) => {
    if (timer.start > at) parts.push(text.slice(at, timer.start));
    parts.push(
      <strong key={index} className={styles.duration}>
        {text.slice(timer.start, timer.end)}
      </strong>,
    );
    at = timer.end;
  });
  parts.push(text.slice(at));
  return (
    <>
      <p className={styles.cookStepText}>{parts}</p>
      {timers.length > 0 ? (
        <div className={styles.stepTimers}>
          {timers.map((timer, index) => {
            const words = text.slice(timer.start, timer.end).trim();
            return (
              <button key={index} type="button" className={styles.timerChip} onClick={() => onTimer(timer.seconds)} aria-label={t('Lancer un minuteur de {duration}', { duration: words })}>
                <Icon name="clock" size={20} />
                {words}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function CookBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const factor = useKitchenStore(selectFactor(id));
  const timers = useKitchenStore(selectTimers);
  const narrow = useMedia(NARROW);
  const { phase, search } = useModuleSearch((_fresh, signal) => readRecipe(id, true, signal));
  const [view, setView] = useState<View>('steps');
  const [index, setIndex] = useState(0);
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const now = useSecond(timers.length > 0);
  useWakeLock(true);
  const steps = phase.kind === 'ready' ? phase.answer.steps : [];
  const count = steps.length;
  // Narrow, one part at a time; without a method there is only the list.
  const turning = count > 0 && (!narrow || view === 'steps');

  // The arrows turn the steps while they show, unless a field or a choice has them.
  useEffect(() => {
    if (!turning) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"], [role="radiogroup"]')) return;
      if (event.key === 'ArrowRight') setIndex(current => Math.min(count - 1, current + 1));
      else if (event.key === 'ArrowLeft') setIndex(current => Math.max(0, current - 1));
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [count, turning]);

  if (!link) return null;
  const title = link.title || linkShop(link);

  if (phase.kind !== 'ready') {
    return (
      <DialogFrame
        title={title}
        titleId={titleId}
        onClose={onDismiss}
        className={styles.cookFrame}
        page
        foot={
          phase.kind === 'failed' ? (
            <>
              <Button kind="text" icon="external" href={link.url}>
                {t('Ouvrir la recette')}
              </Button>
              <Button onClick={() => search(false)}>{t('Réessayer')}</Button>
            </>
          ) : null
        }
      >
        {phase.kind === 'asking' ? (
          <div className={styles.couponsWaiting} role="status">
            <ReadingTrack width={120} />
            <p className="t-body">{t('Lecture de la recette…')}</p>
          </div>
        ) : (
          <p className={`${styles.couponsError} t-body`} role="alert">
            {t('La recette n’a pas pu être lue : {reason}', { reason: t(phase.reason) })}
          </p>
        )}
      </DialogFrame>
    );
  }

  const { ingredients, servings } = phase.answer;
  const listed = ingredients.length > 0;
  const step = steps[Math.min(index, Math.max(0, count - 1))];
  const toggle = (row: number): void =>
    setTicked(current => {
      const next = new Set(current);
      if (!next.delete(row)) next.add(row);
      return next;
    });
  const time = (seconds: number): void => {
    primeChime();
    startTimer(id, t('Étape {n}', { n: index + 1 }), seconds);
  };
  const line = servingsLine(link, factor, servings);

  const ingredientList = (
    <section className={styles.cookIngredients} aria-labelledby={`${titleId}-ingredients`}>
      <h3 id={`${titleId}-ingredients`} className="t-section">
        {t('Ingrédients')}
      </h3>
      {line ? <p className="t-meta">{line}</p> : null}
      <ul className={styles.choices}>
        {ingredients.map((ingredient, row) => {
          const done = ticked.has(row);
          return (
            <li key={`${row}-${ingredient}`}>
              <button type="button" role="checkbox" aria-checked={done} className={styles.choice} data-done={done || undefined} onClick={() => toggle(row)}>
                <Icon name={done ? 'boxChecked' : 'box'} size={20} className={done ? styles.choiceDone : undefined} />
                <span className="t-body">{scaleIngredient(ingredient, factor)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
  const method = step ? (
    <section className={styles.cookMethod} aria-labelledby={`${titleId}-step`} aria-live="polite">
      <p id={`${titleId}-step`} className="t-meta-strong">
        {t('Étape {n} sur {total}', { n: index + 1, total: count })}
        {step.section ? ` · ${step.section}` : ''}
      </p>
      <StepText key={index} text={step.text} onTimer={time} />
    </section>
  ) : (
    <section className={styles.cookMethod}>
      <p className="t-body">{t('Cette page ne donne pas ses étapes : suivez-la sur le site.')}</p>
      <Button kind="tonal" icon="external" href={link.url}>
        {t('Ouvrir la recette')}
      </Button>
    </section>
  );

  const foot = turning ? (
      <>
        <Button kind="text" icon="back" disabled={index === 0} onClick={() => setIndex(index - 1)} title={t('Étape précédente')}>
          {t('Précédente')}
        </Button>
        {index < count - 1 ? (
          <Button icon="arrowRight" onClick={() => setIndex(index + 1)} title={t('Étape suivante')}>
            {t('Suivante')}
          </Button>
        ) : (
          <Button icon="check" onClick={onDismiss}>
            {t('Terminé')}
          </Button>
        )}
      </>
    ) : null;

  return (
    <DialogFrame title={title} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.cookFrame} page>
      <div className={styles.cookTop}>
        {listed ? <ServingsStepper link={link} /> : null}
        {narrow && count > 0 && listed ? (
          <Segmented<View>
            label={MODULE_NAMES.cooking}
            options={[
              { value: 'steps', label: t('Étapes') },
              { value: 'ingredients', label: t('Ingrédients') },
            ]}
            value={view}
            onChange={setView}
          />
        ) : null}
      </div>
      {timers.length > 0 ? (
        <ul className={styles.timerStrip} aria-label={t('Minuteurs')}>
          {timers.map(timer => (
            <TimerPill key={timer.id} timer={timer} now={now} here={id} />
          ))}
        </ul>
      ) : null}
      {!listed ? (
        // A page that gives its method but no list: the steps alone.
        method
      ) : !narrow ? (
        <div className={styles.cookColumns}>
          {ingredientList}
          {method}
        </div>
      ) : count === 0 ? (
        <>
          {method}
          {ingredientList}
        </>
      ) : turning ? (
        method
      ) : (
        ingredientList
      )}
    </DialogFrame>
  );
}
