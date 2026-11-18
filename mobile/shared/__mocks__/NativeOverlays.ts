/**
 * The Overlays TurboModule under Jest: it records which layers hold TalkBack, oldest first.
 */
export const held: { tag: number; key: string }[] = [];

const NativeOverlays = {
  hideOthers(tag: number, key: string): void {
    held.push({ tag, key });
  },
  release(key: string): void {
    const at = held.findIndex(layer => layer.key === key);
    if (at >= 0) held.splice(at, 1);
  },
};

export default NativeOverlays;
