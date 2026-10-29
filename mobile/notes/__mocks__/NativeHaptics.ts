/**
 * The Haptics TurboModule under Jest: it records what was felt.
 */
export const felt: string[] = [];

const NativeHaptics = {
  perform(kind: string): void {
    felt.push(kind);
  },
};

export default NativeHaptics;
