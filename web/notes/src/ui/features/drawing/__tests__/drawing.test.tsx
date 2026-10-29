import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAWING_LIMITS, type Stroke } from '@unlease/notes/models/drawing';
import { parseDrawing, serializeStrokes } from '@unlease/notes/services/drawing';

import { createNote, updateNote } from '../../../../app/store/actions';
import { useLibraryStore } from '../../../../app/store/library';
import { undoPage } from '../../../../app/store/pageHistory';
import { createPage, insertBlock } from '../../../../app/store/pages';
import { useUiStore } from '../../../../app/store/ui';
import { freshLibrary } from '../../../../test/library';
import { PageContext } from '../../pages/PageContext';
import { DrawingBlock, openDrawingEditor } from '../DrawingBlock';
import { DrawingPreview } from '../DrawingPreview';
import { DrawingSheet } from '../DrawingSheet';
import { resetPen, usePen } from '../pen';
import { useDrawingSession } from '../useDrawingSession';

const drawingOf = (id: string): string => useLibraryStore.getState().notes[id]!.drawing;
const strokesIn = (id: string): Stroke[] => parseDrawing(drawingOf(id));

/** The sheet 500px wide at the window's corner: a pixel is two drawing units. */
function sheet(): SVGSVGElement {
  const svg = screen.getByRole('img', { name: 'Zone de dessin' }) as unknown as SVGSVGElement;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return svg;
}

function drag(svg: Element, points: readonly (readonly [number, number])[], { pointerId = 1, pointerType = 'mouse' } = {}): void {
  const [first, ...rest] = points;
  fireEvent.pointerDown(svg, { pointerId, pointerType, button: 0, clientX: first![0], clientY: first![1] });
  for (const [x, y] of rest) fireEvent.pointerMove(svg, { pointerId, pointerType, clientX: x, clientY: y });
  const last = points[points.length - 1]!;
  fireEvent.pointerUp(svg, { pointerId, pointerType, button: 0, clientX: last[0], clientY: last[1] });
}

const capture = { set: Element.prototype.setPointerCapture, release: Element.prototype.releasePointerCapture };

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterAll(() => {
  Element.prototype.setPointerCapture = capture.set;
  Element.prototype.releasePointerCapture = capture.release;
});

beforeEach(async () => {
  await freshLibrary();
  resetPen();
});

