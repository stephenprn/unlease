/**
 * Changes not saved are never lost by a slip, as on the web (`useUnsaved` there). While a form holds
 * some, leaving its screen (Back, the gesture, the top bar's ×, anything that takes it off the stack)
 * or closing the sheet that holds it (a drag, the scrim, Back) asks first: « Abandonner les
 * modifications ? ». Once saved (`saved()`), what follows asks nothing.
 *
 *   const unsaved = useUnsaved(dirty, { screen: true });
 *   …after the save: unsaved.saved(); navigation.goBack()
 *   <Sheet onDismiss={unsaved.guard(close)}>…</Sheet>
 *   {unsaved.dialog}  (last, at the screen's root, so it covers it)
 */
import { NavigationContext } from '@react-navigation/native';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { t } from '@unlease/core/i18n';

import { Dialog } from './Dialog';

export interface Unsaved {
  /** A close that asks first while there are changes. */
  guard(close: () => void): () => void;
  /** The save went through: nothing asks until the next change. */
  saved(): void;
  /** The question, rendered last at the screen's root. */
  readonly dialog: React.ReactNode;
}

export interface UnsavedOptions {
  /** The form is its screen: leaving it asks. */
  readonly screen?: boolean;
}

export function useUnsaved(dirty: boolean, { screen = false }: UnsavedOptions = {}): Unsaved {
  // A sheet may live outside any navigator (an app's root): only a screen's form needs one.
  const navigation = useContext(NavigationContext);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [savedAs, setSavedAs] = useState<boolean | null>(null);
  if (savedAs !== null && !dirty) setSavedAs(null);
  const holding = dirty && savedAs === null;
  // Saved or abandoned in this same moment: the leaving that follows passes before the guard lifts.
  const released = useRef(false);
  useEffect(() => {
    if (holding) released.current = false;
  }, [holding]);

  // Anything that takes the screen off the stack (Back, the gesture, the top bar, a parent's action) asks first.
  useEffect(() => {
    if (!screen || !holding || !navigation) return undefined;
    return navigation.addListener('beforeRemove', event => {
      if (released.current) return;
      event.preventDefault();
      Keyboard.dismiss();
      setPending(() => () => navigation.dispatch(event.data.action));
    });
  }, [screen, holding, navigation]);

  const release = useCallback(() => {
    released.current = true;
    setSavedAs(true);
  }, []);

  const guard = useCallback(
    (close: () => void) => () => {
      if (!holding || released.current) {
        close();
        return;
      }
      Keyboard.dismiss();
      setPending(() => close);
    },
    [holding],
  );

  const dialog = (
    <Dialog
      visible={pending !== null}
      title={t('Abandonner les modifications ?')}
      message={t('Ce que vous avez saisi ici ne sera pas enregistré.')}
      confirmLabel={t('Abandonner')}
      cancelLabel={t('Continuer à modifier')}
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
