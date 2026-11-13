/**
 * Changes not saved are never lost by a slip. While a form holds some, leaving its page (a link, the
 * navigation, Back, the tab closed or reloaded) or closing the dialog or sheet that holds it (Escape,
 * the scrim, a drag, Back) asks first: « Abandonner les modifications ? ». Once saved (`saved()`),
 * what follows (closing, going to the record) asks nothing.
 *
 *   const unsaved = useUnsaved(dirty, { page: '/agenda' });
 *   …after the save: unsaved.saved(); navigate(…)
 *   <Layer onDismiss={unsaved.guard(close)}>…</Layer>
 *   {unsaved.dialog}
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';

import { goBack, guardLeaving, useBackCloses } from '../router';
import { Confirm } from './Dialog';

export interface Unsaved {
  /** A close that asks first while there are changes. */
  guard(close: () => void): () => void;
  /** The save went through: nothing asks until the next change. */
  saved(): void;
  /** The question, rendered by the screen. */
  readonly dialog: ReactNode;
}

export interface UnsavedOptions {
  /** The form is its page: leaving it asks, and Back from it lands here when the history has nothing before it. */
  readonly page?: string;
}

export function useUnsaved(dirty: boolean, { page }: UnsavedOptions = {}): Unsaved {
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Saved: nothing asks until what it holds changes again.
  const [savedAs, setSavedAs] = useState<boolean | null>(null);
  if (savedAs !== null && !dirty) setSavedAs(null);
  const holding = dirty && savedAs === null;
  const remove = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    remove.current?.();
    remove.current = null;
    setSavedAs(true);
  }, []);

  // Another page of the app, or the tab itself.
  useEffect(() => {
    if (page === undefined || !holding) return;
    const stop = guardLeaving(leave => setPending(() => leave));
    remove.current = stop;
    const onUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // Older browsers ask only when this is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      stop();
      if (remove.current === stop) remove.current = null;
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [page, holding]);

  // The browser's Back: an entry held while there are changes, so Back asks rather than leaves.
  useBackCloses(page !== undefined && holding, () => setPending(() => () => goBack(page ?? '/')));

  const guard = useCallback(
    (close: () => void) => () => {
      if (holding) setPending(() => close);
      else close();
    },
    [holding],
  );

  const dialog = (
    <Confirm
      open={pending !== null}
      title={t('Discard changes?')}
      message={t('What you typed here will not be saved.')}
      confirmLabel={t('Discard')}
      cancelLabel={t('Keep editing')}
      danger
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const leave = pending;
        setPending(null);
        release();
        leave?.();
      }}
    />
  );

  return { guard, saved: release, dialog };
}