describe('a drawing note’s sheet', () => {
  it('keeps a line drawn with the pen in hand, in drawing units, and takes it back and again', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'drawing' });
    render(<DrawingSheet noteId={id} editable />);
    drag(sheet(), [
      [10, 10],
      [60, 30],
      [110, 10],
    ]);
    expect(strokesIn(id)).toEqual([expect.objectContaining({ tool: 'pen', size: 1, ink: 'ink', points: [20, 20, 120, 60, 220, 20] })]);

    await user.click(screen.getByRole('button', { name: 'Feutre' }));
    expect(screen.getByRole('button', { name: 'Feutre' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Épais' }));
    await user.click(screen.getByRole('radio', { name: 'Bleu' }));
    drag(sheet(), [
      [10, 200],
      [200, 200],
    ]);
    expect(strokesIn(id).map(stroke => [stroke.tool, stroke.size, stroke.ink])).toEqual([
      ['pen', 1, 'ink'],
      ['marker', 2, 'blue'],
    ]);

    // Ctrl+Z takes the last line back, Ctrl+Maj+Z draws it again.
    fireEvent.keyDown(sheet(), { key: 'z', ctrlKey: true });
    expect(strokesIn(id)).toHaveLength(1);
    fireEvent.keyDown(sheet(), { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(strokesIn(id)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(drawingOf(id)).toBe('');
    await user.click(screen.getByRole('button', { name: 'Rétablir' }));
    expect(strokesIn(id)).toHaveLength(1);
  });

  it('erases every line the eraser passes over, and « Tout effacer » can be taken back', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'drawing' });
    render(<DrawingSheet noteId={id} editable />);
    drag(sheet(), [
      [10, 10],
      [200, 10],
    ]);
    drag(sheet(), [
      [10, 100],
      [200, 100],
    ]);
    drag(sheet(), [
      [10, 250],
      [200, 250],
    ]);
    expect(strokesIn(id)).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Gomme' }));
    // One sweep from the first line down to the second, quick: both go, the third stays.
    drag(sheet(), [
      [50, 5],
      [50, 105],
    ]);
    expect(strokesIn(id).map(stroke => stroke.points[1])).toEqual([500]);
    // Choosing an ink goes back to drawing.
    await user.click(screen.getByRole('radio', { name: 'Rouge' }));
    expect(usePen.getState().mode).toBe('pen');

    await user.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(drawingOf(id)).toBe('');
    expect(screen.getByRole('button', { name: 'Tout effacer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(strokesIn(id)).toHaveLength(1);
  });

  it('lets go of a line a second finger turns into a scroll, and keeps one drawn by a single finger', () => {
    const id = createNote({ kind: 'drawing' });
    render(<DrawingSheet noteId={id} editable />);
    const svg = sheet();
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerDown(svg, { pointerId: 2, pointerType: 'touch', clientX: 60, clientY: 10 });
    fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 60 });
    fireEvent.pointerMove(svg, { pointerId: 2, pointerType: 'touch', clientX: 60, clientY: 60 });
    fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 60 });
    fireEvent.pointerUp(svg, { pointerId: 2, pointerType: 'touch', clientX: 60, clientY: 60 });
    expect(drawingOf(id)).toBe('');
    drag(
      svg,
      [
        [10, 10],
        [100, 100],
      ],
      { pointerType: 'touch' },
    );
    expect(strokesIn(id)).toHaveLength(1);
  });

  it('shows the drawing without its tools when the note is in the bin', () => {
    const id = createNote({ kind: 'drawing' });
    updateNote(id, { drawing: serializeStrokes([{ id: '000000001aaaa', tool: 'pen', size: 1, ink: 'ink', points: [10, 10, 90, 90] }]) });
    render(<DrawingSheet noteId={id} editable={false} />);
    expect(screen.getByRole('img', { name: 'Dessin' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Outils de dessin' })).toBeNull();
    expect(document.querySelectorAll('path[d]')).toHaveLength(1);
  });
});

describe('an editing session', () => {
  const line = (id: string, y: number): Stroke => ({ id, tool: 'pen', size: 0, ink: 'ink', points: [0, y, 100, y] });

  it('saves from what it showed, and shows a change from elsewhere once the hand is lifted', () => {
    const first = serializeStrokes([line('000000001aaaa', 10)]);
    const save = vi.fn((_since: string, typed: string) => typed);
    const { result, rerender } = renderHook(({ stored }) => useDrawingSession(stored, save), { initialProps: { stored: first } });
    act(() => result.current.onGesture(true));
    // Another device drew meanwhile: it waits while the hand is down.
    const theirs = serializeStrokes([line('000000001aaaa', 10), line('000000002bbbb', 20)]);
    rerender({ stored: theirs });
    expect(result.current.strokes).toHaveLength(1);
    act(() => {
      result.current.onStroke(line('000000003cccc', 30));
      result.current.onGesture(false);
    });
    expect(save).toHaveBeenLastCalledWith(first, serializeStrokes([line('000000001aaaa', 10), line('000000003cccc', 30)]));
  });

  it('refuses a stroke that would make the drawing too long, and says so', () => {
    const full = 'x'.repeat(DRAWING_LIMITS.chars - 10);
    const save = vi.fn((_since: string, typed: string) => typed);
    const { result } = renderHook(() => useDrawingSession(full, save));
    act(() => result.current.onStroke(line('000000003cccc', 30)));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
    expect(useUiStore.getState().snack).toMatchObject({ tone: 'warning', message: 'Ce dessin est plein : effacez des traits pour en ajouter d’autres.' });
  });
});

describe('a page’s drawing', () => {
  function PageDrawing({ page, id, readOnly = false }: { page: string; id: string; readOnly?: boolean }) {
    const block = useLibraryStore(s => s.blocks[id]!);
    return (
      <PageContext.Provider value={{ page, readOnly }}>
        <DrawingBlock block={block} />
      </PageContext.Provider>
    );
  }
  const drawingIn = (id: string): string => useLibraryStore.getState().blocks[id]!.drawing;

  it('invites to draw, opens the editor on it, and keeps each stroke in the page’s undo', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Croquis' });
    const id = insertBlock(page, page, 0, { kind: 'drawing' });
    render(<PageDrawing page={page} id={id} />);
    await user.click(screen.getByRole('button', { name: 'Cliquez pour dessiner' }));
    const dialog = screen.getByRole('dialog', { name: 'Dessin' });
    // The tool in hand has the focus, so the keyboard starts there.
    expect(within(dialog).getByRole('button', { name: 'Stylo' })).toHaveFocus();
    drag(sheet(), [
      [10, 10],
      [100, 100],
    ]);
    expect(parseDrawing(drawingIn(id))).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Terminé' }));
    expect(screen.getByRole('button', { name: 'Modifier le dessin' })).toBeInTheDocument();
    undoPage(page);
    expect(drawingIn(id)).toBe('');
  });

  it('opens from « / » as soon as the block is made, and only shows the drawing on a page in the bin', () => {
    const page = createPage({ title: 'Croquis' });
    const id = insertBlock(page, page, 0, { kind: 'drawing' });
    const { unmount } = render(<PageDrawing page={page} id={id} />);
    act(() => openDrawingEditor(page, id));
    expect(screen.getByRole('dialog', { name: 'Dessin' })).toBeInTheDocument();
    unmount();
    render(<PageDrawing page={page} id={id} readOnly />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Dessin vide')).toBeInTheDocument();
  });
});

describe('a card’s drawing', () => {
  it('shows the strokes at the card’s width, cut at its height, and takes no press', () => {
    const data = serializeStrokes([{ id: '000000001aaaa', tool: 'highlighter', size: 2, ink: 'yellow', points: [10, 10, 990, 1400] }]);
    const { container } = render(<DrawingPreview data={data} height={180} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveStyle({ height: '180px' });
    expect(box.querySelector('svg')).toHaveAttribute('viewBox', '0 0 1000 1500');
    const path = box.querySelector('path')!;
    expect(path).toHaveAttribute('data-line', 'yellow');
    expect(path).toHaveAttribute('opacity', '0.38');
  });
});
