/**
 * A note's lines in the phone's field, read as Android lays them out: each nested text is a piece
 * with its own line height (inherited from the text around it when it sets none), and a piece with
 * a line height that reaches over a line break must start its line, or typing at the next line's
 * start (which joins that piece) makes the field lay the line above out wrong (`LineRuns`).
 */
import React, { createRef } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';

import { linesText, noteLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { lightTheme } from '@shared/ui/theme/theme';
import { NoteRuns, noteFieldStyle } from '../noteText';
import { RichBody } from '../RichBody';
import type { NoteBodyEditor } from '../useNoteBody';

interface Piece {
  readonly text: string;
  readonly start: number;
  /** Its own, else the one it inherits; undefined: none (the font's own). */
  readonly lineHeight: number | undefined;
}

/** The pieces of a field's text, in order, each with the line height it is laid out with. */
function piecesOf(json: ReactTestRendererJSON): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  const walk = (node: ReactTestRendererJSON | string, inherited: number | undefined): void => {
    if (typeof node === 'string') {
      out.push({ text: node, start: at, lineHeight: inherited });
      at += node.length;
      return;
    }
    const own = (StyleSheet.flatten(node.props.style as TextStyle) ?? {}).lineHeight;
    const lineHeight = own !== undefined ? own : inherited;
    for (const child of node.children ?? []) walk(child, lineHeight);
  };
  walk(json, undefined);
  return out;
}

function field(lines: readonly NoteLine[]): Piece[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <TextInput style={noteFieldStyle(lightTheme)} multiline>
        <NoteRuns lines={lines} place="editor" />
      </TextInput>,
    );
  });
  return piecesOf(tree.toJSON() as ReactTestRendererJSON);
}

const startsLine = (text: string, at: number): boolean => at === 0 || text[at - 1] === '\n';

const BODIES = [
  // Plain lines, a line broken at the end and nothing typed yet.
  'Courses\npain\n',
  'Courses\npain\nla',
  // Headings, marks, empty lines, a heading after plain words and after marks.
  '# Titre\n{b:gras} et la suite\n\nfin\n## Sous-titre\n',
  'avant\n# \n{i:penché}\n### Trois\n',
  // A mention ends a line.
  'Voir {@contact=0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b}\npuis\n',
];

describe('a note’s lines in the phone’s field', () => {
  it('gives the field no line height of its own', () => {
    expect(noteFieldStyle(lightTheme).lineHeight).toBeUndefined();
  });

  it.each(BODIES)('never lets a line height start inside a line and reach over its break: %j', body => {
    const lines = noteLines(body, true);
    const pieces = field(lines);
    const text = pieces.map(piece => piece.text).join('');
    expect(text.split('\n')).toHaveLength(lines.length);
    for (const piece of pieces) {
      // Each piece holds at most its line's break, at its end.
      expect(piece.text.slice(0, -1)).not.toContain('\n');
      if (piece.text.endsWith('\n') && piece.lineHeight !== undefined) expect(startsLine(text, piece.start)).toBe(true);
    }
  });

  it.each(BODIES)('keeps every line on the 26 pitch: %j', body => {
    const pieces = field(noteLines(body, true));
    const text = pieces.map(piece => piece.text).join('');
    const rows = text.split('\n');
    let start = 0;
    rows.forEach((row, index) => {
      const end = start + row.length + 1;
      // An empty last line has no text of its own: below, the one after plain words.
      if (row.length > 0 || index < rows.length - 1) {
        const heights = pieces.filter(piece => piece.start < end && piece.start + piece.text.length > start).map(piece => piece.lineHeight);
        expect(heights).toContain(26);
      }
      start = end;
    });
  });

  it('gives an empty last line after plain words its height before anything is typed on it', () => {
    const pieces = field(noteLines('Courses\npain\n', false));
    expect(pieces.map(piece => [piece.text, piece.lineHeight])).toEqual([
      ['Courses\n', 26],
      ['pain\n', 26],
    ]);
  });

  it('draws the note’s words with the field the editor gives it', () => {
    const lines = noteLines('# Titre\nsuite', true);
    const editor = {
      lines,
      text: linesText(lines),
      names: 0,
      input: createRef(),
      takeSelection: () => null,
      onChangeText: () => {},
      onSelectionChange: () => {},
      onKeyPress: () => {},
      onFocus: () => {},
      onBlur: () => {},
    } as unknown as NoteBodyEditor;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<RichBody editor={editor} editable />);
    });
    const json = tree.toJSON() as ReactTestRendererJSON;
    expect((StyleSheet.flatten(json.props.style as TextStyle) ?? {}).lineHeight).toBeUndefined();
    expect(piecesOf(json).map(piece => piece.text).join('')).toBe('Titre\nsuite');
  });
});
