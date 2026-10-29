/**
 * The tile wall.
 *
 * Every card's box is computed before anything renders (`layoutWall`), so a
 * long board mounts only what is near the viewport, with no measuring pass:
 * the scroll position is bucketed, and only a change of bucket re-renders the
 * list. Cards are memoised by id, so a bucket change mounts the newcomers and
 * leaves the rest alone. The card holding keyboard focus is always kept, so
 * Tab never falls out of the wall.
 *
 * It moves as the phone's: a card leaving fades where it was, the others close
 * ranks (each slides from its old box to its new one), a card arriving settles
 * in once they have made room. The first layout, a new geometry (a resize, the
 * layout toggle) and cards scrolled into the window never animate.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { t } from '@unlease/core/i18n';

import type { BoardSection } from '../../../app/hooks/useBoard';
import { setArchived } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { showUndo } from '../../../app/store/ui';
import styles from './board.module.css';
import { CAN_ANIMATE, fadeOut, LEAVE, motionTokens, reducedMotion, settleIn, slide } from './motion';
import { NoteCard } from './NoteCard';
import { layoutWall, SECTION_HEIGHT, wallGeometry, type WallGeometry, type WallItem, type WallLayout } from './wallLayout';

const BUCKET = 400;
/** Below this many cards, everything renders: windowing would only add work. */
const WINDOW_FROM = 120;

type CardItem = Extract<WallItem, { kind: 'card' }>;
const NO_CARDS: readonly CardItem[] = [];

const cardsOf = (wall: WallLayout): CardItem[] => wall.items.filter((item): item is CardItem => item.kind === 'card');

export interface WallProps {
  readonly sections: readonly BoardSection[];
  readonly layout: 'wall' | 'list';
  readonly query: string;
  readonly selection: ReadonlySet<string>;
  readonly now: number;
  readonly onOpen: (id: string) => void;
  readonly onSelect: (id: string, event: MouseEvent, order: readonly string[]) => void;
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Keep's gesture: a card swiped off the board goes to the archive (or out of it), and the slip offers it back. */
function archiveSwiped(id: string): void {
  const note = useLibraryStore.getState().notes[id];
  if (!note) return;
  const archiving = !note.archived;
  showUndo(archiving ? t('Note archivée') : t('Note désarchivée'), setArchived(id, archiving));
}

function WallComponent({ sections, layout, query, selection, now, onOpen, onSelect }: WallProps) {
  const frame = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const width = useWidth(frame);
  // Before the first measure (and in tests, where nothing has a size) the window's width stands in.
  const available = width || (typeof window === 'undefined' ? 960 : Math.min(window.innerWidth, 1200));
  const geometry = useMemo(() => wallGeometry(available, layout), [available, layout]);
  // The layout reads the whole library (titles, checklists, photos), so it follows all of it.
  const library = useLibraryStore();
  const wall = useMemo(() => layoutWall(sections, library, geometry), [sections, library, geometry]);
  const cardCount = useMemo(() => wall.items.filter(item => item.kind === 'card').length, [wall]);
  const order = useMemo(() => sections.flatMap(section => section.ids), [sections]);
  const windowed = cardCount > WINDOW_FROM;

  const [bucket, setBucket] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    if (!windowed) return;
    const onScroll = (): void => {
      const element = frame.current;
      if (!element) return;
      const offset = -element.getBoundingClientRect().top;
      const next = Math.floor(Math.max(0, offset) / BUCKET);
      setBucket(current => (current === next ? current : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [windowed]);

  const viewport = typeof window === 'undefined' ? 900 : window.innerHeight;
  const top = bucket * BUCKET - viewport;
  const bottom = bucket * BUCKET + viewport * 2.5;
  const inView = (item: WallItem): boolean =>
    !windowed ||
    (item.kind === 'section' ? item.top + SECTION_HEIGHT > top && item.top < bottom : (item.top + item.height > top && item.top < bottom) || item.id === focused);
  const visible = wall.items.filter(inView);

  // Cards gone from the layout stay drawn where they were while they fade (only where the page animates,
  // and not when the geometry changed: the whole wall jumps then).
  const [trail, setTrail] = useState<{ readonly wall: WallLayout; readonly geometry: WallGeometry; readonly leaving: readonly CardItem[] }>({ wall, geometry, leaving: NO_CARDS });
  if (trail.wall !== wall) {
    const ids = new Set(cardsOf(wall).map(card => card.id));
    const left = CAN_ANIMATE && trail.geometry === geometry ? cardsOf(trail.wall).filter(card => !ids.has(card.id) && inView(card)) : NO_CARDS;
    const kept = trail.leaving.filter(card => !ids.has(card.id));
    setTrail({ wall, geometry, leaving: kept.length === 0 && left.length === 0 ? NO_CARDS : [...kept, ...left] });
  }
  const leaving = trail.wall === wall ? trail.leaving : NO_CARDS;

  // Ghosts are inert and already faded by then; one clean-up for the batch.
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setTrail(current => ({ ...current, leaving: NO_CARDS })), motionTokens().short + 50);
    return () => clearTimeout(timer);
  }, [leaving]);

