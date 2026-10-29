import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '../../test/library';
import { addLink, createLine, setLinkDone, updateLink } from '../../app/store/actions';
import { getRecord, useLibraryStore } from '../../app/store/library';
import { setReading, setServer } from '../../app/store/settings';
import { useUiStore } from '../../app/store/ui';
import { NewLineDialog } from '../features/lines/LineDialogs';
import { LinkPanel } from '../features/links/LinkPanel';
import { LineScreen } from '../screens/LineScreen';
import { LinesScreen } from '../screens/LinesScreen';

describe('a collection page', () => {
  let line: string;
  let ready: string;
  let failed: string;
  let done: string;

  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    line = createLine({ id: 'line-mode', title: 'Mode', code: 'M', color: 'magenta', emblem: 'fleur', hint: 'Vêtements à acheter.' });
    addLink('https://www.tissage.fr/chemise', { noteId: line });
    ready = addLink('https://www.atelier-nord.fr/veste', { noteId: line });
    updateLink(ready, { status: 'ready', title: 'Veste en laine bouillie', kind: 'product', siteName: 'Atelier Nord', price: 189, currency: 'EUR', attributes: [{ label: 'Couleur', value: 'Camel' }] });
    failed = addLink('https://boutique-fermee.fr/sac', { noteId: line });
    updateLink(failed, { status: 'failed', error: 'La page refuse les robots.' });
    done = addLink('https://www.atelier-nord.fr/echarpe', { noteId: line });
    updateLink(done, { status: 'ready', title: 'Écharpe en cachemire', kind: 'product', price: 75, currency: 'EUR' });
    setLinkDone(done, true, Date.UTC(2026, 9, 10, 12));
  });

  it('shows the head, the total, and every state of a link', () => {
    render(<LineScreen id={line} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByText('Vêtements à acheter.')).toBeInTheDocument();
    // Open links only: the stamped one is not counted.
    expect(screen.getByText(/^3\sliens · total 189\s€$/)).toBeInTheDocument();

    const open = screen.getByRole('list', { name: 'Liens de Mode' });
    // Pending: a title read from the address under its domain, and the scissors at work.
    expect(within(open).getByText('Chemise')).toBeInTheDocument();
    expect(within(open).getByText('tissage.fr')).toBeInTheDocument();
    expect(within(open).getByText('Lecture de la page…')).toBeInTheDocument();
    // Ready: the site above the title, the price with its no-break space, the facts without their labels.
    expect(within(open).getByText('Atelier Nord')).toBeInTheDocument();
    expect(within(open).getByText(/^189\s€$/)).toBeInTheDocument();
    expect(within(open).getByText('Camel')).toBeInTheDocument();
    // Failed: the reason and the way to try again.
    expect(within(open).getByText('La page refuse les robots.')).toBeInTheDocument();

    // Done: stamped, at the foot of the same list, under "Déjà faits" (one list, as on the phone).
    const rows = within(open).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[3]!).getByRole('heading', { name: 'Déjà faits · 1' })).toBeInTheDocument();
    expect(within(rows[4]!).getByRole('img', { name: /^Acheté le 10\soct\./ })).toBeInTheDocument();
  });

  it('retries a failed reading and stamps a link done, with "Annuler"', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={line} />);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(useLibraryStore.getState().links[failed]).toMatchObject({ status: 'pending', error: null });
    await user.click(within(screen.getByRole('list', { name: 'Liens de Mode' })).getAllByRole('button', { name: 'Marquer : acheté' })[0]!);
    expect(useLibraryStore.getState().links[ready]!.done).toBe(true);
    expect(screen.getByRole('heading', { name: 'Déjà faits · 2' })).toBeInTheDocument();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Tamponné « Acheté »', action: { label: 'Annuler' } });
  });

  it('puts a stamped link back to do with "Annuler", its row filed rather than remade', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={line} />);
    const list = screen.getByRole('list', { name: 'Liens de Mode' });
    const row = within(list).getByRole('link', { name: /^Veste en laine bouillie, Atelier Nord, 189/ }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Marquer : acheté' }));
    // The same row, now under "Déjà faits": moved, not mounted again, so its stamp is pressed in.
    const rows = within(list).getAllByRole('listitem');
    expect(rows.indexOf(row)).toBeGreaterThan(rows.findIndex(item => within(item).queryByRole('heading')));
    expect(within(row).getByRole('img', { name: /^Acheté le/ })).toHaveClass('stampLanding');

    await user.click(within(row).getByRole('button', { name: 'Remettre à faire' }));
    expect(useLibraryStore.getState().links[ready]!.done).toBe(false);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Remis à faire', action: { label: 'Annuler' } });
    // Lifted off, the stamp fades where it was before it goes.
    expect(within(row).getByRole('img', { name: /^Acheté le/ })).toHaveClass('stampLeaving');
    act(() => useUiStore.getState().snack!.action!.run());
    expect(useLibraryStore.getState().links[ready]).toMatchObject({ done: true });
  });

  it('puts a link back to do from its page too, with "Annuler"; several pictures get dots', async () => {
    const user = userEvent.setup();
    updateLink(done, { imageIds: ['image-a', 'image-b'] });
    render(<LinkPanel id={done} onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'Image 1 sur 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remettre à faire' }));
    expect(useLibraryStore.getState().links[done]!.done).toBe(false);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Remis à faire', action: { label: 'Annuler' } });
    act(() => useUiStore.getState().snack!.action!.run());
    expect(useLibraryStore.getState().links[done]!.done).toBe(true);
    expect(screen.getByRole('button', { name: 'Remettre à faire' })).toBeInTheDocument();
  });

  it('names a link nobody could read as its row does, and says its reading was tried, not done', () => {
    updateLink(failed, { analyzedAt: Date.UTC(2026, 9, 12, 9) });
    render(<LinkPanel id={failed} onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sac' })).toBeInTheDocument();
    expect(screen.getByText('boutique-fermee.fr')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://boutique-fermee.fr/sac' })).toBeInTheDocument();
    expect(screen.getByText(/ · lecture tentée le 12\soct\./)).toBeInTheDocument();
    expect(screen.queryByText(/ · lu le /)).not.toBeInTheDocument();
  });

  it('shows a link kept unread by a title read from its address and its domain, with "Lire la page" only when the server reads links', async () => {
    const user = userEvent.setup();
    setReading(false);
    const unread = addLink('https://www.maille-et-fil.fr/bonnet-cotes?utm_source=x', { noteId: line });
    const { unmount } = render(<LineScreen id={line} />);
    const open = screen.getByRole('list', { name: 'Liens de Mode' });
    expect(within(open).getByText('Bonnet cotes')).toBeInTheDocument();
    expect(within(open).getByText('maille-et-fil.fr')).toBeInTheDocument();
    expect(within(open).queryByRole('button', { name: /^Lire / })).not.toBeInTheDocument();
    // Retrying a failed reading means nothing either while reading is off.
    expect(within(open).queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
    unmount();
    setReading(true);
    render(<LineScreen id={line} />);
    await user.click(screen.getByRole('button', { name: 'Lire Bonnet cotes' }));
    expect(useLibraryStore.getState().links[unread]!.status).toBe('pending');
  });

  it('never shows a reading that cannot end: pending with no server is a plain link', () => {
    setServer(null);
    render(<LineScreen id={line} />);
    const open = screen.getByRole('list', { name: 'Liens de Mode' });
    expect(within(open).queryByText('Lecture de la page…')).not.toBeInTheDocument();
    expect(within(open).getByText('tissage.fr')).toBeInTheDocument();
  });

  it('adds a link straight into the collection, read by the server where it stays', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={line} />);
    await user.type(screen.getByRole('textbox', { name: 'Ajouter un lien à Mode' }), 'https://www.exemple.fr/pull?utm_source=x{Enter}');
    const links = Object.values(useLibraryStore.getState().links).filter(link => link.url === 'https://www.exemple.fr/pull');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ noteId: line, autoFile: false, status: 'pending' });
  });

  it('says a link is in the collection already, and adds one from another collection with its reading', async () => {
    const user = userEvent.setup();
    const cadeaux = createLine({ title: 'Cadeaux' });
    render(<LineScreen id={cadeaux} />);
    const field = screen.getByRole('textbox', { name: 'Ajouter un lien à Cadeaux' });
    await user.type(field, 'https://www.atelier-nord.fr/veste?fbclid=z{Enter}');
    expect(useUiStore.getState().snack?.message).toBe('Ce lien est déjà dans Mode : ajouté ici aussi');
    const copy = useLibraryStore.getState().linksByNote[cadeaux]![0]!;
    expect(useLibraryStore.getState().links[copy]).toMatchObject({ status: 'ready', title: 'Veste en laine bouillie', price: 189, filedBy: 'person' });
    expect(within(screen.getByRole('list', { name: 'Liens de Cadeaux' })).getByText('Atelier Nord')).toBeInTheDocument();

    await user.type(field, 'https://www.atelier-nord.fr/veste{Enter}');
    expect(useUiStore.getState().snack?.message).toBe('Ce lien est déjà dans cette collection');
    expect(useLibraryStore.getState().linksByNote[cadeaux]).toEqual([copy]);
  });

  it('changes the collection’s emblem, name and sentence, never its code', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={line} />);
    await user.click(screen.getByRole('button', { name: 'Modifier la collection' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier la collection' });
    expect(within(dialog).getByRole('radio', { name: 'Fleur' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('radio', { name: 'Oiseau' }));
    const name = within(dialog).getByRole('textbox', { name: 'Nom' });
    await user.clear(name);
    await user.type(name, 'Garde-robe');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(useLibraryStore.getState().notes[line]).toMatchObject({ title: 'Garde-robe', emblem: 'oiseau', code: 'M', color: 'magenta' });
    expect(screen.getByRole('heading', { level: 1, name: 'Garde-robe' })).toBeInTheDocument();
  });
});

describe('collections', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('pins every collection with what it holds, "Non classé" last', () => {
    const mode = createLine({ id: 'line-mode', title: 'Mode', hint: 'Vêtements à acheter.' });
    updateLink(addLink('https://www.exemple.fr/veste', { noteId: mode }), { price: 120, currency: 'EUR' });
    render(<LinesScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Collections' })).toBeInTheDocument();
    expect(screen.getByText(/^Claude lit chaque lien que vous enregistrez/)).toBeInTheDocument();
    const tiles = screen.getAllByRole('link');
    expect(tiles.map(tile => tile.getAttribute('aria-label'))).toEqual(['Mode, 1 lien', 'Non classé, 0 lien']);
    expect(within(tiles[0]!).getByText(/^1\slien · 120\s€$/)).toBeInTheDocument();
    // Wide, the dashed sheet at the end of the wall is the one way in (a phone's top bar keeps its pebble).
    expect(screen.getAllByRole('button', { name: 'Nouvelle collection' })).toHaveLength(1);
  });

  it('makes a suggested collection in one click, or one of your own with the next free emblem', async () => {
    const user = userEvent.setup();
    const made: string[] = [];
    const { rerender } = render(<NewLineDialog open onDismiss={() => {}} onCreated={id => made.push(id)} />);
    expect(screen.getByText(/^Une collection rassemble des liens du même genre/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer la collection Films & séries' }));
    expect(getRecord('note', 'line-films')!.fields).toMatchObject({ kind: 'links', title: 'Films & séries', code: 'F', emblem: 'etoile', color: 'yellow' });

    rerender(<NewLineDialog open={false} onDismiss={() => {}} onCreated={id => made.push(id)} />);
    rerender(<NewLineDialog open onDismiss={() => {}} onCreated={id => made.push(id)} />);
    // A suggestion already made is no longer offered.
    expect(screen.queryByRole('button', { name: 'Créer la collection Films & séries' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle collection' });
    expect(within(dialog).getByRole('radio', { name: 'Feuille' })).toHaveAttribute('aria-checked', 'true');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Cadeaux');
    await user.type(within(dialog).getByRole('textbox', { name: 'Ce qui va dans cette collection' }), 'Idées de cadeaux pour les proches');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la collection' }));
    expect(useLibraryStore.getState().notes[made[1]!]).toMatchObject({ title: 'Cadeaux', code: 'C', emblem: 'feuille', hint: 'Idées de cadeaux pour les proches' });
  });
});
