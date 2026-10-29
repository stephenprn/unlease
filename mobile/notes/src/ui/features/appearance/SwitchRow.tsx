/** A setting that is on or off: the whole row is the switch (its words its label), the switch drawn at its end. */
import React, { memo } from 'react';

import { ListRow, SwitchMark } from '../../components';

export interface SwitchRowProps {
  readonly title: string;
  readonly supporting?: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
}

function SwitchRowComponent({ title, supporting, value, onChange, disabled }: SwitchRowProps) {
  return (
    <ListRow
      title={title}
      supporting={supporting}
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      trailing={<SwitchMark checked={value} />}
    />
  );
}

export const SwitchRow = memo(SwitchRowComponent);
