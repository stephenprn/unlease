/**
 * An address's little plan (`contacts/services/plan`), as the web draws it: a paper cut-out of a town
 * around a pin, drawn from the address alone, the same on every device; no map is fetched. The town
 * is the well, its streets the paper, the river and the park their washes, the pin a cut-out of the
 * Rouge pigment. It fills its frame, cropped to it.
 */
import React, { memo, useMemo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { addressPlan, PLAN_HEIGHT, PLAN_PIN, PLAN_PIN_HOLE, PLAN_WIDTH } from '@unlease/contacts/services/plan';

import { useTheme } from '@shared/ui/theme/ThemeProvider';

function AddressPlanComponent({ address }: { address: string }) {
  const theme = useTheme();
  const plan = useMemo(() => addressPlan(address), [address]);
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`} preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Rect width={PLAN_WIDTH} height={PLAN_HEIGHT} fill={theme.color.paperHigh} />
      {plan.park ? <Path d={plan.park} fill={theme.line.green.tint} stroke={theme.line.green.tint} strokeWidth={6} strokeLinejoin="round" /> : null}
      {plan.water ? <Path d={plan.water} fill="none" stroke={theme.line.sky.tint} strokeWidth={plan.waterWidth} strokeLinecap="round" /> : null}
      {plan.streets.map((street, index) => (
        <Path key={index} d={street.d} fill="none" stroke={theme.color.paper} strokeWidth={street.width} strokeLinecap="round" />
      ))}
      <Path d={PLAN_PIN} fill={theme.line.red.fill} />
      <Circle cx={PLAN_PIN_HOLE.x} cy={PLAN_PIN_HOLE.y} r={PLAN_PIN_HOLE.r} fill={theme.color.paper} />
    </Svg>
  );
}

export const AddressPlan = memo(AddressPlanComponent);
