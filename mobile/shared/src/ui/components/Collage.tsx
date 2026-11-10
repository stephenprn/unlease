/** An empty state's picture: cut-outs pinned around a note (`design/collage`), laid down piece by piece as it appears. */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { COLLAGE_LAY, COLLAGE_SIZE, collageEntrances, pieceBox, SCENES, type CollagePiece, type CollageScene } from '@unlease/design/collage';
import { emblemShape } from '@unlease/design/emblems';

import { decelerate } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

const LINE_WIDTHS = [0.62, 0.74, 0.5, 0.66];

function Piece({ piece, theme }: { piece: CollagePiece; theme: Theme }) {
  const c = theme.color;
  if (piece.kind === 'sheet') {
    const { x, y, width, height, rotate, lines, check } = piece;
    const indent = check ? 16 : 0;
    return (
      <G transform={`rotate(${rotate} ${x + width / 2} ${y + height / 2})`}>
        {/* Card on ground is a whisper of contrast: the ink edge is what makes the sheet read. */}
        <Rect x={x} y={y} width={width} height={height} rx={12} fill={c.paper} stroke={c.outline} strokeWidth={1.5} />
        {Array.from({ length: lines }, (_, i) => {
          const top = y + 18 + i * 16;
          return (
            <G key={i}>
              {check ? <Rect x={x + 12} y={top - 2} width={10} height={10} rx={2.5} fill="none" stroke={c.inkMuted} strokeWidth={2} /> : null}
              <Rect
                x={x + 12 + indent}
                y={top}
                width={LINE_WIDTHS[i % LINE_WIDTHS.length]! * (width - 24 - indent)}
                height={i === 0 ? 7 : 5}
                rx={3}
                fill={i === 0 ? c.ink : c.inkMuted}
              />
            </G>
          );
        })}
      </G>
    );
  }
  const { d, rule } = emblemShape(piece.emblem);
  const fill = piece.ink === 'leaf' ? c.leaf : theme.line[piece.ink].fill;
  const half = piece.size / 2;
  return (
    <G transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate} ${half} ${half}) scale(${piece.size / 100})`}>
      <Path d={d} fill={fill} fillRule={rule} />
    </G>
  );
}

/** A square around a piece wide enough for any turn of it, so it turns about its own centre without being cut. */
function layerBox(piece: CollagePiece): { readonly x: number; readonly y: number; readonly side: number } {
  const box = pieceBox(piece);
  const side = Math.max(box.width, box.height) * 1.5;
  return { x: box.x + box.width / 2 - side / 2, y: box.y + box.height / 2 - side / 2, side };
}

/**
 * Each piece on its own layer, laid down after the one under it (`collageEntrances`): it drifts in
 * from just outside its place and turns into it. Reduce Motion shows it still.
 */
function CollageComponent({ scene, width = 240 }: { scene: CollageScene; width?: number }) {
  const theme = useTheme();
  const scale = width / COLLAGE_SIZE.width;
  const layers = useMemo(() => {
    const entrances = collageEntrances(scene);
    return SCENES[scene].map((piece, index) => {
      const { dx, dy, turn, scale: from, delay } = entrances[index]!;
      const lay = new Keyframe({
        0: { opacity: 0, transform: [{ translateX: dx * scale }, { translateY: dy * scale }, { rotate: `${turn}deg` }, { scale: from }] },
        100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }], easing: decelerate },
      })
        .duration(COLLAGE_LAY)
        .delay(delay);
      return { piece, box: layerBox(piece), lay };
    });
  }, [scene, scale]);
  return (
    <View style={{ width, height: COLLAGE_SIZE.height * scale }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {layers.map(({ piece, box, lay }, index) => (
        <Animated.View key={`${scene}:${index}`} entering={lay} style={[styles.layer, { left: box.x * scale, top: box.y * scale, width: box.side * scale, height: box.side * scale }]}>
          <Svg width={box.side * scale} height={box.side * scale} viewBox={`${box.x} ${box.y} ${box.side} ${box.side}`}>
            <Piece piece={piece} theme={theme} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
});

export const Collage = memo(CollageComponent);
