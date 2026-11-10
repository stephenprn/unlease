import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '@test/library';
import { createPage, insertBlock } from '../../app/store/pages';
import { PageView } from '../features/pages/PageView';

describe('a video from another site, in a page', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('plays in its provider’s frame, told the server’s origin only (YouTube refuses to play without it)', () => {
    const page = createPage({ title: 'Vidéos' });
    insertBlock(page, page, 0, { kind: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42' });
    const { container } = render(<PageView id={page} />);
    const frame = container.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
    expect(frame?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
  });
});
