/**
 * Selecting blocks with a box, as Notion does: a press on the page's empty space (around the page,
 * between blocks, under the last one) dragged a few pixels draws a box, and every block it touches
 * is selected whole, with the blocks it holds. A block holding others is touched by its own lines,
 * above them, so a box over a toggle's items selects the items alone. The window scrolls at its
 * edges; Échap drops the selection. A press that does not move stays a click.
 */
import { edgeScrollSpeed } from './dragDrop';
import { clearBlockSelection, flushAll, selectBlocks } from './editorStore';
import styles from './pages.module.css';

/** Where a press is not on empty space: text, a field, a control, a picture or a frame, a table. */
const NOT_EMPTY = 'a, button, input, textarea, select, label, summary, img, video, audio, iframe, table, [role], [contenteditable]:not([contenteditable="false"])';

const START_DISTANCE = 4;

/** A block the box can touch: its own lines, in the document's coordinates. */
interface Target {
  readonly id: string;
  readonly top: number;
  /** Where the blocks it holds start, or its bottom. */
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** The nearest block holding it, as an index in the list (-1: none). */
  readonly holder: number;
}

/** The page's selectable blocks, in reading order (holders before what they hold). */
function measure(editor: HTMLElement): Target[] {
  const elements = [...editor.querySelectorAll<HTMLElement>('[data-select-block]')];
  const index = new Map(elements.map((element, at) => [element, at]));
  return elements.map(element => {
    const rect = element.getBoundingClientRect();
    const held = element.querySelector('[data-select-block]')?.getBoundingClientRect().top;
    const holder = element.parentElement?.closest<HTMLElement>('[data-select-block]');
    return {
      id: element.dataset.selectBlock!,
      top: rect.top + scrollY,
      bottom: Math.max(rect.top, held ?? rect.bottom) + scrollY,
      left: rect.left + scrollX,
      right: rect.right + scrollX,
      holder: holder ? (index.get(holder) ?? -1) : -1,
    };
  });
}

/** A press on an element's own scrollbar (a wide table's), which scrolls it. */
function onScrollbar(event: PointerEvent, element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const scrolls = element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
  return scrolls && (event.offsetX > element.clientWidth || event.offsetY > element.clientHeight);
}

/** The click that ends a box (under the last block, it would write there) is not a click. */
function swallowClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, true), 0);
}

/** Follows a press on the page's empty space; the box begins once it has moved a few pixels. */
function pressToSelect(event: PointerEvent, editor: HTMLElement): void {
  const startX = event.clientX + scrollX;
  const startY = event.clientY + scrollY;
  let pointer = { x: event.clientX, y: event.clientY };
  let targets: Target[] | null = null;
  let box: HTMLElement | null = null;
  let shown = '';
  let frame = 0;

  // No words get selected from the empty space.
  const noText = (selecting: Event): void => selecting.preventDefault();

  const update = (): void => {
    if (!targets || !box) return;
    const x = pointer.x + scrollX;
    const y = pointer.y + scrollY;
    const left = Math.min(startX, x);
    const right = Math.max(startX, x);
    const top = Math.min(startY, y);
    const bottom = Math.max(startY, y);
    box.style.left = `${left - scrollX}px`;
    box.style.top = `${top - scrollY}px`;
    box.style.width = `${right - left}px`;
    box.style.height = `${bottom - top}px`;
    const hit: boolean[] = [];
    const ids: string[] = [];
    targets.forEach((target, at) => {
      const touched = target.top < bottom && top < target.bottom && target.left < right && left < target.right;
      hit[at] = touched || (target.holder >= 0 && hit[target.holder] === true);
      if (hit[at]) ids.push(target.id);
    });
    const key = ids.join(' ');
    if (key === shown) return;
    shown = key;
    // The end the box started from anchors Maj+arrows.
    if (ids.length > 0) selectBlocks(ids, y >= startY ? ids[0] : ids[ids.length - 1]);
    else clearBlockSelection();
  };

  const scroll = (): void => {
    const speed = edgeScrollSpeed(pointer.y);
    if (speed === 0) {
      frame = 0;
      return;
    }
    window.scrollBy(0, speed);
    frame = requestAnimationFrame(scroll);
  };

  const begin = (): void => {
    flushAll();
    window.getSelection()?.removeAllRanges();
    editor.dataset.selecting = '';
    targets = measure(editor);
    box = document.createElement('div');
    box.className = styles.marquee!;
    box.setAttribute('aria-hidden', 'true');
    document.body.append(box);
  };

  const move = (next: PointerEvent): void => {
    pointer = { x: next.clientX, y: next.clientY };
    if (!box) {
      if (Math.hypot(pointer.x + scrollX - startX, pointer.y + scrollY - startY) < START_DISTANCE) return;
      begin();
    }
    update();
    if (!frame) frame = requestAnimationFrame(scroll);
  };

  const finish = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('scroll', update);
    document.removeEventListener('selectstart', noText, true);
    if (frame) cancelAnimationFrame(frame);
    if (!box) return;
    box.remove();
    delete editor.dataset.selecting;
    swallowClick();
    // The selection's keys and clipboard answer on the page itself.
    if (shown) editor.focus({ preventScroll: true });
  };
  const key = (next: KeyboardEvent): void => {
    if (next.key !== 'Escape' || !box) return;
    next.preventDefault();
    next.stopPropagation();
    shown = '';
    clearBlockSelection();
    finish();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('keydown', key, true);
  window.addEventListener('scroll', update);
  document.addEventListener('selectstart', noText, true);
}

/**
 * Lets a page (`article`, holding its editor) be selected with a box from presses on it or on the
 * space around it (its `main`); a finger scrolls instead. Returns what stops it.
 */
export function selectWithBox(article: HTMLElement): () => void {
  const scope = article.closest('main') ?? article;
  const press = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary || event.pointerType === 'touch' || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    // On the page or what holds it, not beside it (a phone-sized window's top bar).
    if (!(target instanceof Element) || !(target.contains(article) || article.contains(target))) return;
    if (target.closest(NOT_EMPTY) || onScrollbar(event, target)) return;
    const editor = article.querySelector<HTMLElement>('[data-page-editor]');
    if (!editor) return;
    clearBlockSelection();
    pressToSelect(event, editor);
  };
  scope.addEventListener('pointerdown', press);
  return () => scope.removeEventListener('pointerdown', press);
}
