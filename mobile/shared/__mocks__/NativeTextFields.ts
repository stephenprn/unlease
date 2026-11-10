/**
 * The TextFields TurboModule under Jest: it records which inputs were held.
 */
export const holds: { tag: number; hold: boolean }[] = [];

const NativeTextFields = {
  holdScroll(tag: number, hold: boolean): void {
    holds.push({ tag, hold });
  },
};

export default NativeTextFields;
