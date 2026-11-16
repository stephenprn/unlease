import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fadeStrength, lineStrength, useScrollEdges, type ScrollEdgesOptions } from '../scrollEdges';

/** jsdom lays nothing out: the scroller's sizes and scroll are set by hand. */
function size(node: HTMLElement, { height = 200, content = 200, width = 300, wide = 300, top = 0, left = 0 }: { height?: number; content?: number; width?: number; wide?: number; top?: number; left?: number }): void {
  let scrolledTop = top;
  let scrolledLeft = left;
  Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => height });
  Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(node, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(node, 'scrollWidth', { configurable: true, get: () => wide });
  Object.defineProperty(node, 'scrollTop', { configurable: true, get: () => scrolledTop, set: (value: number) => (scrolledTop = value) });
  Object.defineProperty(node, 'scrollLeft', { configurable: true, get: () => scrolledLeft, set: (value: number) => (scrolledLeft = value) });
}

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

function Scroller({ options, sized }: { options: ScrollEdgesOptions; sized: (node: HTMLElement) => void }) {
  const edges = useScrollEdges(options);
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

const prop = (node: HTMLElement, name: string): string => node.style.getPropertyValue(name);
const lines = (node: HTMLElement): readonly string[] => [prop(node, '--edge-above-k'), prop(node, '--edge-below-k')];
const fades = (node: HTMLElement): readonly string[] => [prop(node, '--fade-above-k'), prop(node, '--fade-below-k'), prop(node, '--fade-left-k'), prop(node, '--fade-right-k')];

async function scrollTo(node: HTMLElement, { top, left }: { top?: number; left?: number }): Promise<void> {
  if (top !== undefined) node.scrollTop = top;
  if (left !== undefined) node.scrollLeft = left;
  fireEvent.scroll(node);
  await frame();
}

describe('a bar’s hairline', () => {
  it('comes in eased over the first few px gone under it, and is gone at rest', () => {
    expect(lineStrength(0)).toBe(0);
    expect(lineStrength(-12)).toBe(0);
    expect(lineStrength(2)).toBe(0.156);
    expect(lineStrength(4)).toBe(0.5);
    expect(lineStrength(6)).toBe(0.844);
    expect(lineStrength(8)).toBe(1);
    expect(lineStrength(400)).toBe(1);
  });

  it('shows under a head once content has gone under it, over a foot while content runs on past it', async () => {
    const { getByTestId } = render(<Scroller options={{ top: true, bottom: true }} sized={node => size(node, { height: 200, content: 300 })} />);
    const scroller = getByTestId('scroller');
    expect(scroller).toHaveAttribute('data-edge-top');
    expect(scroller).toHaveAttribute('data-edge-bottom');
    // A bar never fades what scrolls under it.
    expect(scroller).not.toHaveAttribute('data-scroll-fade');
    expect(fades(scroller)).toEqual(['', '', '', '']);
    // At its top: no line under the head, the foot's at full.
    expect(lines(scroller)).toEqual(['0', '1']);

    await scrollTo(scroller, { top: 4 });
    expect(lines(scroller)).toEqual(['0.5', '1']);

    await scrollTo(scroller, { top: 96 });
    expect(lines(scroller)).toEqual(['1', '0.5']);

    // At the end: nothing runs on past the foot.
    await scrollTo(scroller, { top: 100 });
    expect(lines(scroller)).toEqual(['1', '0']);
  });

  it('draws nothing at rest when nothing overflows', () => {
    const { getByTestId } = render(<Scroller options={{ top: true, bottom: true }} sized={node => size(node, { height: 200, content: 200 })} />);
    expect(lines(getByTestId('scroller'))).toEqual(['0', '0']);
  });

  it('leaves a sticky head or foot inside the scroller to draw it, from the strength it inherits', () => {
    const { getByTestId } = render(<Scroller options={{ bottom: 'inside' }} sized={node => size(node, { height: 200, content: 300 })} />);
    const scroller = getByTestId('scroller');
    expect(scroller).not.toHaveAttribute('data-edge-bottom');
    expect(prop(scroller, '--edge-below-k')).toBe('1');
  });

  it('keeps what takes focus a hairline’s room clear of it', () => {
    const { getByTestId } = render(<Scroller options={{ top: true }} sized={node => size(node, { height: 200, content: 300 })} />);
    expect(prop(getByTestId('scroller'), 'scroll-padding-top')).toBe('var(--edge-room)');
  });
});

describe('the fade', () => {
  it('dissolves a capped list’s ends as strongly as content lies beyond, full past 24px', async () => {
    expect(fadeStrength(6)).toBe(0.25);
    expect(fadeStrength(24)).toBe(1);
    const { getByTestId } = render(<Scroller options={{ fade: 'y' }} sized={node => size(node, { height: 200, content: 300 })} />);
    const scroller = getByTestId('scroller');
    expect(scroller).toHaveAttribute('data-scroll-fade', 'y');
    expect(scroller).not.toHaveAttribute('data-edge-top');
    expect(fades(scroller)).toEqual(['0', '1', '', '']);

    await scrollTo(scroller, { top: 6 });
    expect(fades(scroller)).toEqual(['0.25', '1', '', '']);

    await scrollTo(scroller, { top: 100 });
    expect(fades(scroller)).toEqual(['1', '0', '', '']);
  });

  it('never fades an edge that has a hairline: a field over a popover’s list, its foot faded', () => {
    const { getByTestId } = render(<Scroller options={{ top: true, fade: 'y' }} sized={node => size(node, { height: 200, content: 300, top: 40 })} />);
    const scroller = getByTestId('scroller');
    expect(lines(scroller)).toEqual(['1', '']);
    expect(fades(scroller)).toEqual(['', '1', '', '']);
  });

  it('fades a sideways strip at the sides where more lies, only while it overflows', async () => {
    const { getByTestId } = render(<Scroller options={{ fade: 'x' }} sized={node => size(node, { width: 300, wide: 500 })} />);
    const scroller = getByTestId('scroller');
    expect(scroller).toHaveAttribute('data-scroll-fade', 'x');
    expect(fades(scroller)).toEqual(['', '', '0', '1']);
    expect(prop(scroller, 'scroll-padding-left')).toBe('var(--edge-fade)');

    await scrollTo(scroller, { left: 12 });
    expect(fades(scroller)).toEqual(['', '', '0.5', '1']);

    await scrollTo(scroller, { left: 200 });
    expect(fades(scroller)).toEqual(['', '', '1', '0']);
  });

  it('keeps a strip that holds everything whole: no mask', () => {
    const { getByTestId } = render(<Scroller options={{ fade: 'x' }} sized={node => size(node, { width: 300, wide: 300 })} />);
    expect(getByTestId('scroller')).not.toHaveAttribute('data-scroll-fade');
  });

  it('fades one side alone when the other has its own (a table’s first column)', () => {
    const { getByTestId } = render(<Scroller options={{ fade: 'right' }} sized={node => size(node, { width: 300, wide: 500, left: 40 })} />);
    expect(fades(getByTestId('scroller'))).toEqual(['', '', '', '1']);
  });
});

describe('a scroller’s edges', () => {
  it('takes everything it wrote away when the scroller goes', () => {
    const { getByTestId, unmount } = render(<Scroller options={{ top: true, bottom: true, fade: 'x' }} sized={node => size(node, { height: 200, content: 300, width: 300, wide: 500 })} />);
    const scroller = getByTestId('scroller');
    unmount();
    for (const name of ['data-scroll-edges', 'data-edge-top', 'data-edge-bottom', 'data-scroll-fade']) expect(scroller).not.toHaveAttribute(name);
    expect(lines(scroller)).toEqual(['', '']);
    expect(fades(scroller)).toEqual(['', '', '', '']);
    expect(prop(scroller, 'scroll-padding-top')).toBe('');
  });
});
