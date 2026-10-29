/**
 * "Vérifier les liens": Claude lists the links that no longer belong in a collection, each with
 * where it would go; the person unticks what they disagree with, and the rest moves as one batch.
 * The phone's `ReviewSheet`.
 */
import { type CSSProperties, useEffect, useId, useState } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, INBOX_TITLE, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { displayHost } from '@unlease/core/services/url';
import type { SortMove } from '@unlease/notes/sync/sorting';

import { applyReview, reviewLine } from '../../../app/sorting';
import { useLibraryStore } from '../../../app/store/library';
import { showUndo } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { ReadingTrack } from '../links/ReadingTrack';
import styles from './lines.module.css';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly moves: readonly SortMove[]; readonly incomplete: string | null };

/** The row is the checkbox: the link, where it would go, and that collection's cut-out. */
function ReviewRow({ move, kept, onToggle, index }: { move: SortMove; kept: boolean; onToggle: () => void; index: number }) {
  const link = useLibraryStore(s => s.links[move.link]);
  const target = useLibraryStore(s => s.notes[move.to]);
  if (!link) return null;
  const title = link.title || displayHost(link.url);
  const destination = move.to === INBOX_ID ? t(INBOX_TITLE) : (target?.title ?? '');
  return (
    <button type="button" role="checkbox" aria-checked={kept} aria-label={t('{title}, vers {collection}', { title, collection: destination })} className={`${styles.moveRow} ${styles.arriving}`} style={{ '--arrive': index } as CSSProperties} onClick={onToggle}>
      <span className={styles.box}>
        <Icon name={kept ? 'boxChecked' : 'box'} size={20} />
      </span>
      <span className={styles.moveText}>
        <span className={`${styles.reviewTitle} t-body-strong`}>{title}</span>
        <span className={`${styles.moveHint} t-meta`}>{t('Vers {collection}', { collection: destination })}</span>
      </span>
      <span className={styles.moveMark}>
        <Emblem emblem={collectionEmblem(move.to, target?.emblem ?? null)} color={asLineColor(target?.color ?? null)} size={28} />
      </span>
    </button>
  );
}

export function ReviewDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <ReviewBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

/** Mounted each time the dialog opens: it asks Claude then (and on "Réessayer"), and drops the question when the dialog goes. */
function ReviewBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const line = useLibraryStore(s => s.notes[id]);
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).length);
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    reviewLine(id, controller.signal).then(
      ({ moves, incomplete }) => {
        if (controller.signal.aborted) return;
        setKept(new Set(moves.map(move => move.link)));
        setPhase({ kind: 'ready', moves, incomplete });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, attempt]);

  if (!line) return null;

  const retry = (): void => {
    setPhase({ kind: 'asking' });
    setAttempt(value => value + 1);
  };
  const toggle = (linkId: string): void =>
    setKept(previous => {
      const next = new Set(previous);
      if (!next.delete(linkId)) next.add(linkId);
      return next;
    });
  const apply = (): void => {
    if (phase.kind !== 'ready') return;
    const { moved, undo } = applyReview(id, phase.moves.filter(move => kept.has(move.link)));
    onDismiss();
    if (moved.length > 0) showUndo(plural(moved.length, 'lien déplacé', 'liens déplacés'), undo);
  };

  // Nothing to move but part of it unread is no all-clear: it says so, as a failure does.
  const failure = phase.kind === 'failed' ? phase.reason : phase.kind === 'ready' && phase.moves.length === 0 ? phase.incomplete : null;

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.reviewWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{t('Claude relit {links} de {collection}…', { links: plural(count, 'lien'), collection: shownTitle(line) })}</p>
      </div>
    ) : failure !== null || phase.kind === 'failed' ? (
      <p className={`${styles.reviewNote} ${styles.reviewError} t-body`} role="alert">{t('Claude n’a pas pu relire la collection : {reason}', { reason: failure ? t(failure) : '' })}</p>
    ) : phase.moves.length === 0 ? (
      <p className={`${styles.reviewNote} t-body`}>{t('Tous les liens ont leur place dans {collection}.', { collection: shownTitle(line) })}</p>
    ) : (
      <>
        <p className={`${styles.choiceLead} t-body`}>{t('Claude propose d’en sortir {links} de {collection}. Décochez ceux qui y restent.', { links: plural(phase.moves.length, 'lien'), collection: shownTitle(line) })}</p>
        {phase.incomplete ? <p className={`${styles.reviewNote} ${styles.reviewError} t-meta`}>{t('Une partie n’a pas pu être relue : {reason}', { reason: t(phase.incomplete) })}</p> : null}
        {phase.moves.map((move, index) => (
          <ReviewRow key={move.link} move={move} kept={kept.has(move.link)} onToggle={() => toggle(move.link)} index={index} />
        ))}
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : failure !== null || phase.kind === 'failed' ? (
      <Button kind="text" onClick={retry}>
        {t('Réessayer')}
      </Button>
    ) : phase.moves.length === 0 ? (
      <Button kind="text" onClick={onDismiss}>
        {t('Fermer')}
      </Button>
    ) : (
      <>
        <Button kind="text" onClick={onDismiss}>
          {t('Annuler')}
        </Button>
        <Button disabled={kept.size === 0} onClick={apply}>
          {kept.size > 0 ? t('Déplacer {links}', { links: plural(kept.size, 'lien') }) : t('Déplacer')}
        </Button>
      </>
    );

  return (
    <DialogFrame kind="list" title={t('Vérifier les liens')} titleId={titleId} onClose={onDismiss} foot={foot}>
      {body}
    </DialogFrame>
  );
}
