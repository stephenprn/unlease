/**
 * A block held down opens its actions (`HoldForActions`); TalkBack holds nothing, so the block's
 * presses carry the same actions as a named action (« Actions du bloc ») from the actions menu.
 * A block without a press of its own (a picture still on its way) makes its words one stop that
 * carries it.
 */
import { createContext, useContext, useMemo } from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';

import { t } from '@unlease/core/i18n';

/** Opens the actions of the block it is drawn in, or null where nothing can change (the bin). */
export const BlockHoldContext = createContext<(() => void) | null>(null);

const ACTION = 'blockActions';

interface HoldProps {
  readonly accessibilityActions?: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

/** Spread on a block's press (or its words' stop): the block's actions for TalkBack. */
export function useBlockHold(): HoldProps {
  const open = useContext(BlockHoldContext);
  return useMemo<HoldProps>(
    () =>
      open
        ? {
            accessibilityActions: [{ name: ACTION, label: t('Block actions') }],
            onAccessibilityAction: (event: AccessibilityActionEvent) => {
              if (event.nativeEvent.actionName === ACTION) open();
            },
          }
        : {},
    [open],
  );
}
