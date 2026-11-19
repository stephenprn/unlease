/**
 * An event's description as it reads: the addresses written in it are links opening in a new tab,
 * the words around them kept, and an address that may not be opened stays words.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichText } from '../features/RichText';

describe('An event’s description', () => {
  it('makes the addresses written in it links', () => {
    const { container } = render(<RichText markup={'Billets : https://example.org/billets.\nPlan sur www.example.org/plan, et le reste.'} />);
    const links = screen.getAllByRole('link');
    expect(links.map(link => [link.textContent, link.getAttribute('href'), link.getAttribute('target')])).toEqual([
      ['https://example.org/billets', 'https://example.org/billets', '_blank'],
      ['www.example.org/plan', 'https://www.example.org/plan', '_blank'],
    ]);
    expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).toBe('Billets : https://example.org/billets.\nPlan sur www.example.org/plan, et le reste.');
  });

  it('keeps marks around an address, and plain prose plain', () => {
    render(<RichText markup={'{b:voir https://example.org/a} puis fin.'} />);
    const link = screen.getByRole('link');
    expect(link.textContent).toBe('https://example.org/a');
    expect(link.closest('strong')).not.toBeNull();
  });

  it('writes no link where there is no address', () => {
    render(<RichText markup="Rendez-vous devant la gare." />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
