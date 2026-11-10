/**
 * « Souhaiter » on a birthday's page in Agenda: on the day and the day after, first among its actions,
 * the ways in a menu; not on another day; nothing said of notifications, which the web has none of.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createId } from '@unlease/core/services/ids';
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { contactFields } from '@unlease/contacts/sync/entities';

import { freshLibrary } from '@test/library';
import { writeLocal } from '@shared/app/store/records';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';

const today = (): string => instantToDay(Date.now());

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

function person(first: string, birthday: string): string {
  const id = createId();
  writeLocal([
    {
      type: 'contact',
      id,
      patch: contactFields({
        firstName: first,
        lastName: 'Martin',
        company: '',
        jobTitle: '',
        // International, so WhatsApp knows it whatever the browser's country.
        phones: [{ id: 'p1', number: '+33 6 12 34 56 78', kind: 'mobile', label: '' }],
        emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }],
        addresses: [],
        birthday,
        note: '',
        labelIds: [],
        favorite: false,
        photoId: null,
        photoUploaded: false,
        photoMime: '',
        mergedInto: null,
        trashedAt: null,
        createdAt: Date.now(),
        deletedAt: null,
      }),
    },
  ]);
  return id;
}

describe('Agenda’s « Souhaiter »', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('offers it on the day, first, the ways in a menu', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const id = person('Léa', `1991-${today().slice(5)}`);
    open(`/agenda/birthday/${id}`);
    render(<App />);
    const wish = await screen.findByRole('button', { name: 'Souhaiter son anniversaire à Léa Martin' });
    expect(wish.compareDocumentPosition(screen.getByRole('link', { name: 'Appeler' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(wish);
    await user.click(await screen.findByRole('menuitem', { name: 'WhatsApp' }));
    expect(windowOpen).toHaveBeenCalledWith('https://wa.me/33612345678?text=Joyeux%20anniversaire%2C%20L%C3%A9a%20!', '_blank', 'noopener,noreferrer');
    expect(screen.queryByText(/Notifications d’anniversaire|Rappel le jour même/)).not.toBeInTheDocument();
  });

  it('not on another day', async () => {
    const id = person('Léa', `1991-${addDays(today(), 3).slice(5)}`);
    open(`/agenda/birthday/${id}`);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Léa Martin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Souhaiter son anniversaire à Léa Martin' })).not.toBeInTheDocument();
  });
});
