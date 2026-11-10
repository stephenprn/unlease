import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { addCheck, addLink, createLabel, createLine, createNote, setPinned, trashNotes } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { setOnboarded } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { layoutWall, wallGeometry, WALL_TOP } from '../features/board/wallLayout';
import { initHistory } from '@shared/ui/router';
import { useNotesUiStore } from '@notes/app/store/notesUi';

describe('the board', () => {
  beforeEach(async () => {
    await freshLibrary();
    history.replaceState(null, '', '/');
    initHistory();
    setOnboarded();
  });

  it('shows pinned notes, then the others, with their checklists, labels and the collection tabs', () => {
    const perso = createLabel('Perso');
    const courses = createNote({ kind: 'checklist', title: 'Courses samedi', pinned: true, labelIds: [perso] });
    addCheck(courses, 'Lait d’avoine');
    createNote({ kind: 'text', title: 'Vélo', body: 'Pneu arrière à changer' });
    const films = createLine({ title: 'Films & séries', id: 'line-films' });
    setPinned(films, true);
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Épinglées' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Autres' })).toBeInTheDocument();
    const card = screen.getByRole('link', { name: 'Courses samedi' }).closest('article')!;
    expect(within(card).getByText('Lait d’avoine')).toBeInTheDocument();
    expect(within(card).getByText('Perso')).toBeInTheDocument();
    expect(screen.getByText('Pneu arrière à changer')).toBeInTheDocument();
    // A pinned collection comes onto the board; every collection has its tab.
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Films & séries' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Collections' })).getByRole('link', { name: /^Films & séries, 0\slien$/ })).toBeInTheDocument();
  });

  it('gives every collection a tab with its count, and ends the row with "+ Collection"', async () => {
    const user = userEvent.setup();
    const films = createLine({ title: 'Films & séries', id: 'line-films' });
    addLink('https://example.org/la-nuit', { noteId: films });
    addLink('https://example.org/le-jour', { noteId: films });
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Collections' });
    const tab = within(tabs).getByRole('link', { name: /^Films & séries, 2\sliens$/ });
    expect(within(tab).getByText('2')).toBeInTheDocument();
    // "Non classé" has no tab while it is empty.
    expect(within(tabs).queryByRole('link', { name: /^Non classé/ })).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole('button', { name: 'Nouvelle collection' }));
    expect(useNotesUiStore.getState().newLineOpen).toBe(true);
  });

  it('lists the collections and the labels in the navigation', () => {
    createLine({ title: 'Restaurants', id: 'line-restos' });
    createLabel('Travail');
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Navigation' });
    expect(within(nav).getByRole('link', { name: 'Toutes les collections' })).toHaveAttribute('href', '/notes/lines');
    expect(within(nav).getByRole('link', { name: 'Restaurants' })).toHaveAttribute('href', '/notes/line/line-restos');
    expect(within(nav).getByRole('link', { name: 'Modifier les labels' })).toHaveAttribute('href', '/notes/labels');
    expect(within(nav).getByRole('link', { name: 'Travail' })).toBeInTheDocument();
  });

  it('keeps a label’s rename to a name already worn, says why under it, and lets Escape give the old one back', async () => {
    const user = userEvent.setup();
    createLabel('Maison');
    const travail = createLabel('Travail');
    history.replaceState(null, '', '/notes/labels');
    initHistory();
    render(<App />);
    const name = screen.getByRole('textbox', { name: 'Renommer Travail' });
    await user.clear(name);
    await user.type(name, 'maison{Enter}');
    expect(name).toHaveFocus();
    expect(name).toHaveValue('maison');
    expect(name).toHaveAccessibleDescription('Ce label existe déjà : choisissez un autre nom.');
    expect(useLibraryStore.getState().labels[travail]!.name).toBe('Travail');
    // A free name clears it at once, and Enter saves it.
    await user.type(name, ' du lac');
    expect(name).not.toHaveAttribute('aria-invalid');
    await user.type(name, '{Enter}');
    expect(useLibraryStore.getState().labels[travail]!.name).toBe('maison du lac');
    const renamed = screen.getByRole('textbox', { name: 'Renommer maison du lac' });
    await user.clear(renamed);
    await user.type(renamed, 'Maison{Enter}{Escape}');
    expect(renamed).toHaveValue('maison du lac');
    expect(renamed).not.toHaveAttribute('aria-invalid');
  });

  it('keeps its own bin: the notes thrown away, emptied together', async () => {
    const user = userEvent.setup();
    const note = createNote({ kind: 'text', title: 'Vieille note' });
    trashNotes([note]);
    history.replaceState(null, '', '/notes/trash');
    initHistory();
    render(<App />);
    expect(screen.getByRole('link', { name: /Vieille note/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vider la corbeille' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Vider la corbeille ?' });
    // The phone's words, for one act on both clients.
    expect(within(dialog).getByText('Toutes les notes de la corbeille seront supprimées définitivement, sur tous vos appareils.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Vider' }));
    expect(useLibraryStore.getState().notes[note]!.deletedAt).not.toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ tone: 'success' });
    expect(useUiStore.getState().snack?.message).toMatch(/^1\snote supprimée définitivement$/);
  });

  it('searches everything not in the bin and marks the matches', async () => {
    const user = userEvent.setup();
    createNote({ kind: 'text', title: 'Réparer le vélo', body: 'Chaîne et pneus' });
    createNote({ kind: 'text', title: 'Courses', body: 'Pain' });
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'velo');
    // The phone's count: the number alone, a line of meta.
    expect(screen.getByRole('heading', { name: /^1\srésultat$/ })).toBeInTheDocument();
    const mark = screen.getByText('vélo', { selector: 'mark' });
    expect(mark).toBeInTheDocument();
    expect(screen.queryByText('Pain')).not.toBeInTheDocument();
  });

  it('selects notes and acts on them from the selection bar, with "Annuler"', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'À ranger' });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Sélectionner « À ranger »' }));
    const bar = screen.getByRole('toolbar', { name: 'Notes sélectionnées' });
    expect(within(bar).getByText(/^1\ssélectionnée$/)).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Archiver' }));
    expect(useLibraryStore.getState().notes[id]!.archived).toBe(true);
    expect(screen.queryByRole('link', { name: 'À ranger' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(useLibraryStore.getState().notes[id]!.archived).toBe(false);
  });

  it('says what an empty board is for', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Le tableau est vide' })).toBeInTheDocument();
  });

  it('opens a note in the editor over the board, and closes it with Escape', async () => {
    const user = userEvent.setup();
    createNote({ kind: 'text', title: 'Ouvre-moi', body: 'Contenu' });
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Ouvre-moi' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Titre' })).toHaveValue('Ouvre-moi');
    expect(location.pathname).toMatch(/^\/notes\/note\//);
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a note started from Rappels on its reminder, as the phone does', async () => {
    const user = userEvent.setup();
    history.replaceState({ index: 0 }, '', '/notes/reminders');
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Créer une note/ }));
    const picker = await screen.findByRole('dialog', { name: 'Rappel' });
    await user.click(within(picker).getByRole('button', { name: /^Demain matin/ }));
    const created = Object.values(useLibraryStore.getState().notes).filter(note => note.kind === 'text');
    expect(created).toHaveLength(1);
    expect(created[0]!.reminderAt).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Rappel' })).not.toBeInTheDocument();
  });

  describe('under a finger', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A finger on the card at `x`, `y` (jsdom stamps events with `Date.now()`, so the clock sets the hand's speed). */
    const finger = (target: Element) => ({
      down: (x: number, y: number) => fireEvent.pointerDown(target, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y }),
      move: (x: number, y: number, ms = 16) => {
        vi.setSystemTime(Date.now() + ms);
        fireEvent.pointerMove(target, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
      },
      up: (x: number, y: number) => fireEvent.pointerUp(target, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y }),
    });

    it('picks a card with a hold, and the click the hold leaves never opens or drops it', () => {
      createNote({ kind: 'text', title: 'À garder' });
      render(<App />);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      const link = screen.getByRole('link', { name: 'À garder' });
      const hand = finger(link);
      hand.down(100, 100);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByText(/^1\ssélectionnée$/)).toBeInTheDocument();
      expect(link.closest('article')).toHaveAttribute('data-selected');
      hand.up(100, 100);
      fireEvent.click(link);
      expect(link.closest('article')).toHaveAttribute('data-selected');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('archives a card swiped past 38% of its width, with "Annuler"', async () => {
      const user = userEvent.setup();
      const id = createNote({ kind: 'text', title: 'À ranger' });
      render(<App />);
      vi.useFakeTimers({ toFake: ['Date'] });
      const hand = finger(screen.getByRole('link', { name: 'À ranger' }));
      // jsdom's 1024px window gives four 250px columns: the card goes past 95px.
      hand.down(100, 100);
      for (const x of [120, 150, 180, 210, 240]) hand.move(x, 102, 40);
      hand.up(240, 102);
      vi.useRealTimers();
      expect(useLibraryStore.getState().notes[id]!.archived).toBe(true);
      expect(screen.queryByRole('link', { name: 'À ranger' })).not.toBeInTheDocument();
      expect(screen.getByText('Note archivée')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(useLibraryStore.getState().notes[id]!.archived).toBe(false);
      expect(screen.getByRole('link', { name: 'À ranger' })).toBeInTheDocument();
    });

    it('springs a short swipe back, and leaves an upward drag to the page', () => {
      const id = createNote({ kind: 'text', title: 'Reste là' });
      render(<App />);
      vi.useFakeTimers({ toFake: ['Date'] });
      const link = screen.getByRole('link', { name: 'Reste là' });
      const card = link.closest('article') as HTMLElement;
      const hand = finger(link);
      hand.down(100, 100);
      hand.move(115, 101, 50);
      hand.move(130, 101, 50);
      // It follows the finger 1:1, turning with it (3° at a full card's width).
      const [, shift, turn] = /^translateX\((.+)px\) rotate\((.+)deg\)$/.exec(card.style.transform)!;
      expect(Number(shift)).toBe(30);
      expect(Number(turn)).toBeCloseTo((30 / parseFloat(card.style.width)) * 3, 4);
      hand.up(130, 101);
      expect(card.style.transform).toBe('');
      expect(useLibraryStore.getState().notes[id]!.archived).toBe(false);

      hand.down(100, 100);
      hand.move(104, 140);
      hand.move(180, 160);
      expect(card.style.transform).toBe('');
      hand.up(180, 160);
      expect(useLibraryStore.getState().notes[id]!.archived).toBe(false);
    });
  });

  it('leaves room above untitled first cards, so they never touch the header', () => {
    const id = createNote({ kind: 'text', title: 'Seule' });
    const geometry = wallGeometry(960, 'wall');
    const untitled = layoutWall([{ key: 'others', title: null, ids: [id] }], useLibraryStore.getState(), geometry);
    expect(untitled.items[0]).toMatchObject({ kind: 'card', top: WALL_TOP });
    const titled = layoutWall([{ key: 'pinned', title: 'Épinglées', ids: [id] }], useLibraryStore.getState(), geometry);
    expect(titled.items[0]).toMatchObject({ kind: 'section', top: 0 });
  });
});
