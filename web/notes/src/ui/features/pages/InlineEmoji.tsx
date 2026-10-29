/**
 * An emoji put in a page's sentence from « / » « Emoji »: the page's emoji picker drops from the
 * caret, and the emoji picked goes in where « /emoji » was, as text; closed without one, the caret
 * goes back there.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { insertRich, richFromPlain } from '@unlease/core/services/richText';

import { overlayRoot } from '../../components/layers';
import { Popover } from '../../components/Popover';
import { useMedia } from '../../useMedia';
import { focusBlock, richHandle } from './editorStore';
import { EmojiPanel, FINE } from './EmojiPicker';
import styles from './inline.module.css';
import { caretRect } from './richDom';

interface EmojiTarget {
  readonly block: string;
  readonly offset: number;
  /** Where the caret was drawn: the picker drops from there. */
  readonly left: number;
  readonly top: number;
  readonly height: number;
}

const useInlineEmojiStore = create<{ readonly target: EmojiTarget | null }>(() => ({ target: null }));

/** Opens the picker at the caret of a block's text; the emoji picked goes in at `offset`. */
export function openInlineEmoji(block: string, offset: number): void {
  const handle = richHandle(block);
  if (!handle) return;
  const rect = caretRect() ?? handle.element.getBoundingClientRect();
  useInlineEmojiStore.setState({ target: { block, offset, left: rect.left, top: rect.top, height: rect.height } });
}

/** Closes the picker, the emoji picked (if any) put in; the caret goes after it once the page is given back. */
function finish(emoji: string | null): void {
  const target = useInlineEmojiStore.getState().target;
  if (!target) return;
  useInlineEmojiStore.setState({ target: null });
  const handle = richHandle(target.block);
  if (handle && emoji) handle.write(insertRich(handle.runs(), target.offset, richFromPlain(emoji)), null);
  requestAnimationFrame(() => focusBlock(target.block, target.offset + (emoji?.length ?? 0)));
}

/** The picker for the page on screen (drawn by the page, not in a page in the bin). */
export function InlineEmojiPicker() {
  const target = useInlineEmojiStore(s => s.target);
  // Where it dropped from, kept while it leaves.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const anchor = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const fine = useMedia(FINE);
  return (
    <>
      {/* The caret's place, for the picker to drop from as from a button. */}
      {shown ? createPortal(<span ref={anchor} className={styles.caretAnchor} style={{ left: shown.left, top: shown.top, height: shown.height }} aria-hidden="true" />, overlayRoot('live')) : null}
      <Popover open={target !== null} anchor={anchor} onDismiss={() => finish(null)} label={t('Insérer un emoji')} width={348} align="start" initialFocus={fine ? field : scroll}>
        <EmojiPanel value={null} allowNone={false} field={field} scroll={scroll} onPick={finish} />
      </Popover>
    </>
  );
}
