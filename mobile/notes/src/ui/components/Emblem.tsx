/** A collection's cut-out: its emblem in its gouache, flat on the paper. */
import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { emblemShape, type CollectionEmblem } from '@unlease/design/emblems';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { LineColor } from '@unlease/design/colors';

import { useTheme } from '../theme/ThemeProvider';
import { Organic } from './Organic';

export interface EmblemProps {
  readonly emblem: CollectionEmblem;
  readonly color: LineColor | null;
  readonly size?: number;
  /** On the slip, dark in both themes: the pigment's night lift. */
  readonly onSlip?: boolean;
}

function EmblemComponent({ emblem, color, size = 28, onSlip }: EmblemProps) {
  const theme = useTheme();
  const { d, rule } = emblemShape(emblem);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} fill={(onSlip ? theme.slipLine : theme.line)[color ?? 'grey'].fill} fillRule={rule} />
    </Svg>
  );
}

export const Emblem = memo(EmblemComponent);

export interface EmblemStoneProps extends EmblemProps {
  /** Whose stone: the collection's id, so it is the same stone wherever the collection shows. */
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** The emblem turned on its stone, in degrees, as the mark's card lies turned on its pebble. */
  readonly tilt?: number;
}

/**
 * A collection's emblem lying on its stone: the brand's pebble in the collection's wash, turned
 * the collection's own way, as the mark's card lies on its pebble. Identity, never decoration.
 */
function EmblemStoneComponent({ id, emblem, color, size = 22, width, height, tilt = 0 }: EmblemStoneProps) {
  const theme = useTheme();
  return (
    <Organic pebble={pebbleTurnOf(id)} style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.line[color ?? 'grey'].tint }}>
      <View style={tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null}>
        <Emblem emblem={emblem} color={color} size={size} />
      </View>
    </Organic>
  );
}

export const EmblemStone = memo(EmblemStoneComponent);
