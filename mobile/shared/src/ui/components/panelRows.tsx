/**
 * Rows on a panel (a settings `Section`, an event's sheet of lines), `ROW_INSET` in from its sides, top
 * and foot: a row's corners are a tab's, but the first row's top corners and the last row's foot corners
 * follow the panel's own curve as it is drawn (concentric with it, `design/shapes`; a short panel's
 * corners are capped), so a press there never cuts a tighter corner inside the panel's. The web's
 * `--row-outer`.
 */
import React, { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useState, type ReactElement } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

import { OUTLINES, type OutlineKind } from '@unlease/design/outline';
import { concentric, CORNER_CAP, RADII } from '@unlease/design/shapes';

import { corners } from '../theme/shape';
import { Organic, type OrganicProps } from './Organic';
import { Tappable, type TappableProps } from './Tappable';

/** Where a row lies among its panel's rows. */
export type RowPlace = 'first' | 'middle' | 'last' | 'only';

/** How far rows lie inside their panel, from its sides as from its top and its foot. */
export const ROW_INSET = 6;

/** The radius a row `ROW_INSET` in from its panel's corner takes there; a `Section` measures its panel and hands it down. */
export const PanelRowCorner = createContext(concentric(RADII.panel, ROW_INSET));

/** That radius for a panel of this size: its corner as drawn (capped at `CORNER_CAP` of its shorter side), less the inset. */
export function panelRowCorner(width: number, height: number, radius: number = RADII.panel): number {
  return concentric(Math.min(radius, CORNER_CAP * Math.min(width, height)), ROW_INSET);
}

/** Where the row at `index` of `count` lies. */
export function placeOf(index: number, count: number): RowPlace {
  return count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';
}

/** A row's corners at its place: the panel's curve on the sides it shares with it, a tab's elsewhere (no place: a tab's all round). */
export function usePanelRowCorners(place: RowPlace | null | undefined): ViewStyle {
  const outer = useContext(PanelRowCorner);
  const top = place === 'first' || place === 'only' ? outer : RADII.row;
  const foot = place === 'last' || place === 'only' ? outer : RADII.row;
  return corners([top, top, foot, foot]);
}

/** Marks a row component that takes a `place`: a `Section` hands it its place when it is its first or last child. */
export function placedRow<T extends object>(component: T): T {
  (component as { placedRow?: boolean }).placedRow = true;
  return component;
}

/** Whether an element's type is a row that takes a place (`placedRow`). */
export function isPlacedRow(type: unknown): boolean {
  return (typeof type === 'function' || (typeof type === 'object' && type !== null)) && (type as { placedRow?: boolean }).placedRow === true;
}

/** A row of a panel drawn by its screen (an Administration section's, a setup task): a `Tappable` whose press takes its place's corners. */
export const PanelTappable = placedRow(function PlacedTappable({ place, style, ...rest }: TappableProps & { readonly place?: RowPlace | null }) {
  const shape = usePanelRowCorners(place);
  return <Tappable {...rest} style={[style, shape]} />;
});

/** Its first and last children, when they are rows taking a place (`placedRow`) and have none yet, told where they lie. */
function placeRows(children: React.ReactNode): React.ReactNode {
  const items = Children.toArray(children);
  return items.map((child, index) => {
    if ((index !== 0 && index !== items.length - 1) || !isValidElement(child) || !isPlacedRow(child.type)) return child;
    const row = child as ReactElement<{ place?: RowPlace | null }>;
    return row.props.place === undefined ? cloneElement(row, { place: placeOf(index, items.length) }) : row;
  });
}

/** The radius a kind's outline draws its corners at (its largest), before a short box caps it. */
const kindRadius = (kind: OutlineKind): number => Math.max(...OUTLINES[kind].map(value => (typeof value === 'number' ? value : 0)));

export interface RowPanelProps extends OrganicProps {
  readonly outline?: OutlineKind;
  /** Laid first, under the rows (the paper's grain): never one of them. */
  readonly backdrop?: React.ReactNode;
}

/**
 * A panel of rows (a settings `Section`, an event's lines): an `Organic` in its outline that measures
 * itself and hands its rows the corner they take where they meet it (`PanelRowCorner`), and tells its
 * first and last children, when they are rows taking a place (`placedRow`: `ListRow`, `PanelTappable`),
 * where they lie. Its rows lie `ROW_INSET` in from its every edge: its own padding and theirs make it.
 */
export function RowPanel({ outline = 'panel', backdrop, children, onLayout, ...rest }: RowPanelProps) {
  const radius = kindRadius(outline);
  const [corner, setCorner] = useState(() => panelRowCorner(Infinity, Infinity, radius));
  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setCorner(panelRowCorner(width, height, radius));
      onLayout?.(event);
    },
    [radius, onLayout],
  );
  return (
    <Organic outline={outline} onLayout={measure} {...rest}>
      {backdrop}
      <PanelRowCorner.Provider value={corner}>{placeRows(children)}</PanelRowCorner.Provider>
    </Organic>
  );
}
