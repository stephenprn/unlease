/**
 * A formatted body drawn as written, to be read: bold, italic and underlined words as they are, the
 * words a search matched in peach inside them (`<mark>`, its underline in the text's own ink). A card
 * sets every line in one flow at its own size, a heading as a bold line (`CardLines`), so its line
 * clamp counts the lines `layoutCard` counted. A person mentioned reads as their name now (as
 * `layoutCard` measured it), in the second ink once gone.
 */
import { Fragment, type ReactNode } from 'react';

import { lineStarts, type NoteLine } from '@unlease/notes/services/noteBody';
import { mentionName } from '@unlease/notes/services/noteMentions';
import type { Ref } from '@unlease/core/refs';
import type { Run } from '@unlease/core/services/richText';

import { nameOfMention, useMentionedPeople } from '../../../app/mentions';

import styles from './noteLines.module.css';

/** Matches as offsets in the body's plain text (lines joined by a line break each). */
export type Ranges = readonly (readonly [number, number])[];

/** `text`, which starts at `from` in the whole, the ranges falling in it marked. */
function marked(text: string, from: number, ranges: Ranges): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    const a = Math.max(cursor, start - from);
    const b = Math.min(text.length, end - from);
    if (b <= a) continue;
    if (a > cursor) parts.push(text.slice(cursor, a));
    parts.push(<mark key={start}>{text.slice(a, b)}</mark>);
    cursor = b;
  }
  if (parts.length === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** A mention as its person's name now (re-drawn at a rename), the whole name marked when a search matched it. */
function MentionName({ target, matched }: { target: Ref; matched: boolean }) {
  useMentionedPeople();
  const name = nameOfMention(target);
  const shown = name ?? mentionName(target);
  return (
    <span className={styles.mention} data-gone={name === null || undefined}>
      {matched ? <mark>{shown}</mark> : shown}
    </span>
  );
}

/** A line's words in their marks; `from`: where the line starts in the text the ranges count in. */
export function LineRuns({ runs, from = 0, ranges = [] }: { runs: readonly Run[]; from?: number; ranges?: Ranges }) {
  const starts: number[] = [];
  let at = from;
  for (const run of runs) {
    starts.push(at);
    at += run.kind === 'text' ? run.text.length : 1;
  }
  return (
    <>
      {runs.map((run, index) => {
        if (run.kind === 'mention') {
          const at = starts[index]!;
          return <MentionName key={index} target={run.target} matched={ranges.some(([start, end]) => start <= at && end > at)} />;
        }
        // A date (Pages' alone) met all the same stands as its one character.
        const content = marked(run.kind === 'text' ? run.text : '￼', starts[index]!, ranges);
        const marks = run.kind === 'text' ? run.marks : {};
        const className = [marks.b ? styles.b : '', marks.i ? styles.i : '', marks.u ? styles.u : ''].filter(Boolean).join(' ');
        return className ? (
          <span key={index} className={className}>
            {content}
          </span>
        ) : (
          <Fragment key={index}>{content}</Fragment>
        );
      })}
    </>
  );
}

/** A card's body: every line in one flow at the card's own size (a heading is a bold line, never a bigger one). */
export function CardLines({ lines, ranges = [] }: { lines: readonly NoteLine[]; ranges?: Ranges }) {
  const starts = lineStarts(lines);
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? '\n' : null}
          {line.heading > 0 ? (
            <span className={styles.heading}>
              <LineRuns runs={line.runs} from={starts[index]} ranges={ranges} />
            </span>
          ) : (
            <LineRuns runs={line.runs} from={starts[index]} ranges={ranges} />
          )}
        </Fragment>
      ))}
    </>
  );
}
