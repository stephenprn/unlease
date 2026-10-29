/** A choice's mark: 1 while chosen, 0 otherwise; it comes in on decelerate (250) and leaves on accelerate (150), at once under Reduce Motion. */
import { useEffect } from 'react';
import { useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { accelerate, decelerate, duration } from '../theme/motion';

export function useChosen(selected: boolean): SharedValue<number> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.value = reduced ? target : withTiming(target, selected ? { duration: duration.medium, easing: decelerate } : { duration: duration.short, easing: accelerate });
  }, [progress, reduced, selected]);
  return progress;
}
