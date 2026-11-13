/**
 * A dialog's frame, and the confirmation built on it. The frame keeps a dialog's head and its
 * actions in place and scrolls only what lies between them, so the scrollbar never runs past the
 * title or into the actions; the body fades and blurs under each once it runs on under it.
 * Confirmation is kept for what cannot be undone (empty the bin, delete for ever); everything
 * undoable is a snackbar instead.
 */
import { useId, type FormEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';

import { NARROW, useMedia } from '../useMedia';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Layer } from './Layer';
import styles from './layers.module.css';
import { useScrollEdges } from './scrollEdges';

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

export function DialogFrame({ title, titleId, onClose, foot, children, kind = 'form', className, onSubmit, page }: DialogFrameProps) {
  const sheet = useMedia(NARROW);
  // Under its head always; over its foot when it has actions (without, the body ends at the dialog's own edge).
  const edges = useScrollEdges({ top: true, bottom: !!foot });
  const parts = (
    <>
      <div className={styles.frameHead}>
        <h2 id={titleId} className={`${styles.frameTitle} t-title`}>
          {title}
        </h2>
        {onClose && (!sheet || page) ? <IconButton icon="close" label={t('Close')} onClick={onClose} /> : null}
      </div>
      <div ref={edges} className={styles.frameBody} data-scroll-sheet="">
        {children}
      </div>
      {foot ? (
        <div className={styles.frameFoot}>
          {foot}
        </div>
      ) : null}
    </>
  );
  const props = { className: [styles.frame, className ?? ''].join(' '), 'data-kind': kind, 'data-foot': foot ? '' : undefined };
  return onSubmit ? (
    // The checks are the form's own (`useForm`): never the browser's bubbles.
    <form {...props} onSubmit={onSubmit} noValidate>
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
  /** « Annuler » unless the choice reads better named (« Continuer à modifier »). */
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function Confirm({ open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: ConfirmProps) {
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
              {cancelLabel ?? t('Cancel')}
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
