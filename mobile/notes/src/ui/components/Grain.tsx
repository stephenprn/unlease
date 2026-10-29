/**
 * The paper's tooth: the seeded speckle tile (tools/textures/build_grain.py) over a sheet, at the
 * theme's grain strength; or, over the ground, the web's film grain (every pixel moving a little,
 * its strength in the file), each of its pixels two device pixels as the widgets lay it, so the
 * ground reads the same on the phone, its widgets and the web. Two switches: the paper's grain
 * (Réglages > Apparence) and the ground's (Réglages > Fond, `theme.groundGrain`). Under Fabric,
 * Android's `resizeMode="repeat"` paints one tile and stops, so tiles are laid out explicitly. The
 * host clips it (`overflow: 'hidden'`).
 */
import React, { memo, useMemo, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { selectGrain, useSettingsStore } from '@app/store/settingsStore';

import { useTheme } from '../theme/ThemeProvider';

const PAPER: ImageSourcePropType = require('../../../assets/textures/grain.png');
const GROUND: ImageSourcePropType = require('../../../assets/textures/ground-grain.png');

/** A sheet's tile, near the source's own 256 px, so a speck stays a tooth instead of a blotch. */
const PAPER_TILE = 200;
/** The ground's tile: 512 px, its pixels already doubled, laid one to one on the screen's pixels. */
const GROUND_TILE_PX = 512;

export interface GrainProps {
  readonly width?: number;
  readonly height?: number;
  /** A sheet's speckle at this opacity (the theme's by default); ignored on the ground, whose strength is in its file. */
  readonly strength?: number;
  /** The ground's film grain instead of a sheet's speckle. */
  readonly ground?: boolean;
  /** Drawn or not whatever the switches say: a preview of another choice. */
  readonly on?: boolean;
}

function GrainComponent({ width, height, strength, ground = false, on: forced }: GrainProps) {
  const theme = useTheme();
  const paper = useSettingsStore(selectGrain);
  const on = forced ?? (ground ? theme.groundGrain : paper);
  const tile = ground ? GROUND_TILE_PX / PixelRatio.get() : PAPER_TILE;
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const w = width ?? measured.width;
  const h = height ?? measured.height;
  const columns = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  const tiles = useMemo(() => {
    const source = ground ? GROUND : PAPER;
    const out: React.ReactElement[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        out.push(<Image key={`${row}:${column}`} source={source} fadeDuration={0} style={[styles.tile, { left: column * tile, top: row * tile, width: tile, height: tile }]} />);
      }
    }
    return out;
  }, [rows, columns, tile, ground]);
  // Réglages can turn either grain off: sheets, or the ground, then lie flat.
  if (!on) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity: ground ? 1 : (strength ?? theme.grain) }]}
      onLayout={
        width === undefined
          ? event => {
              const next = event.nativeEvent.layout;
              // Only the tile count matters: ignore resizes inside one tile.
              setMeasured(current =>
                Math.ceil(next.width / tile) === Math.ceil(current.width / tile) && Math.ceil(next.height / tile) === Math.ceil(current.height / tile)
                  ? current
                  : { width: next.width, height: next.height },
              );
            }
          : undefined
      }
    >
      {tiles}
    </View>
  );
}

export const Grain = memo(GrainComponent);

const styles = StyleSheet.create({
  tile: { position: 'absolute' },
});
