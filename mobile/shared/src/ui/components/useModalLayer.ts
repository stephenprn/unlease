/**
 * An overlay that is modal for TalkBack, as it is for the hand: while `open`, the view the returned
 * ref is given (the overlay's root, scrim and panel together; unflattened, `collapsable={false}`) is
 * all TalkBack reaches, with the slip. Everything beside it comes back once it closes; an overlay
 * opened over another holds TalkBack in turn and gives it back to the one under it.
 */
import { useEffect, useRef } from 'react';
import type { View } from 'react-native';

import { holdAccessibility, releaseAccessibility } from '../../platform/overlays';

let layers = 0;

export function useModalLayer(open: boolean): React.RefObject<React.ComponentRef<typeof View> | null> {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!open) return;
    layers += 1;
    const key = `layer-${layers}`;
    holdAccessibility(ref.current, key);
    return () => releaseAccessibility(key);
  }, [open]);
  return ref;
}
