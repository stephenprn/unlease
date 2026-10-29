/**
 * The keyboard, from the same events `KeyboardAvoidingView` lifts on (Android only emits the
 * `did` pair), but known from the first render: RN's KeyboardAvoidingView hears of the keyboard
 * only when it shows or hides, so one mounted under a keyboard already up never avoids it.
 */
import { useEffect, useState } from 'react';
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
