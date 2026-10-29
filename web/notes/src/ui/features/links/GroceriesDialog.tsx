/**
 * "Liste de courses": a recipe's ingredients, each ticked, for the servings chosen ("Pour N
 * personnes"), to add to a new checklist or to one already started (the five lately edited). The
 * person unticks what is already in the cupboard; the rest goes in as one gesture, and the slip
 * opens the list. The phone's `GroceriesSheet`.
 */
import { type CSSProperties, useEffect, useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { plural } from '@unlease/core/services/format';
import { linkShop } from '@unlease/notes/services/modules';
import { scaleIngredient } from '@unlease/notes/services/recipes';
import type { RecipeResponse } from '@unlease/notes/sync/recipe';

import { readRecipe } from '../../../app/modules';
import { addToChecklist } from '../../../app/store/actions';
import { selectFactor, useKitchenStore } from '../../../app/store/kitchen';
import { useLibraryStore } from '../../../app/store/library';
import { showSnack } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { navigate, paths } from '../../router';
import { ReadingTrack } from './ReadingTrack';
import { servingsLine } from './ServingsStepper';
import styles from './links.module.css';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: RecipeResponse };

/** Checklists offered besides a new one. */
const RECENT_LISTS = 5;

export function GroceriesDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <GroceriesBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

function GroceriesBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const notes = useLibraryStore(s => s.notes);
  const factor = useKitchenStore(selectFactor(id));
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [round, setRound] = useState(0);
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  /** The checklist chosen; null: a new one. */
  const [target, setTarget] = useState<string | null>(null);
  const lists = useMemo(
    () =>
      Object.values(notes)
        .filter(note => note.kind === 'checklist' && note.deletedAt === null && note.trashedAt === null && !note.archived)
        .sort((a, b) => b.editedAt - a.editedAt)
        .slice(0, RECENT_LISTS),
    [notes],
  );

  useEffect(() => {
    const controller = new AbortController();
    readRecipe(id, false, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, round]);

  if (!link) return null;
  const newTitle = t('Courses : {recipe}', { recipe: link.title || linkShop(link) });
  const toggle = (index: number): void =>
    setSkipped(previous => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  const ingredients = phase.kind === 'ready' ? phase.answer.ingredients.map(line => scaleIngredient(line, factor)) : [];
  const ticked = ingredients.filter((_, index) => !skipped.has(index));
  // A list gone from the offer meanwhile (binned, archived elsewhere) leaves the new one chosen.
  const picked = lists.find(list => list.id === target) ?? null;
  const add = (): void => {
    const noteId = addToChecklist(picked?.id ?? null, newTitle, ticked);
    const list = picked ? picked.title || t('Liste sans titre') : newTitle;
    onDismiss();
    showSnack(t('{items} dans « {list} »', { items: plural(ticked.length, 'ingrédient'), list }), { label: t('Ouvrir'), run: () => navigate(paths.note(noteId)) }, { tone: 'success' });
  };

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Lecture des ingrédients…')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Les ingrédients n’ont pas pu être lus : {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        {servingsLine(link, factor, phase.answer.servings) ? <p className="t-meta">{servingsLine(link, factor, phase.answer.servings)}</p> : null}
        <ul className={styles.choices} aria-label={MODULE_NAMES.groceries}>
          {ingredients.map((ingredient, index) => {
            const on = !skipped.has(index);
            return (
              <li key={`${index}-${ingredient}`} className={styles.arriving} style={{ '--arrive': index } as CSSProperties}>
                <button type="button" role="checkbox" aria-checked={on} className={styles.choice} onClick={() => toggle(index)}>
                  <Icon name={on ? 'boxChecked' : 'box'} size={20} className={on ? styles.choiceDone : undefined} />
                  <span className="t-body">{ingredient}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <section className={styles.couponTips} aria-labelledby={`${titleId}-target`}>
          <h3 id={`${titleId}-target`} className="t-section">
            {t('Ajouter à')}
          </h3>
          <div role="radiogroup" aria-labelledby={`${titleId}-target`} className={styles.choices}>
            <button type="button" role="radio" aria-checked={picked === null} className={styles.choice} onClick={() => setTarget(null)}>
              <Icon name="plus" size={20} />
              <span className={styles.choiceText}>
                <span className="t-body">{t('Nouvelle liste')}</span>
                <span className="t-meta">{newTitle}</span>
              </span>
              {picked === null ? <Icon name="check" size={20} className={styles.choiceMark} /> : null}
            </button>
            {lists.map(list => (
              <button key={list.id} type="button" role="radio" aria-checked={picked?.id === list.id} className={styles.choice} onClick={() => setTarget(list.id)}>
                <Icon name="checklist" size={20} />
                <span className={`${styles.choiceText} t-body`}>{list.title || t('Liste sans titre')}</span>
                {picked?.id === list.id ? <Icon name="check" size={20} className={styles.choiceMark} /> : null}
              </button>
            ))}
          </div>
        </section>
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : phase.kind === 'failed' ? (
      <Button
        kind="text"
        onClick={() => {
          setPhase({ kind: 'asking' });
          setRound(value => value + 1);
        }}
      >
        {t('Réessayer')}
      </Button>
    ) : (
      <>
        <Button kind="text" onClick={onDismiss}>
          {t('Annuler')}
        </Button>
        <Button icon="basket" disabled={ticked.length === 0} onClick={add}>
          {ticked.length > 0 ? t('Ajouter {items}', { items: plural(ticked.length, 'ingrédient') }) : t('Ajouter')}
        </Button>
      </>
    );

  return (
    <DialogFrame title={MODULE_NAMES.groceries} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
