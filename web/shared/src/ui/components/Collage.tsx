/** An empty state's picture: cut-outs pinned around a note (`design/collage`), drawn as the phone draws it, laid down piece by piece as it appears. */
import { memo, type CSSProperties } from 'react';

import { cardHeight, cardShapes, COLLAGE_LAY, COLLAGE_SIZE, collageEntrances, pieceBox, SCENES, type CollagePaint, type CollagePiece, type CollageScene, type PieceEntrance } from '@unlease/design/collage';
import { emblemShape } from '@unlease/design/emblems';

import styles from './collage.module.css';

const LINE_WIDTHS = [0.62, 0.74, 0.5, 0.66];

/** A card's paints, as the theme's custom properties (`data-line` gives the pigment's). */
const PAINT: Readonly<Record<CollagePaint, string>> = { paper: 'var(--paper)', outline: 'var(--outline)', ink: 'var(--ink)', inkMuted: 'var(--ink-muted)', fill: 'var(--fill)', tint: 'var(--tint)', on: 'var(--on)' };

function Piece({ piece }: { piece: CollagePiece }) {
  if (piece.kind === 'card') {
    const height = cardHeight(piece);
    return (
      <g transform={`rotate(${piece.rotate} ${piece.x + piece.width / 2} ${piece.y + height / 2})`} data-line={piece.ink}>
        {cardShapes(piece).map((shape, i) =>
          shape.kind === 'rect' ? (
            <rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} fill={shape.fill ? PAINT[shape.fill] : 'none'} stroke={shape.stroke ? PAINT[shape.stroke] : undefined} strokeWidth={shape.strokeWidth} />
          ) : (
            <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ? PAINT[shape.fill] : 'none'} stroke={shape.stroke ? PAINT[shape.stroke] : undefined} strokeWidth={shape.strokeWidth} />
          ),
        )}
      </g>
    );
  }
  if (piece.kind === 'sheet') {
    const { x, y, width, height, rotate, lines, check } = piece;
    const indent = check ? 16 : 0;
    return (
      <g transform={`rotate(${rotate} ${x + width / 2} ${y + height / 2})`}>
        <rect x={x} y={y} width={width} height={height} rx={12} fill="var(--paper)" stroke="var(--outline)" strokeWidth={1.5} />
        {Array.from({ length: lines }, (_, i) => {
          const top = y + 18 + i * 16;
          return (
            <g key={i}>
              {check ? <rect x={x + 12} y={top - 2} width={10} height={10} rx={2.5} fill="none" stroke="var(--ink-muted)" strokeWidth={2} /> : null}
              <rect x={x + 12 + indent} y={top} width={LINE_WIDTHS[i % LINE_WIDTHS.length]! * (width - 24 - indent)} height={i === 0 ? 7 : 5} rx={3} fill={i === 0 ? 'var(--ink)' : 'var(--ink-muted)'} />
            </g>
          );
        })}
      </g>
    );
  }
  const { d, rule } = emblemShape(piece.emblem);
  const fill = piece.ink === 'leaf' ? 'var(--leaf)' : `var(--line-${piece.ink})`;
  const half = piece.size / 2;
  return (
    <g transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate} ${half} ${half}) scale(${piece.size / 100})`}>
      <path d={d} fill={fill} fillRule={rule} />
    </g>
  );
}

/** Where a piece starts as it is laid, about its own centre. */
function layStyle(piece: CollagePiece, entrance: PieceEntrance): CSSProperties {
  const box = pieceBox(piece);
  return {
    transformOrigin: `${box.x + box.width / 2}px ${box.y + box.height / 2}px`,
    '--dx': `${entrance.dx}px`,
    '--dy': `${entrance.dy}px`,
    '--turn': `${entrance.turn}deg`,
    '--from': entrance.scale,
    '--delay': `${entrance.delay}ms`,
    '--lay': `${COLLAGE_LAY}ms`,
  } as CSSProperties;
}

function CollageComponent({ scene, width = 240 }: { scene: CollageScene; width?: number }) {
  const entrances = collageEntrances(scene);
  return (
    <svg width={width} height={(width * COLLAGE_SIZE.height) / COLLAGE_SIZE.width} viewBox={`0 0 ${COLLAGE_SIZE.width} ${COLLAGE_SIZE.height}`} aria-hidden="true" focusable="false">
      {SCENES[scene].map((piece, index) => (
        // Keyed by scene too: another empty view lays its own collage down afresh.
        <g key={`${scene}:${index}`} className={styles.piece} style={layStyle(piece, entrances[index]!)}>
          <Piece piece={piece} />
        </g>
      ))}
    </svg>
  );
}

export const Collage = memo(CollageComponent);
