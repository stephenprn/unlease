/**
 * Inputs that grow with their words (`specs/NativeTextFields.ts`): Android scrolls a new line into
 * view a frame before the field has grown, and the words jump. A held input keeps them still; a
 * missing module changes nothing.
 */
import { findNodeHandle, type TextInput } from 'react-native';

import NativeTextFields from '../../specs/NativeTextFields';

type Input = React.ComponentRef<typeof TextInput>;

/** Holds this input's words still as it grows, or lets it scroll them (a field at its cap). */
export function holdScroll(input: Input | null, hold: boolean): void {
  if (!input || !NativeTextFields) return;
  const tag = findNodeHandle(input);
  if (typeof tag === 'number') NativeTextFields.holdScroll(tag, hold);
}
