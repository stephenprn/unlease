/** A setting that is on or off: the whole row is the switch (its words its label), the switch drawn at its end. */
import React, { memo } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

import { ListRow, SwitchMark } from '../../components';

export interface SwitchRowProps {
  readonly title: string;
  readonly supporting?: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
  /** Its glyph, as every row of Réglages and the Administration has one (DESIGN's Settings panels). */
  readonly icon?: GlyphName;
  /** What leads the row instead of a glyph (an app's mark). */
  readonly leading?: React.ReactNode;
}

function SwitchRowComponent({ title, supporting, value, onChange, disabled, icon, leading }: SwitchRowProps) {
  return (
    <ListRow
      icon={icon}
      leading={leading}
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
