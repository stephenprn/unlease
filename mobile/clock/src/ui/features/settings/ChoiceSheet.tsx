/** One setting's choices in a sheet (a snooze's length, how long an alarm rings…): a row each, the current one ticked; a choice closes it. */
import React from 'react';

import { Icon, ListRow, Sheet, SheetScroll } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export interface ChoiceSheetProps<T extends string | number> {
  readonly visible: boolean;
  readonly title: string;
  readonly choices: readonly T[];
  readonly value: T;
  readonly words: (choice: T) => string;
  readonly onChoose: (choice: T) => void;
  readonly onDismiss: () => void;
}

export function ChoiceSheet<T extends string | number>({ visible, title, choices, value, words, onChoose, onDismiss }: ChoiceSheetProps<T>) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      <SheetScroll>
        {choices.map(choice => {
          const current = choice === value;
          return (
            <ListRow
              key={String(choice)}
              title={words(choice)}
              trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
              accessibilityRole="radio"
              accessibilityState={{ checked: current }}
              onPress={() => {
                onChoose(choice);
                onDismiss();
              }}
            />
          );
        })}
      </SheetScroll>
    </Sheet>
  );
}
