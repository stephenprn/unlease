/**
 * A collection's links as a mosaic (`LineLayout` `mosaic`): two columns, each piece at its
 * picture's height (`LinkTile`'s `mosaic`), the next one going to the shorter column, as the
 * board's notes go. A piece is laid by its measured height once known (kept while the app runs, so
 * a collection opened again stands as it stood), by a 4:5 picture's until then.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LinkTile } from './LinkTile';

/** The pieces' heights by link and width, measured. */
const measured = new Map<string, number>();
const keyOf = (id: string, width: number): string => `${id}|${Math.round(width)}`;

export interface LinkMosaicProps {
  readonly ids: readonly string[];
  /** The mosaic's whole width. */
  readonly width: number;
  readonly gap: number;
  readonly onOpen: (id: string) => void;
  readonly onLongPress?: (id: string) => void;
}

function LinkMosaicComponent({ ids, width, gap, onOpen, onLongPress }: LinkMosaicProps) {
  const column = (width - gap) / 2;
  const [, setSeen] = useState(0);
  const onHeight = useCallback(
    (id: string, height: number) => {
      const key = keyOf(id, column);
      if (Math.abs((measured.get(key) ?? -1) - height) < 0.5) return;
      if (measured.size > 4000) measured.clear();
      measured.set(key, height);
      setSeen(seen => seen + 1);
    },
    [column],
  );
  const heights = ids.map(id => measured.get(keyOf(id, column)) ?? column * 1.25);
  const key = heights.join(',');
  const columns = useMemo(() => {
    const out: [string[], string[]] = [[], []];
    const tall = [0, 0];
    ids.forEach((id, at) => {
      const side = tall[1]! < tall[0]! ? 1 : 0;
      out[side].push(id);
      tall[side]! += heights[at]! + gap;
    });
    return out;
    // `key` stands for the heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, key, gap]);

  return (
    <View style={[styles.mosaic, { gap }]}>
      {columns.map((list, side) => (
        <View key={side} style={[styles.column, { width: column, gap }]}>
          {list.map(id => (
            <LinkTile key={id} id={id} shape="mosaic" width={column} onOpen={onOpen} onLongPress={onLongPress} onHeight={onHeight} />
          ))}
        </View>
      ))}
    </View>
  );
}

export const LinkMosaic = memo(LinkMosaicComponent);

const styles = StyleSheet.create({
  mosaic: { flexDirection: 'row', alignItems: 'flex-start' },
  column: {},
});
