/**
 * The snip, the app's one authored moment. While Claude reads a shared link, small scissors work
 * along a dashed cut line from the "Non classé" tray; once the link is filed, the cut runs through
 * in the collection's pigment and its emblem lands with a small overshoot. Kept in "Non classé",
 * the scissors draw back and the empty stop fades. "Voir" opens the collection, "Changer" moves
 * the link by hand; the slip leaves on its own a few seconds after the link is filed.
 *
 * The cut is driven with the Web Animations API, so a reading that lands mid-stroke carries on
 * from wherever the scissors are. Under reduced motion it stands halfway, then at its end.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { formatPrice, plural } from '@unlease/core/services/format';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';

import { moveLink } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectServer, useSettingsStore } from '../../../app/store/settings';
import { endTransfer, selectTransfers, showSnack, useUiStore } from '../../../app/store/ui';
import { Emblem } from '../../components/Emblem';
import { PebbleEdge } from '../../components/Outline';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { overlayRoot } from '../../components/layers';
import { navigate, paths } from '../../router';
import { MoveDialog } from '../lines/MoveDialog';
import styles from './capture.module.css';

const SCISSORS = 22;
const MARK = 34;
/** How far the scissors get while Claude reads (the phone's): the last stretch waits for the answer. */
const READING_CUT = 0.62;
const READING_MS = 2_340;
const SETTLE_MS = 300;
const DECELERATE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';
const STAY_FILED_MS = 6_000;
const STAY_OFFLINE_MS = 5_000;
const LEAVE_MS = 220;

const reducedQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    listener => {
      reducedQuery?.addEventListener('change', listener);
      return () => reducedQuery?.removeEventListener('change', listener);
    },
    () => reducedQuery?.matches ?? false,
    () => false,
  );
}

export function TransferPanel() {
  const transfers = useUiStore(selectTransfers);
  const current = transfers[transfers.length - 1];
  if (!current) return null;
  return createPortal(
    <div className={styles.host}>
      <Transfer key={current.linkId} linkId={current.linkId} cleaned={current.cleaned} queued={transfers.length - 1} />
    </div>,
    overlayRoot('live'),
  );
}

