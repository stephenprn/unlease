import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useScrollEdges } from '../scrollEdges';

/** jsdom lays nothing out: the scroller's sizes and scroll are set by hand. */
function size(node: HTMLElement, { height, content, top = 0 }: { height: number; content: number; top?: number }): void {
  let scrolled = top;
  Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => height });
  Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(node, 'scrollTop', { configurable: true, get: () => scrolled, set: (value: number) => (scrolled = value) });
}

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function Scroller({ top = true, bottom = true, sized }: { top?: boolean; bottom?: boolean; sized: (node: HTMLElement) => void }) {
  const edges = useScrollEdges({ top, bottom });
  return (
    <div
      data-testid="scroller"
      ref={node => {
        if (node) sized(node);
        return edges(node);
      }}
    >
      <p>Rows</p>
    </div>
  );
}

const strengthsOf = (node: HTMLElement): readonly string[] => [node.style.getPropertyValue('--edge-above-k'), node.style.getPropertyValue('--edge-below-k')];

describe('a scroller’s edges', () => {
  it('dissolves each edge as strongly as content lies beyond it, full past 24px', async () => {
    const { getByTestId } = render(<Scroller sized={node => size(node, { height: 200, content: 300 })} />);
    const scroller = getByTestId('scroller');
    expect(scroller).toHaveAttribute('data-scroll-edges');
    // At its top: crisp there, the foot at full strength.
    expect(strengthsOf(scroller)).toEqual(['0', '1']);

    // Six pixels down: the top at a quarter.
    scroller.scrollTop = 6;
    fireEvent.scroll(scroller);
    await frame();
    expect(strengthsOf(scroller)).toEqual(['0.25', '1']);

    // Twelve from the end: the foot at half.
    scroller.scrollTop = 88;
    fireEvent.scroll(scroller);
    await frame();
    expect(strengthsOf(scroller)).toEqual(['1', '0.5']);

    // At the end: crisp below.
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    await frame();
    expect(strengthsOf(scroller)).toEqual(['1', '0']);
  });

  it('stays crisp at both ends when nothing overflows', () => {
    const { getByTestId } = render(<Scroller sized={node => size(node, { height: 200, content: 200 })} />);
    expect(strengthsOf(getByTestId('scroller'))).toEqual(['0', '0']);
  });

  it("leaves an edge it is not told of a plain cut: the screen's own, or its card's", () => {
    // A list under a head, its foot on the screen's.
    const { getByTestId } = render(<Scroller bottom={false} sized={node => size(node, { height: 200, content: 300, top: 40 })} />);
    expect(strengthsOf(getByTestId('scroller'))).toEqual(['1', '0']);
  });

  it('takes everything it wrote away when the scroller goes', () => {
    const { getByTestId, unmount } = render(<Scroller sized={node => size(node, { height: 200, content: 300 })} />);
    const scroller = getByTestId('scroller');
    unmount();
    expect(scroller).not.toHaveAttribute('data-scroll-edges');
    expect(strengthsOf(scroller)).toEqual(['', '']);
  });
});
