/**
 * A dialog's frame, and the confirmation built on it. The frame keeps a dialog's head and its
 * actions in place and scrolls only what lies between them, so the scrollbar never runs past the
 * title or into the actions; a hairline parts each from the body once the body runs under it.
 * Confirmation is kept for what cannot be undone (empty the bin, delete for ever); everything
 * undoable is a snackbar instead.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';

import { NARROW, useMedia } from '../useMedia';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Layer } from './Layer';
import styles from './layers.module.css';

export interface DialogFrameProps {
  /** The title, set in the head; `titleId` names the dialog. */
  readonly title: ReactNode;
  readonly titleId?: string;
  /** The head's ×; on a phone-sized window the dialog is the phone's sheet, closed by its handle, the scrim and Back: no ×. */
  readonly onClose?: () => void;
  /** The actions, kept at the foot. */
  readonly foot?: ReactNode;
  readonly children: ReactNode;
  /** `form`: fields 24 in from the edges; `list`: rows inset 6, as the phone's list sheets. */
  readonly kind?: 'form' | 'list';
  /** The frame's own class: its width (`--frame-width`) and its body's gap (`--frame-gap`). */
  readonly className?: string;
  /** A form frame: the foot's submit button submits it. */
  readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** In a layer that is a whole page on a phone (`full`): no handle there, so the × stays. */
  readonly page?: boolean;
}

/** Whether the body scrolls at all, and whether it has left its top: each draws its hairline. */
function useScrollEdges(): { readonly attach: (node: HTMLDivElement | null) => void; readonly overflow: boolean; readonly scrolled: boolean } {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const frame = useRef(0);
  useEffect(() => {
    if (!node) return;
    const measure = (): void => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setOverflow(node.scrollHeight > node.clientHeight + 1);
        setScrolled(node.scrollTop > 0);
      });
    };
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    // What the body holds grows too (a field typed into, a list that arrives).
    for (const child of node.children) observer?.observe(child);
    return () => {
      cancelAnimationFrame(frame.current);
      node.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [node]);
  const attach = useCallback((element: HTMLDivElement | null) => setNode(element), []);
  return { attach, overflow, scrolled };
}

export function DialogFrame({ title, titleId, onClose, foot, children, kind = 'form', className, onSubmit, page }: DialogFrameProps) {
  const sheet = useMedia(NARROW);
  const { attach, overflow, scrolled } = useScrollEdges();
  const parts = (
    <>
      <div className={styles.frameHead} data-edge={scrolled || undefined}>
        <h2 id={titleId} className={`${styles.frameTitle} t-title`}>
          {title}
        </h2>
        {onClose && (!sheet || page) ? <IconButton icon="close" label={t('Fermer')} onClick={onClose} /> : null}
      </div>
      <div ref={attach} className={styles.frameBody}>
        {children}
      </div>
      {foot ? (
        <div className={styles.frameFoot} data-edge={overflow || undefined}>
          {foot}
        </div>
      ) : null}
    </>
  );
  const props = { className: [styles.frame, className ?? ''].join(' '), 'data-kind': kind, 'data-foot': foot ? '' : undefined };
  return onSubmit ? (
    <form {...props} onSubmit={onSubmit}>
      {parts}
    </form>
  ) : (
    <div {...props}>{parts}</div>
  );
}

export interface ConfirmProps {
  readonly open: boolean;
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function Confirm({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  const id = useId();
  return (
    <Layer open={open} onDismiss={onCancel} role="alertdialog" labelledBy={`${id}-title`}>
      <DialogFrame
        title={title}
        titleId={`${id}-title`}
        className={styles.dialog}
        foot={
          <>
            <Button kind="text" onClick={onCancel}>
              {t('Annuler')}
            </Button>
            <Button kind={danger ? 'danger' : 'filled'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {message ? <p className={`${styles.dialogMessage} t-body`}>{message}</p> : null}
      </DialogFrame>
    </Layer>
  );
}
