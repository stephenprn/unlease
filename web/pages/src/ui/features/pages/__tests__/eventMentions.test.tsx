import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blankDraft, createEvent } from '@unlease/calendar/services/editing';
import { addDays, deviceZone, instantToDay } from '@unlease/calendar/services/time';

import { freshLibrary } from '@test/library';
import { writeLocal } from '@shared/app/store/records';
import { pagesLibrary, useBlocksStore } from '../../../../app/store/blocks';
import { createPage, insertBlock } from '../../../../app/store/pages';
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
const chip = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-mention="event:${id}"]`)!;

/** An event of Agenda's, in two days at 20:00 in the device's zone (it reads 20:00 wherever the tests run), as Agenda's app would write it. */
function dinner(title = 'Dîner chez Paul'): string {
  const day = addDays(instantToDay(Date.now()), 2);
  const change = createEvent({ ...blankDraft(`${day}T20:00`, `${day}T22:00`, deviceZone()), title, place: 'Lyon' }, Date.now());
  writeLocal([change]);
  return change.id;
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

describe('an event in a page', () => {
  it('is named by its title, follows a rename, and opens in Agenda', () => {
    const id = dinner();
    const page = createPage({ title: 'Semaine' });
    insertBlock(page, page, 0, { kind: 'text', text: `Voir {@event=${id}}` });
    render(<PageView id={page} />);
    expect(chip(id)).toHaveTextContent('Dîner chez Paul');
    act(() => writeLocal([{ type: 'calendarEvent', id, patch: { title: 'Dîner chez Léa' } }]));
    expect(chip(id)).toHaveTextContent('Dîner chez Léa');
    expect(targetPath(pagesLibrary(), { type: 'event', id })).toBe(`/agenda/event/${id}`);
    // Pressed, it opens in Agenda, in a new tab.
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(chip(id));
    expect(opened).toHaveBeenCalledWith(`/agenda/event/${id}`, '_blank', 'noopener');
    opened.mockClear();
    act(() => writeLocal([{ type: 'calendarEvent', id, patch: { deletedAt: Date.now() } }]));
    expect(chip(id)).toHaveTextContent('Événement supprimé');
    // Gone, it opens nothing.
    fireEvent.click(chip(id));
    expect(opened).not.toHaveBeenCalled();
    opened.mockRestore();
  });

  it('is offered by « @ » with its day, and placed as a mention, never as a bookmark', () => {
    const id = dinner();
    const page = createPage({ title: 'Semaine' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Voir @');
    typeIn(rich(block), 'Voir @Dîner');
    const list = screen.getByRole('listbox', { name: 'Pages, contacts, événements, notes, collections, liens et dates' });
    const [first] = within(list).getAllByRole('option');
    expect(first).toHaveTextContent('Dîner chez Paul');
    expect(first).toHaveTextContent('20:00');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`Voir {@event=${id}} `);
    expect(searchTargets(pagesLibrary(), 'Dîner', { sections: BOOKMARK_SECTIONS }).some(hit => hit.target.type === 'event')).toBe(false);
  });
});

describe('a calendar block', () => {
  it('lists the next events by day, and says when there is none', () => {
    const id = dinner();
    const page = createPage({ title: 'Semaine' });
    insertBlock(page, page, 0, { kind: 'calendar', calendarDays: 7 });
    render(<PageView id={page} />);
    const item = screen.getByRole('link', { name: /Dîner chez Paul/ });
    expect(item).toHaveTextContent('20:00 – 22:00');
    expect(item).toHaveAttribute('href', expect.stringContaining(`/agenda/event/${id}`));
    act(() => writeLocal([{ type: 'calendarEvent', id, patch: { trashedAt: Date.now() } }]));
    expect(screen.getByText('Rien de prévu les 7 prochains jours.')).toBeInTheDocument();
  });
});
