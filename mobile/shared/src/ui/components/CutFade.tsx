/**
 * A box whose content is cut at its foot and goes on (a card's text, a drawing taller than its card):
 * its last `EDGE_FADE` dissolves into what it lies on, on the eased curve of the scrollers' ends, so
 * it says there is more (DESIGN's Scroll Edges). Off (`cut` false), it is a plain View. Android draws
 * it through a mask (`CutFadeView`), so the paper, wash and grain under it stay whole.
 */
import React from 'react';
import { View, type ViewProps } from 'react-native';

import { CutFadeNativeView } from '@shared/platform/cutFade';

import { EDGE_FADE } from './ScrollEdges';

export interface CutFadeProps extends ViewProps {
  /** What it holds goes on past its foot. */
  readonly cut: boolean;
}

export function CutFade({ cut, ...rest }: CutFadeProps) {
  if (!cut) return <View {...rest} />;
  return <CutFadeNativeView collapsable={false} length={EDGE_FADE} {...rest} />;
}
