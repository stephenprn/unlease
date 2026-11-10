import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { draftOf, emptyDraft } from '@contacts/app/drafts';
import { deleteForever, mergeGroup, saveContact, trashContacts } from '@contacts/app/store/actions';
import { useContactsStore } from '@contacts/app/store/library';
import { pagesLibrary, useBlocksStore } from '../../../../app/store/blocks';
import { createPage, insertBlock } from '../../../../app/store/pages';
import { pageMarkdown } from '../clipboard';
import { targetPath } from '../mentions';
import { PageView } from '../PageView';
import { BOOKMARK_SECTIONS, searchTargets } from '../targetSearch';

const text = (id: string): string => useBlocksStore.getState().blocks[id]!.text;
const rich = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-rich-block="${id}"]`)!;
const typeIn = (element: HTMLElement, value: string): void => {
  element.textContent = value;
  window.getSelection()!.setBaseAndExtent(element.firstChild!, value.length, element.firstChild!, value.length);
  fireEvent.input(element);
};
const chip = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-mention="contact:${id}"]`)!;

function lea(): string {
  return saveContact(null, { ...emptyDraft('Léa Martin'), company: 'Atelier Nord', jobTitle: 'Architecte' }, { since: null, typed: '' });
}

beforeEach(async () => {
  await freshLibrary();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [], configurable: true, writable: true });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { value: () => new DOMRect(), configurable: true, writable: true });
});

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
});

describe('a contact in a page', () => {
  it('names and opens the one kept once merged', () => {
    const kept = lea();
    const twin = saveContact(null, emptyDraft('Léa M.'), { since: null, typed: '' });
    const page = createPage({ title: 'Chantier' });
    insertBlock(page, page, 0, { kind: 'text', text: `Voir {@contact=${twin}}` });
    render(<PageView id={page} />);
    expect(chip(twin)).toHaveTextContent('Léa M.');
    act(() => {
      mergeGroup([kept, twin]);
    });
    expect(chip(twin)).toHaveTextContent('Léa Martin');
    expect(targetPath(pagesLibrary(), { type: 'contact', id: twin })).toBe(`/contacts/contact/${kept}`);
  });

  it('is offered by « @ », with what they do, and placed as a mention', () => {
    const id = lea();
    const page = createPage({ title: 'Chantier' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Appeler @');
    typeIn(rich(block), 'Appeler @Léa');
    const list = screen.getByRole('listbox', { name: 'Pages, contacts, événements, notes, collections, liens et dates' });
    const [first] = within(list).getAllByRole('option');
    expect(first).toHaveTextContent('Léa Martin');
    expect(first).toHaveTextContent('Architecte, Atelier Nord');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`Appeler {@contact=${id}} `);
  });

  it('keeps every mention of the line when the words around it are typed: a contact, an event, a type from a newer client', async () => {
    const id = lea();
    const page = createPage({ title: 'Chantier' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: `Voir {@contact=${id}} avant {@event=ev1} et {@later=x9}` });
    render(<PageView id={page} />);
    const element = rich(block);
    const tail = document.createTextNode(' demain');
    element.append(tail);
    window.getSelection()!.setBaseAndExtent(tail, tail.length, tail, tail.length);
    fireEvent.input(element);
    const { flushAll } = await import('../editorStore');
    act(() => flushAll());
    expect(text(block)).toBe(`Voir {@contact=${id}} avant {@event=ev1} et {@later=x9} demain`);
  });

  it('is never offered as a bookmark or an embed, and opens in Contacts', () => {
    const id = lea();
    expect(searchTargets(pagesLibrary(), 'Léa', { sections: BOOKMARK_SECTIONS }).some(hit => hit.target.type === 'contact')).toBe(false);
    expect(searchTargets(pagesLibrary(), 'Léa').map(hit => hit.target)).toContainEqual({ type: 'contact', id });
    expect(targetPath(pagesLibrary(), { type: 'contact', id })).toBe(`/contacts/contact/${id}`);
  });

  it('shows the name they have now, still in Contacts’ bin, and « Contact supprimé » once deleted for good', () => {
    const id = lea();
    const page = createPage({ title: 'Chantier' });
    insertBlock(page, page, 0, { kind: 'text', text: `Voir avec {@contact=${id}} lundi` });
    render(<PageView id={page} />);
    expect(chip(id)).toHaveTextContent('Léa Martin');
    act(() => {
      saveContact(id, { ...draftOf(useContactsStore.getState().contacts[id]!), firstName: 'Léonie' }, { since: '', typed: '' });
    });
    expect(chip(id)).toHaveTextContent('Léonie Martin');
    expect(pageMarkdown(page)).toContain('Voir avec Léonie Martin lundi');
    act(() => {
      trashContacts([id]);
    });
    expect(chip(id)).toHaveTextContent('Léonie Martin');
    act(() => deleteForever([id]));
    expect(chip(id)).toHaveTextContent('Contact supprimé');
  });
});
