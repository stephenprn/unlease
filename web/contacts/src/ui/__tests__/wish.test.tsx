/**
 * « Souhaiter » on the web: on their birthday (and the day after) a contact's page says so and offers
 * it, the ways in a menu (WhatsApp, an e-mail; no SMS from a computer), each opened with the wish
 * written; one way goes at once; today's birthdays offer it at their end, the age under the name.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatBirthday, readBirthday } from '@unlease/contacts/services/birthdays';

import { freshLibrary } from '@test/library';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { emptyDraft } from '../../app/drafts';
import { saveContact } from '../../app/store/actions';
import { setRegion } from '../../app/store/prefs';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

/** A birthday `days` from today, born in 1990. */
function bornOn(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  return `1990-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function person(name: string, extra: Partial<ReturnType<typeof emptyDraft>> = {}): string {
  return saveContact(null, { ...emptyDraft(name), ...extra }, { since: null, typed: '' });
}

const mobile = [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }];
const email = [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }];

let clicked: string[] = [];

describe('Contacts’ « Souhaiter »', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    setRegion('FR');
    clicked = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
    // An e-mail opens through a link clicked, the page left where it is.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('offers it on their day, the ways in a menu, each with the wish written', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const id = person('Léa Martin', { birthday: bornOn(0), phones: mobile, emails: email });
    open(`/contacts/contact/${id}`);
    render(<App />);
    expect(await screen.findByText('Son anniversaire')).toBeInTheDocument();
    expect(screen.getByText('Son anniversaire').parentElement).toHaveTextContent(/^Son anniversaireAujourd’hui · 36.ans$/);
    await user.click(screen.getByRole('button', { name: 'Souhaiter son anniversaire à Léa Martin' }));
    const menu = await screen.findByRole('menu', { name: 'Souhaiter son anniversaire à Léa Martin' });
    // A computer has nothing to text with: no SMS.
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['WhatsApp', 'E-mail']);
    await user.click(screen.getByRole('menuitem', { name: 'WhatsApp' }));
    expect(windowOpen).toHaveBeenCalledWith('https://wa.me/33612345678?text=Joyeux%20anniversaire%2C%20L%C3%A9a%20!', '_blank', 'noopener,noreferrer');
    await user.click(screen.getByRole('button', { name: 'Souhaiter son anniversaire à Léa Martin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'E-mail' }));
    expect(clicked).toEqual(['mailto:lea@example.org?subject=Joyeux%20anniversaire&body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!']);
  });

  it('goes the one way there is at once, the day after too; nothing another day', async () => {
    const user = userEvent.setup();
    const paul = person('Paul Durand', { birthday: bornOn(-1), emails: email });
    const zoe = person('Zoé Abel', { birthday: bornOn(5), phones: mobile });
    open(`/contacts/contact/${paul}`);
    const shown = render(<App />);
    expect(await screen.findByText('Son anniversaire')).toBeInTheDocument();
    expect(screen.getByText('Son anniversaire').parentElement).toHaveTextContent(/^Son anniversaireHier · 36.ans$/);
    await user.click(screen.getByRole('button', { name: 'Souhaiter son anniversaire à Paul Durand' }));
    expect(clicked).toEqual(['mailto:lea@example.org?subject=Joyeux%20anniversaire&body=Joyeux%20anniversaire%2C%20Paul%20!']);
    shown.unmount();
    open(`/contacts/contact/${zoe}`);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Zoé Abel' })).toBeInTheDocument();
    expect(screen.queryByText('Son anniversaire')).not.toBeInTheDocument();
  });

  it('offers it on today’s birthdays, the age under the name', async () => {
    person('Léa Martin', { birthday: bornOn(0), phones: mobile });
    person('Paul Durand', { birthday: bornOn(3), phones: mobile });
    person('Zoé Abel', { birthday: bornOn(0) });
    open('/contacts/birthdays');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Souhaiter son anniversaire à Léa Martin' })).toBeInTheDocument();
    // No way to write to Zoé, and Paul's is not today.
    expect(screen.queryByRole('button', { name: 'Souhaiter son anniversaire à Zoé Abel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Souhaiter son anniversaire à Paul Durand' })).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${formatBirthday(readBirthday(bornOn(0))!)} · 36.ans$`))).toBeInTheDocument();
  });
});
