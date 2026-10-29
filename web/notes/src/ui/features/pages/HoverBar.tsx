/**
 * What the pointer rests on in a block's text. A mention: open it, or show it as a bookmark or
 * embedded (it leaves the text for a block of its own, in place of the paragraph it was alone in).
 * A link: open it, change its address, or take it off the words.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { BlockTarget } from '@unlease/notes/models/blocks';
import { deleteRich, richToPlain, setValue } from '@unlease/core/services/richText';

import { placeBlock } from '../../../app/store/pages';
import { Icon } from '../../components/Icon';
import { editorRoot, richHandle } from './editorStore';
import { Floating } from './Floating';
import { openFormat } from './formatState';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';
import { offsetAt, safeHref } from './richDom';
import { openTarget } from './TargetBlock';

interface Hovered {
  readonly element: HTMLElement;
  readonly block: string;
  readonly rect: DOMRect;
  /** A mention's subject, or null for a link. */
  readonly target: BlockTarget | null;
}

const SHOW_MS = 350;
const HIDE_MS = 250;

/** Where an element of a block's text starts and ends, as offsets. */
function spanOf(root: HTMLElement, element: HTMLElement): { readonly start: number; readonly end: number } {
  const parent = element.parentNode!;
  const index = [...parent.childNodes].indexOf(element);
  const start = offsetAt(root, parent, index);
  return { start, end: offsetAt(root, parent, index + 1) };
}

export function HoverBar() {
  const { page, readOnly } = usePageContext();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const timers = useRef<{ show: ReturnType<typeof setTimeout> | null; hide: ReturnType<typeof setTimeout> | null }>({ show: null, hide: null });

  useEffect(() => {
    const root = editorRoot();
    if (!root || readOnly) return;
    const clear = (which: 'show' | 'hide'): void => {
      const timer = timers.current[which];
      if (timer) clearTimeout(timer);
      timers.current[which] = null;
    };
    const onOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      const element = (event.target as Element | null)?.closest<HTMLElement>('[data-mention], a[data-href]');
      const rich = element?.closest<HTMLElement>('[data-rich-block]');
      if (!element || !rich) return;
      clear('hide');
      clear('show');
      timers.current.show = setTimeout(() => {
        const [type, id] = element.dataset.mention?.split(':') ?? [];
        const target: BlockTarget | null = (type === 'note' || type === 'link' || type === 'page') && id ? { type, id } : null;
        setHovered({ element, block: rich.dataset.richBlock!, rect: element.getBoundingClientRect(), target });
      }, SHOW_MS);
    };
    const onOut = (event: PointerEvent): void => {
      const element = (event.target as Element | null)?.closest('[data-mention], a[data-href]');
      if (!element) return;
      clear('show');
      timers.current.hide = setTimeout(() => setHovered(null), HIDE_MS);
    };
    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    return () => {
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      clear('show');
      clear('hide');
    };
  }, [readOnly, page]);

  if (!hovered) return null;
  const keep = (): void => {
    const timer = timers.current.hide;
    if (timer) clearTimeout(timer);
    timers.current.hide = null;
  };
  const leave = (): void => {
    timers.current.hide = setTimeout(() => setHovered(null), HIDE_MS);
  };
  const handle = richHandle(hovered.block);

  /** The mention leaves the text for a block of its own. */
  const showAs = (kind: 'bookmark' | 'embed'): void => {
    if (!handle || !hovered.target || !hovered.element.isConnected) return;
    const { start } = spanOf(handle.element, hovered.element);
    const rest = deleteRich(handle.runs(), start, start + 1);
    const alone = richToPlain(rest).trim() === '';
    handle.write(alone ? [] : rest, null);
    placeBlock(page, hovered.block, { kind, target: hovered.target }, alone);
    setHovered(null);
  };

  const link = hovered.element.dataset.href;
  return (
    <div onPointerEnter={keep} onPointerLeave={leave}>
      <Floating anchor={hovered.rect} label={hovered.target ? t('Mention') : t('Lien')} className={styles.hoverBar} role="toolbar">
        {hovered.target ? (
          <>
            <button type="button" className={styles.hoverAction} onClick={event => openTarget(event, hovered.target!)}>
              <Icon name="external" size={16} />
              {t('Ouvrir')}
            </button>
            <button type="button" className={styles.hoverAction} onClick={() => showAs('bookmark')}>
              <Icon name="bookmark" size={16} />
              {t('Signet')}
            </button>
            {hovered.target.type !== 'page' ? (
              <button type="button" className={styles.hoverAction} onClick={() => showAs('embed')}>
                <Icon name="embed" size={16} />
                {t('Intégré')}
              </button>
            ) : null}
          </>
        ) : link ? (
          <>
            <a className={styles.hoverAddress} href={safeHref(link)} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
            <button
              type="button"
              className={styles.hoverAction}
              onClick={() => {
                if (!handle) return;
                const { start, end } = spanOf(handle.element, hovered.element);
                setHovered(null);
                openFormat({ block: hovered.block, start, end, link: true });
              }}
            >
              <Icon name="edit" size={16} />
              {t('Modifier')}
            </button>
            <button
              type="button"
              className={styles.hoverAction}
              onClick={() => {
                if (!handle) return;
                const { start, end } = spanOf(handle.element, hovered.element);
                handle.write(setValue(handle.runs(), start, end, 'a', null), null);
                setHovered(null);
              }}
            >
              <Icon name="unlink" size={16} />
              {t('Retirer')}
            </button>
          </>
        ) : null}
      </Floating>
    </div>
  );
}