function Transfer({ linkId, cleaned, queued }: { linkId: string; cleaned: number; queued: number }) {
  const link = useLibraryStore(s => s.links[linkId]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const inbox = useLibraryStore(s => s.notes[INBOX_ID]);
  const server = useSettingsStore(selectServer);
  const reduced = useReducedMotion();
  const [moving, setMoving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const track = useRef<HTMLSpanElement>(null);
  const cut = useRef<HTMLSpanElement>(null);
  const blade = useRef<HTMLSpanElement>(null);
  const strokes = useRef<Animation[]>([]);

  // The server writes the reading and the filing in one change, so "no longer pending" is the
  // moment the destination is known.
  const settled = !!link && link.status !== 'pending';
  const filed = settled && link.noteId !== INBOX_ID;
  const gone = !link || link.deletedAt !== null;

  useLayoutEffect(() => {
    const rail = track.current;
    const trail = cut.current;
    const scissors = blade.current;
    if (!rail || !trail || !scissors) return;
    const run = Math.max(0, rail.clientWidth - SCISSORS);
    const to = !settled ? READING_CUT : filed ? 1 : 0;
    // The trail runs from the tray's edge to the scissors' pivot, wherever the scissors are.
    const reach = (at: number): number => (SCISSORS / 2 + at * run) / (SCISSORS / 2 + run);
    const place = (at: number): void => {
      trail.style.transform = `scaleX(${reach(at)})`;
      scissors.style.transform = `translateX(${at * run}px)`;
    };
    if (reduced || typeof scissors.animate !== 'function') {
      for (const stroke of strokes.current) stroke.cancel();
      strokes.current = [];
      place(settled ? to : 0.5);
      return;
    }
    // Read before cancelling: the running stroke is where the next one starts.
    const shown = getComputedStyle(scissors).transform;
    const from = run > 0 && shown !== 'none' ? Math.min(1, Math.max(0, new DOMMatrixReadOnly(shown).m41 / run)) : 0;
    for (const stroke of strokes.current) stroke.cancel();
    place(to);
    const timing: KeyframeAnimationOptions = { duration: settled ? SETTLE_MS : READING_MS, easing: DECELERATE };
    strokes.current = [
      trail.animate([{ transform: `scaleX(${reach(from)})` }, { transform: `scaleX(${reach(to)})` }], timing),
      scissors.animate([{ transform: `translateX(${from * run}px)` }, { transform: `translateX(${to * run}px)` }], timing),
    ];
  }, [settled, filed, reduced]);

  useEffect(
    () => () => {
      for (const stroke of strokes.current) stroke.cancel();
    },
    [],
  );

  const leave = (): void => {
    setLeaving(true);
    setTimeout(() => endTransfer(linkId), LEAVE_MS);
  };

  // Leaves on its own once filed, or soon when no server will ever read it; never under the pointer.
  useEffect(() => {
    if (gone) {
      endTransfer(linkId);
      return;
    }
    if (held || moving) return;
    if (settled || !server) {
      const timer = setTimeout(
        () => {
          setLeaving(true);
          setTimeout(() => endTransfer(linkId), LEAVE_MS);
        },
        settled ? STAY_FILED_MS : STAY_OFFLINE_MS,
      );
      return () => clearTimeout(timer);
    }
  }, [settled, server, gone, held, moving, linkId]);

  if (!link) return null;
  // The site under the title, unless it is the title again (« Septime », « Septime »): then its address.
  const host = link.siteName && link.siteName.trim().toLowerCase() !== link.title.trim().toLowerCase() ? link.siteName : displayHost(link.url);
  const destination = filed ? line : undefined;
  const headline = !server
    ? t('Pas de serveur : le lien attend dans Non classé')
    : link.status === 'skipped'
      ? t('Lecture désactivée : gardé dans Non classé')
      : !settled
        ? t('Claude lit la page…')
        : link.status === 'failed'
          ? t('Lecture impossible, gardé dans Non classé')
          : filed
            ? t('Rangé dans {collection}', { collection: line ? shownTitle(line) : '' })
            : t('Gardé dans Non classé');

  return (
    <>
      <section
        className={`${styles.slip} paper`}
        data-surface="slip"
        data-state={!settled ? 'reading' : filed ? 'filed' : 'kept'}
        data-leaving={leaving || undefined}
        // Its own "Changer de collection" covers it, as the phone's sheet does: the slip lives above the layers.
        data-covered={moving || undefined}
        aria-label={t('Classement du lien')}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        <div className={styles.slipHead}>
          <p className={`${styles.slipTitle} t-body-strong`}>{link.title || prettyUrl(link.url)}</p>
          {queued > 0 ? (
            <span className={`${styles.queued} t-meta-strong`} aria-label={plural(queued, 'autre en attente', 'autres en attente')}>
              +{queued}
            </span>
          ) : null}
          <IconButton icon="close" label={t('Fermer')} onSlip compact size={18} className={styles.close} onClick={leave} />
        </div>
        <p className={`${styles.site} t-meta`}>{cleaned > 0 ? `${host} · ${plural(cleaned, 'traceur retiré', 'traceurs retirés')}` : host}</p>
        <div className={styles.cutRow} aria-hidden="true">
          <Emblem emblem="bac" color={asLineColor(inbox?.color ?? null) ?? 'grey'} size={MARK} />
          <span ref={track} className={styles.cutTrack}>
            <span ref={cut} className={styles.cutTrail} style={destination ? ({ '--cut-ink': `var(--line-${destination.color ?? 'grey'})` } as CSSProperties) : undefined} />
            <span ref={blade} className={styles.blade}>
              <Icon name="scissors" size={SCISSORS} />
            </span>
          </span>
          {destination ? (
            <span className={styles.landing}>
              <Emblem emblem={collectionEmblem(destination.id, destination.emblem)} color={asLineColor(destination.color)} size={MARK} />
            </span>
          ) : (
            <span className={styles.emptyStop}>
              <PebbleEdge turn={1} />
            </span>
          )}
        </div>
        <div className={styles.slipFoot}>
          <p className={`${styles.headline} t-meta`} role="status" aria-live="polite">
            {headline}
            {settled && link.price !== null ? ` · ${formatPrice(link.price, link.currency)}` : ''}
          </p>
          {settled ? (
            <>
              <button type="button" className={styles.slipAction} aria-label={t('Changer de collection')} onClick={() => setMoving(true)}>
                {t('Changer')}
              </button>
              <button
                type="button"
                className={styles.slipAction}
                aria-label={t('Voir la collection')}
                onClick={() => {
                  endTransfer(linkId);
                  navigate(paths.line(link.noteId));
                }}
              >
                {t('Voir')}
              </button>
            </>
          ) : null}
        </div>
      </section>
      <MoveDialog
        open={moving}
        currentLineId={link.noteId}
        onDismiss={() => setMoving(false)}
        onPick={target => {
          moveLink(linkId, target);
          endTransfer(linkId);
          const into = useLibraryStore.getState().notes[target];
          showSnack(t('Déplacé dans {collection}', { collection: into ? shownTitle(into) : '' }), undefined, { tone: 'success' });
        }}
      />
    </>
  );
}
