/**
 * The keyboard, from the same events `KeyboardAvoidingView` lifts on (Android only emits the
 * `did` pair), but known from the first render: RN's KeyboardAvoidingView hears of the keyboard
 * only when it shows or hides, so one mounted under a keyboard already up never avoids it.
 */
import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';

/**
 * Where the keyboard's top edge is right now, or null. `Keyboard.dismiss()` blurs the field at
 * once but the keyboard is reported gone only once it has left: with no field focused, it is on
 * its way down, and a sheet opened right after must not rise to meet it.
 */
const currentTop = (): number | null =>
  Keyboard.isVisible() && TextInput.State?.currentlyFocusedInput() ? (Keyboard.metrics()?.screenY ?? null) : null;

const ios = Platform.OS === 'ios';

/** The keyboard's top edge in window coordinates, or null while it is down. */
export function useKeyboardTop(): number | null {
  const [top, setTop] = useState(currentTop);
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', event => setTop(event.endCoordinates.screenY)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setTop(null)),
    ];
    // What happened between the first render and these subscriptions.
    setTop(currentTop());
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  return top;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => currentTop() !== null);
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false)),
    ];
    setVisible(currentTop() !== null);
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  return visible;
}

/** Lets an overlay's field that takes the caret as it opens (`TextField` with `autoFocus`) keep the keyboard. */
export const OverlayFocus = createContext<{ readonly claim: () => void } | null>(null);

/**
 * An overlay (a sheet, a menu, a dialog) opening while a field of the screen holds the keyboard:
 * the field steps aside and the keyboard goes down with it (a number's kind picked while typing it),
 * unless a field of the overlay's own takes the caret as it opens (it claims it through
 * `OverlayFocus`) or the overlay keeps the keyboard on purpose (`keep`). Gives the overlay the
 * context to provide, and whether the keyboard is on its way down because of it (the overlay then
 * no longer rises to meet it).
 */
export function useOverlayKeyboard(visible: boolean, keep = false): { readonly focus: { readonly claim: () => void }; readonly aside: boolean } {
  const claimed = useRef(false);
  const opened = useRef(false);
  // Each opening starts unclaimed; its fields render after it and claim it in the same pass.
  if (visible && !opened.current) claimed.current = false;
  opened.current = visible;
  const focus = useMemo(
    () => ({
      claim: () => {
        claimed.current = true;
      },
    }),
    [],
  );
  const [aside, setAside] = useState(false);
  useEffect(() => {
    if (!visible) {
      setAside(false);
      return undefined;
    }
    if (keep || claimed.current || !TextInput.State?.currentlyFocusedInput()) return undefined;
    Keyboard.dismiss();
    setAside(true);
    // A field of the overlay's focused later brings the keyboard back: the overlay meets it again.
    const subscription = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setAside(false));
    return () => subscription.remove();
  }, [visible, keep]);
  return { focus, aside };
}
