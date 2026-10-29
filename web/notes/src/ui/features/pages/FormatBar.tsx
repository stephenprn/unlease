/**
 * The formatting bar over words selected in a block: bold, italic, underline, strikethrough, code,
 * keyboard keys, a link, a colour or a highlight. It shows once the selection is made (not while the pointer still
 * drags it) and follows it; a press on it keeps the selection. While a link's address is typed, it
 * holds on to the words chosen. A selection dragged across blocks becomes a selection of blocks.
 */
import { useEffect, useMemo, useState } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t, tx } from '@unlease/core/i18n';
import { LINE_COLORS, LINE_COLOR_NAMES } from '@unlease/design/colors';
import { isAtom, rangeHas, rangeValue, setFlag, setValue, sliceRich, type FlagMark, type ValueMark } from '@unlease/core/services/richText';
import { extractUrls } from '@unlease/core/services/url';

import { Icon } from '../../components/Icon';
import { PebbleEdge } from '../../components/Outline';
import { editorRoot, richHandle, selectableOutline, selectBlocks } from './editorStore';
import { Floating } from './Floating';
import { closeFormat, openFormat, useFormatStore, type FormatTarget } from './formatState';
import { appTarget } from './pasting';
import styles from './pages.module.css';
import { selectionOffsets, setSelectionOffsets } from './richDom';

const FLAGS: readonly { readonly flag: FlagMark; readonly icon: GlyphName; readonly label: string; readonly keys: string | null }[] = [
  { flag: 'b', icon: 'bold', label: tx('Gras'), keys: 'Ctrl+B' },
  { flag: 'i', icon: 'italic', label: tx('Italique'), keys: 'Ctrl+I' },
  { flag: 'u', icon: 'underline', label: tx('Souligné'), keys: 'Ctrl+U' },
  { flag: 's', icon: 'strike', label: tx('Barré'), keys: tx('Ctrl+Maj+S') },
  { flag: 'c', icon: 'code', label: tx('Code'), keys: 'Ctrl+E' },
  // No shortcut: the free ones are the browsers' (Ctrl+Maj+K opens Firefox's console).
  { flag: 'k', icon: 'keyboard', label: tx('Touches'), keys: null },
];

const elementOf = (node: Node | null): Element | null => (node instanceof Element ? node : (node?.parentElement ?? null));

/** The block a node is in, if it is in the page being edited. */
function richOf(node: Node | null): HTMLElement | null {
  const rich = elementOf(node)?.closest<HTMLElement>('[data-rich-block]') ?? null;
  return rich && editorRoot()?.contains(rich) ? rich : null;
}

/** What the selection is now, for the bar: one block's words, or nothing. */
function readSelection(): FormatTarget | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const rich = richOf(selection.anchorNode);
  if (!rich || richOf(selection.focusNode) !== rich) return null;
  const offsets = selectionOffsets(rich);
  if (!offsets || offsets.start === offsets.end) return null;
  // A mention or a date chosen alone (a click selects it whole) has no words to format.
  const runs = richHandle(rich.dataset.richBlock!)?.runs();
  if (runs && sliceRich(runs, offsets.start, offsets.end).every(isAtom)) return null;
  return { block: rich.dataset.richBlock!, start: offsets.start, end: offsets.end, link: false };
}

/** A selection dragged from one block into another: the blocks between are selected whole instead. */
function selectAcross(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const from = elementOf(selection.anchorNode)?.closest<HTMLElement>('[data-select-block]');
  const to = elementOf(selection.focusNode)?.closest<HTMLElement>('[data-select-block]');
  const root = editorRoot();
  if (!from || !to || from === to || !root?.contains(from) || !root.contains(to) || from.contains(to) || to.contains(from)) return false;
  const outline = selectableOutline();
  const [a, b] = [outline.indexOf(from.dataset.selectBlock!), outline.indexOf(to.dataset.selectBlock!)].sort((x, y) => x - y) as [number, number];
  if (a < 0) return false;
  selection.removeAllRanges();
  selectBlocks(outline.slice(a, b + 1), from.dataset.selectBlock!);
  root.focus({ preventScroll: true });
  return true;
}

/** An address as typed: this app's own path kept as it is, anything else made openable. */
function linkAddress(typed: string): string | null {
  const value = typed.trim();
  if (!value) return null;
  if (appTarget(value) || /^(mailto:|tel:)/i.test(value)) return value;
  return extractUrls(value)[0] ?? null;
}

function Swatches({ kind, current, onPick }: { kind: 'fg' | 'bg'; current: string | null; onPick: (color: string | null) => void }) {
  return (
    <div className={styles.swatchRow} role="radiogroup" aria-label={kind === 'fg' ? t('Couleur du texte') : t('Surlignage')}>
      {[null, ...LINE_COLORS].map((color, index) => (
        <button
          key={color ?? 'none'}
          type="button"
          role="radio"
          aria-checked={color === current}
          aria-label={color ? LINE_COLOR_NAMES[color] : kind === 'fg' ? t('Couleur par défaut') : t('Sans surlignage')}
          data-tip={color ? LINE_COLOR_NAMES[color] : kind === 'fg' ? t('Par défaut') : t('Aucun')}
          className={styles.textSwatch}
          data-kind={kind}
          data-line={color ?? undefined}
          data-pebble-under={pebbleTurn(index)}
          data-still
          onClick={() => onPick(color)}
        >
          <PebbleEdge turn={pebbleTurn(index)} />
          {kind === 'fg' ? 'A' : ''}
        </button>
      ))}
    </div>
  );
}

