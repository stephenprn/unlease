import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '@test/library';
import { createNote, updateNote } from '@notes/app/store/actions';
import { useLibraryStore } from '@notes/app/store/library';
import { setSelectionOffsets } from '@notes/ui/features/note/noteDom';
import { createPage, insertBlock } from '../../app/store/pages';
import { PageView } from '../features/pages/PageView';

/** Carnet's notes, in Pages' web app: its data is installed beside Pages' (`notesData`), its editors drawn in a page. */
describe('a Carnet note in a page', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('is typed and formatted in a page’s embed as in its editor', async () => {
    const id = createNote({ kind: 'text', title: 'Valise' });
    updateNote(id, { body: '## Papiers\n{b:Passeport}', rich: true });
    const page = createPage({ title: 'Voyage' });
    insertBlock(page, page, 0, { kind: 'embed', target: { type: 'note', id } });
    render(<PageView id={page} />);
    const body = await screen.findByRole('textbox', { name: 'Texte de la note' });
    expect(body.querySelector('[data-heading="2"]')?.textContent).toBe('Papiers');
    act(() => {
      body.focus();
      setSelectionOffsets(body, 0, 7);
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mise en forme' })).getByRole('button', { name: 'Titre 2' }));
    expect(useLibraryStore.getState().notes[id]!.body).toBe('Papiers\n{b:Passeport}');
  });
});
