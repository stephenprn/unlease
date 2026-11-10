/** A page's drawing block (`DrawingBlock`): Carnet's drawing editor, its strokes kept in the page's undo. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseDrawing } from '@unlease/notes/services/drawing';

import { freshLibrary } from '@test/library';
import { useBlocksStore } from '../../../../app/store/blocks';
import { undoPage } from '../../../../app/store/pageHistory';
import { createPage, insertBlock } from '../../../../app/store/pages';
import { DrawingBlock, openDrawingEditor } from '../DrawingBlock';
import { PageContext } from '../PageContext';
import { resetPen } from '@notes/ui/features/drawing/pen';

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

describe('a page’s drawing', () => {
  function PageDrawing({ page, id, readOnly = false }: { page: string; id: string; readOnly?: boolean }) {
    const block = useBlocksStore(s => s.blocks[id]!);
    return (
      <PageContext.Provider value={{ page, readOnly }}>
        <DrawingBlock block={block} />
      </PageContext.Provider>
    );
  }
  const drawingIn = (id: string): string => useBlocksStore.getState().blocks[id]!.drawing;

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

  it('lays the drawing on the plain paper until another background is chosen from « Fond », in its frame and its editor, kept in the page’s undo', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Croquis' });
    const id = insertBlock(page, page, 0, { kind: 'drawing' });
    render(<PageDrawing page={page} id={id} />);
    await user.click(screen.getByRole('button', { name: 'Cliquez pour dessiner' }));
    const dialog = screen.getByRole('dialog', { name: 'Dessin' });
    drag(sheet(), [
      [10, 10],
      [100, 100],
    ]);
    // None chosen: the plain paper.
    expect(useBlocksStore.getState().blocks[id]!.color).toBeNull();
    expect(sheet().closest('[data-outline]')).toHaveAttribute('data-sheet');
    await user.click(within(dialog).getByRole('button', { name: 'Fond : Papier' }));
    const picker = screen.getByRole('dialog', { name: 'Fond du dessin' });
    expect(within(picker).getByRole('radio', { name: 'Papier' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(picker).getByRole('radio', { name: 'Ocre' }));
    expect(useBlocksStore.getState().blocks[id]!.color).toBe('ochre');
    // The editor's sheet wears it as the frame on the page does.
    expect(sheet().closest('[data-outline]')).toHaveAttribute('data-line', 'ochre');
    await user.click(within(screen.getByRole('dialog', { name: 'Fond du dessin' })).getByRole('radio', { name: 'Sans fond' }));
    expect(useBlocksStore.getState().blocks[id]!.color).toBe('none');
    expect(sheet().closest('[data-outline]')).not.toHaveAttribute('data-sheet');
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Terminé' }));
    // No background: the page shows through the frame.
    expect(screen.getByRole('button', { name: 'Modifier le dessin' })).not.toHaveAttribute('data-sheet');
    act(() => undoPage(page));
    expect(useBlocksStore.getState().blocks[id]!.color).toBe('ochre');
    const frame = screen.getByRole('button', { name: 'Modifier le dessin' });
    expect(frame).toHaveAttribute('data-sheet');
    expect(frame).toHaveAttribute('data-line', 'ochre');
    act(() => undoPage(page));
    // Back to none chosen: the paper again.
    expect(useBlocksStore.getState().blocks[id]!.color).toBeNull();
    expect(screen.getByRole('button', { name: 'Modifier le dessin' })).toHaveAttribute('data-sheet');
    expect(screen.getByRole('button', { name: 'Modifier le dessin' })).not.toHaveAttribute('data-line');
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