function FormatPanel({ target }: { target: FormatTarget }) {
  const handle = richHandle(target.block);
  const runs = handle?.runs() ?? [];
  const [colors, setColors] = useState(false);
  const [address, setAddress] = useState(() => rangeValue(runs, target.start, target.end, 'a') ?? '');
  const anchor = useMemo(() => {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    return rect && rect.width + rect.height > 0 ? rect : (handle?.element.getBoundingClientRect() ?? new DOMRect());
    // Placed when the words chosen change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.block, target.start, target.end]);
  if (!handle) return null;

  const apply = (next: ReturnType<typeof setFlag>): void => handle.write(next, { start: target.start, end: target.end });
  const flag = (mark: FlagMark): void => apply(setFlag(runs, target.start, target.end, mark, !rangeHas(runs, target.start, target.end, mark)));
  const value = (mark: ValueMark, next: string | null): void => apply(setValue(runs, target.start, target.end, mark, next));
  const current = rangeValue(runs, target.start, target.end, 'a');

  if (target.link) {
    const done = (next: string | null | undefined): void => {
      if (next !== undefined) value('a', next);
      else {
        handle.element.focus({ preventScroll: true });
        setSelectionOffsets(handle.element, target.start, target.end);
      }
      closeFormat();
    };
    return (
      <Floating anchor={anchor} above label={t('Lien')} className={styles.formatBar} role="toolbar">
        <form
          className={styles.linkForm}
          onSubmit={event => {
            event.preventDefault();
            const next = linkAddress(address);
            if (next) done(next);
          }}
        >
          <Icon name="link" size={18} />
          <input
            className={styles.linkField}
            value={address}
            autoFocus
            placeholder={t('Collez ou tapez une adresse')}
            aria-label={t('Adresse du lien')}
            onChange={event => setAddress(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                done(undefined);
              }
            }}
          />
          {current ? (
            <button type="button" className={styles.formatButton} aria-label={t('Retirer le lien')} data-tip={t('Retirer le lien')} onClick={() => done(null)}>
              <Icon name="unlink" size={18} />
            </button>
          ) : null}
        </form>
      </Floating>
    );
  }

  return (
    <Floating anchor={anchor} above label={t('Mise en forme')} className={styles.formatBar} role="toolbar">
      <div className={styles.formatRow}>
        {FLAGS.map(({ flag: mark, icon, label, keys }) => (
          <button key={mark} type="button" className={styles.formatButton} aria-label={t(label)} aria-pressed={rangeHas(runs, target.start, target.end, mark)} data-tip={keys ? `${t(label)} (${t(keys)})` : t(label)} onClick={() => flag(mark)}>
            <Icon name={icon} size={18} />
          </button>
        ))}
        <span className={styles.formatDivider} aria-hidden="true" />
        <button type="button" className={styles.formatButton} aria-label={t('Lien')} aria-pressed={current !== null} data-tip={t('Lien (Ctrl+K)')} onClick={() => openFormat({ ...target, link: true })}>
          <Icon name="link" size={18} />
        </button>
        <button type="button" className={styles.formatButton} aria-label={t('Couleur')} aria-expanded={colors} data-tip={t('Couleur et surlignage')} onClick={() => setColors(open => !open)}>
          <Icon name="textColor" size={18} />
        </button>
      </div>
      {colors ? (
        <div className={styles.colorPanel}>
          <span className="t-meta-strong">{t('Couleur du texte')}</span>
          <Swatches kind="fg" current={rangeValue(runs, target.start, target.end, 'fg')} onPick={color => value('fg', color)} />
          <span className="t-meta-strong">{t('Surlignage')}</span>
          <Swatches kind="bg" current={rangeValue(runs, target.start, target.end, 'bg')} onPick={color => value('bg', color)} />
        </div>
      ) : null}
    </Floating>
  );
}

export function FormatBar() {
  const target = useFormatStore(s => s.target);

  useEffect(() => {
    let pressing = false;
    const follow = (): void => {
      if (pressing || useFormatStore.getState().target?.link) return;
      const next = readSelection();
      const shown = useFormatStore.getState().target;
      if (!next) closeFormat();
      else if (!shown || shown.block !== next.block || shown.start !== next.start || shown.end !== next.end) openFormat(next);
    };
    const onDown = (event: PointerEvent): void => {
      if ((event.target as Element | null)?.closest?.(`.${styles.formatBar}`)) return;
      pressing = true;
      // A link being typed goes too: its words may move once the text is pressed again.
      closeFormat();
    };
    const onUp = (): void => {
      if (!pressing) return;
      pressing = false;
      if (!selectAcross()) follow();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.shiftKey && !selectAcross()) follow();
    };
    document.addEventListener('selectionchange', follow);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('selectionchange', follow);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('keyup', onKeyUp, true);
      closeFormat();
    };
  }, []);

  if (!target) return null;
  return <FormatPanel key={`${target.block}:${target.start}:${target.end}:${target.link}`} target={target} />;
}
