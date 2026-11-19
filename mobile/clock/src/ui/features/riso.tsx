/**
 * The ink tooth Clock's illustrations wear (`riso-grain.png`, `tools/textures/build_grain.py`): laid as
 * a pattern over a shape's gradient, it gives a grainy, printed look, the paper showing through the ink.
 */
import React from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Image, Pattern } from 'react-native-svg';

const RISO: ImageSourcePropType = require('../../../../shared/assets/textures/riso-grain.png');
/** The tile, in points: a speck a little coarser than a pixel, as a print's. */
const TOOTH = 112;

/** The ink tooth as a fill (`fill="url(#id)"`), for one picture's own definitions. */
export function Tooth({ id }: { readonly id: string }) {
  return (
    <Pattern id={id} patternUnits="userSpaceOnUse" width={TOOTH} height={TOOTH}>
      <Image href={RISO} width={TOOTH} height={TOOTH} />
    </Pattern>
  );
}