  useLayoutEffect(() => {
    const root = surface.current;
    if (!root || leaving.length === 0) return;
    for (const node of root.querySelectorAll<HTMLElement>('[data-leaving]')) {
      if (!node.getAnimations().some(animation => animation.id === LEAVE)) fadeOut(node);
    }
  }, [leaving]);

  // Moves and arrivals, against the layout last drawn.
  const drawn = useRef<{ readonly wall: WallLayout; readonly geometry: WallGeometry } | null>(null);
  useLayoutEffect(() => {
    const before = drawn.current;
    drawn.current = { wall, geometry };
    const root = surface.current;
    if (!root || !CAN_ANIMATE || !before || before.wall === wall || before.geometry !== geometry) return;
    const was = new Map(cardsOf(before.wall).map(card => [card.id, card]));
    const boxes = new Map(cardsOf(wall).map(card => [card.id, card]));
    const still = reducedMotion();
    for (const node of root.querySelectorAll<HTMLElement>('[data-note-id]:not([data-leaving])')) {
      const id = node.dataset.noteId ?? '';
      const box = boxes.get(id);
      if (!box) continue;
      const old = was.get(id);
      if (!old) {
        // Back before its ghost had gone: the same sheet, so its fade (or its throw) is dropped first.
        for (const animation of node.getAnimations()) animation.cancel();
        settleIn(node);
      } else if (!still && (old.left !== box.left || old.top !== box.top)) {
        slide(node, old.left - box.left, old.top - box.top);
      }
    }
  }, [wall, geometry]);

  const select = useCallback((id: string, event: MouseEvent) => onSelect(id, event, order), [onSelect, order]);
  // A swipe needs the wall to itself: not while picking, not over search results (as on the phone).
  const swipe = selection.size === 0 && query === '';

  const card = (item: CardItem, gone: boolean) => (
    <NoteCard
      key={item.key}
      id={item.id}
      left={item.left}
      top={item.top}
      width={item.width}
      height={item.height}
      metrics={geometry.metrics}
      query={query}
      selected={selection.has(item.id)}
      now={now}
      onOpen={onOpen}
      onSelect={select}
      swipe={swipe && !gone}
      onSwiped={archiveSwiped}
      leaving={gone}
    />
  );

  return (
    <div
      ref={frame}
      className={styles.wallFrame}
      onFocus={event => {
        const id = (event.target as HTMLElement).dataset.cardLink;
        if (id) setFocused(id);
      }}
    >
      <div ref={surface} className={[styles.wall, selection.size > 0 ? styles.selecting : ''].join(' ')} style={{ width: geometry.width, height: wall.height }}>
        {/* One keyed list: a card that leaves stays the same element (a thrown one stays thrown), only moved to the end. */}
        {[
          ...visible.map(item =>
            item.kind === 'section' ? (
              <h2 key={item.key} className={`${styles.section} t-section`} style={{ top: item.top }}>
                {item.title}
              </h2>
            ) : (
              card(item, false)
            ),
          ),
          ...leaving.map(item => card(item, true)),
        ]}
      </div>
    </div>
  );
}

export const Wall = memo(WallComponent);
