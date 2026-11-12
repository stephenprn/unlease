import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createId } from '@unlease/core/services/ids';
import { blankDraft } from '@unlease/calendar/services/editing';
import { longDay } from '@unlease/calendar/services/eventText';
import { addDays, instantToDay, weekdayOf } from '@unlease/calendar/services/time';
import { contactFields } from '@unlease/contacts/sync/entities';
import { linkFields } from '@unlease/notes/sync/entities';

import { freshLibrary } from '@test/library';
import { getRecord, writeLocal } from '@shared/app/store/records';
import { setQuery } from '@shared/app/store/search';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { planImport } from '@unlease/calendar/services/importing';
import { readImportFiles } from '../../app/importFiles';
import { addEvent, applyImport } from '../../app/store/actions';
import { openQuick, setImportFiles } from '../../app/store/calendarUi';
import { useCalendarStore } from '../../app/store/library';
import { calendarModule } from '../../module';
import { parseCalendarRoute } from '../routes';

const state = () => useCalendarStore.getState();
const today = (): string => instantToDay(Date.now());

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

function person(first: string, birthday: string | null, phone: string | null): string {
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
        phones: phone ? [{ id: 'p1', number: phone, kind: 'mobile', label: '' }] : [],
        emails: [],
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

describe('Agenda’s places', () => {
  it('reads its addresses', () => {
    expect(parseCalendarRoute('/agenda')).toEqual({ name: 'agenda', view: null, day: null });
    expect(parseCalendarRoute('/agenda/week/2026-11-02')).toEqual({ name: 'agenda', view: 'week', day: '2026-11-02' });
    expect(parseCalendarRoute('/agenda/3days/2026-11-02')).toEqual({ name: 'agenda', view: 'threeDays', day: '2026-11-02' });
    expect(parseCalendarRoute('/agenda/year/2027')).toEqual({ name: 'agenda', view: 'year', day: '2027-01-01' });
    expect(parseCalendarRoute('/agenda/event/abc')).toEqual({ name: 'agendaEvent', id: 'abc' });
    expect(parseCalendarRoute('/agenda/event/abc/edit')).toEqual({ name: 'agendaEdit', id: 'abc' });
    expect(parseCalendarRoute('/agenda/birthday/xyz')).toEqual({ name: 'agendaBirthday', id: 'xyz' });
    expect(parseCalendarRoute('/agenda/nowhere')).toBeNull();
  });
});

describe('Agenda’s web app', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    setQuery('');
    vi.restoreAllMocks();
  });

  it('draws the week with its events, and opens one in its popover', async () => {
    const user = userEvent.setup();
    const day = today();
    addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:30`, 'Europe/Paris'), title: 'Dentiste', place: 'Cabinet Roux' });
    addEvent({ ...blankDraft(day, addDays(day, 2), ''), title: 'Congrès' });
    open(`/agenda/week/${day}`);
    render(<App />);
    const dentist = await screen.findByRole('button', { name: /^Dentiste,/ });
    expect(screen.getByRole('button', { name: /^Congrès,/ })).toBeInTheDocument();
    await user.click(dentist);
    const peek = await screen.findByRole('dialog', { name: 'Dentiste' });
    expect(within(peek).getByText('Cabinet Roux')).toBeInTheDocument();
    await user.click(within(peek).getByRole('button', { name: 'Plus d’actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Dupliquer' })).toBeInTheDocument();
  });

  it('makes an event from a few words, through its form', async () => {
    const user = userEvent.setup();
    open(`/agenda/month/${today()}`);
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Ajouter en quelques mots' }), 'Dîner chez Paul demain 20h{Enter}');
    await waitFor(() => expect(location.pathname).toBe('/agenda/new'));
    expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveValue('Dîner chez Paul');
    // The link pasted loses its tracking, as Carnet's links do.
    await user.type(screen.getByRole('textbox', { name: 'Lien' }), 'https://www.example.org/soiree?utm_source=mail&id=4');
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Lien' })).toHaveValue('https://www.example.org/soiree?id=4');
    // The end typed as one says it.
    const end = screen.getByRole('combobox', { name: 'Heure de fin' });
    await user.click(end);
    await user.keyboard('{Control>}a{/Control}21h30{Enter}');
    await user.click(screen.getAllByRole('button', { name: 'Enregistrer' }).at(-1)!);
    const [made] = Object.values(state().events);
    expect(made).toMatchObject({ title: 'Dîner chez Paul', start: `${addDays(today(), 1)}T20:00`, end: `${addDays(today(), 1)}T21:30`, url: 'https://www.example.org/soiree?id=4' });
    expect(new Set(Object.values(getRecord('calendarEvent', made!.id)!.clocks)).size).toBe(1);
  });

  it('names the Carnet link an event comes from once the sync brings it, though the form opened first', async () => {
    const link = createId();
    open(`/agenda/new?title=FOSDEM%202027&start=2027-01-30&end=2027-02-01&link=${link}`);
    render(<App />);
    const description = screen.getByRole('textbox', { name: 'Description' });
    expect(description).toHaveValue('@Indisponible ici');
    act(() => {
      writeLocal([
        {
          type: 'link',
          id: link,
          patch: linkFields({
            noteId: 'inbox',
            url: 'https://fosdem.org/2027/',
            status: 'ready',
            autoFile: false,
            filedBy: null,
            lang: 'fr',
            title: 'FOSDEM 2027',
            summary: '',
            siteName: 'Fosdem',
            kind: 'other',
            price: null,
            currency: null,
            attributes: [],
            imageIds: [],
            imageUrl: null,
            done: false,
            doneAt: null,
            comment: '',
            position: 'a0',
            error: null,
            analyzedAt: Date.now(),
            createdAt: Date.now(),
            deletedAt: null,
            copy: null,
          }),
        },
      ]);
    });
    await waitFor(() => expect(description).toHaveValue('@FOSDEM 2027'));
  });

  it('says an end before the start under it rather than saving, and asks before what was typed is left', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 3);
    open(`/agenda/new?start=${day}T10:00&end=${day}T11:00`);
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Titre' }), 'Atelier');
    // The end's day moved before the start's: said at once, under the end.
    await user.click(screen.getByRole('button', { name: /^Jour de fin/ }));
    const picker = await screen.findByRole('dialog', { name: 'Jour de fin' });
    await user.click(within(picker).getByRole('button', { name: longDay(addDays(today(), 1)) }));
    const problem = 'La fin vient avant le début : choisissez un jour ou une heure de fin plus tard.';
    expect(await screen.findByText(problem)).toBeInTheDocument();
    // « Enregistrer » saves nothing: it says so, and the end takes the focus.
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(Object.values(state().events)).toHaveLength(0);
    expect(screen.getByText('Un champ est à corriger.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Jour de fin/ })).toHaveFocus();
    // « Annuler » with a title typed asks first; « Continuer à modifier » keeps it all.
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' });
    await user.click(within(ask).getByRole('button', { name: 'Continuer à modifier' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(location.pathname).toBe('/agenda/new');
    expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveValue('Atelier');
  });

  it('builds a custom repeat in its dialog, its count said when it cannot be, without saving the event under it', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 3);
    open(`/agenda/new?start=${day}T10:00&end=${day}T11:00`);
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Répétition/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Personnaliser/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Répétition personnalisée' });
    const every = within(dialog).getByRole('textbox', { name: 'Tous les' });
    await user.clear(every);
    await user.type(every, '0');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(within(dialog).getByText('Un nombre de 1 à 999.')).toBeInTheDocument();
    expect(every).toHaveFocus();
    await user.clear(every);
    await user.type(every, '2');
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Répétition personnalisée' })).not.toBeInTheDocument());
    // The event is still being written: the dialog's OK saved only its rule.
    expect(Object.values(state().events)).toHaveLength(0);
    expect(location.pathname).toBe('/agenda/new');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(Object.values(state().events)).toHaveLength(1));
    expect(Object.values(state().events)[0]!.rrule).toContain('INTERVAL=2');
  });

  it('asks which events of a series a change is for, and makes an exception for one', async () => {
    const user = userEvent.setup();
    const monday = addDays(today(), (1 - weekdayOf(today()) + 7) % 7);
    const id = addEvent({ ...blankDraft(`${monday}T09:00`, `${monday}T10:00`, 'Europe/Paris'), title: 'Sport', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    const second = `${addDays(monday, 7)}T09:00`;
    open(`/agenda/event/${id}/edit?at=${encodeURIComponent(second)}`);
    render(<App />);
    const title = screen.getByRole('textbox', { name: 'Titre' });
    await user.clear(title);
    await user.type(title, 'Sport (salle B)');
    await user.click(screen.getAllByRole('button', { name: 'Enregistrer' }).at(-1)!);
    const dialog = await screen.findByRole('dialog', { name: 'Modifier un événement périodique' });
    await user.click(within(dialog).getByRole('radio', { name: 'Cet événement' }));
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.values(state().events)).toHaveLength(2));
    const exception = Object.values(state().events).find(event => event.recurringId === id)!;
    expect(exception).toMatchObject({ title: 'Sport (salle B)', originalStart: second, rrule: '' });
    expect(state().events[id]!.title).toBe('Sport');
  });

  it('imports a calendar file once', async () => {
    const ics = ['BEGIN:VCALENDAR', 'X-WR-CALNAME:Perso', 'BEGIN:VEVENT', 'UID:a@example.org', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261226', 'SUMMARY:Noël', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const file = new File([ics], 'perso.ics', { type: 'text/calendar' });
    const plan = async () => planImport((await readImportFiles([file])).files, Object.values(state().events), Date.now());
    const first = await readImportFiles([file, new File(['bonjour'], 'notes.txt')]);
    expect(first.files.map(each => each.calendar.name)).toEqual(['Perso']);
    expect(first.refused).toEqual([{ name: 'notes.txt', why: 'Ce fichier ne se lit pas comme un agenda.' }]);
    expect(applyImport(await plan())).toBe(1);
    const again = await plan();
    expect(again.creates).toHaveLength(0);
    expect(again.skipped).toBe(1);
  });

  it('leads the import’s old address to Réglages’ wizard', async () => {
    open('/agenda/import');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Votre agenda Google' })).toBeInTheDocument();
    expect(location.pathname).toBe('/agenda/settings/import');
  });

  it('imports through its wizard: the preview, the choices, the report, taken back on its slip or later', async () => {
    const user = userEvent.setup();
    const ics = [
      'BEGIN:VCALENDAR',
      'X-WR-CALNAME:Perso',
      'BEGIN:VEVENT',
      'UID:a@example.org',
      'DTSTART;VALUE=DATE:20261224',
      'DTEND;VALUE=DATE:20261226',
      'SUMMARY:Noël',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b@example.org',
      'DTSTART;VALUE=DATE:20200101',
      'SUMMARY:Jour de l’an 2020',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:c@example.org',
      'STATUS:CANCELLED',
      'DTSTART;VALUE=DATE:20261231',
      'SUMMARY:Réveillon annulé',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const file = new File([ics], 'perso.ics', { type: 'text/calendar' });
    const live = () => Object.values(state().events).filter(event => event.deletedAt === null && event.trashedAt === null);
    open('/agenda/settings/import');
    render(<App />);
    // A file dropped anywhere lands on the preview.
    act(() => setImportFiles([file]));
    expect(await screen.findByRole('heading', { name: 'Ce que contient le fichier' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Les événements du fichier' });
    expect(within(list).getByText('Annulé dans le fichier')).toBeInTheDocument();
    // The old one left out by its box.
    await user.click(within(list).getByRole('checkbox', { name: 'Importer Jour de l’an 2020' }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('heading', { name: 'Vos choix' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nom du libellé' })).toHaveValue('Perso');
    expect(screen.getByRole('button', { name: /^Importer 1\s+événement$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /À venir seulement/ }));
    await user.click(screen.getByRole('button', { name: /^Importer 1\s+événement$/ }));
    expect(await screen.findByRole('heading', { name: 'Import terminé' })).toBeInTheDocument();
    expect(live().map(event => event.title)).toEqual(['Noël']);
    const label = Object.values(state().labels).find(each => each.name === 'Perso')!;
    expect(live()[0]!.labelIds).toEqual([label.id]);
    expect(screen.getByRole('button', { name: 'Voir l’agenda' })).toBeInTheDocument();
    // Taken back whole on its slip: nothing in the bin, the label gone too, and the file comes again.
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(Object.values(state().events).filter(event => event.deletedAt === null)).toHaveLength(0);
    expect(state().labels[label.id]!.deletedAt).not.toBeNull();

    applyImport(planImport((await readImportFiles([file])).files, Object.values(state().events), Date.now()));
    await user.click(screen.getByRole('button', { name: 'Importer un autre fichier' }));
    act(() => setImportFiles([file]));
    expect(await screen.findByText(/^2\s+événements de ce fichier dans votre agenda$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer ces événements' }));
    const dialog = await screen.findByRole('alertdialog', { name: /^Retirer 2\s+événements \?$/ });
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    expect(live()).toHaveLength(0);
    expect(Object.values(state().events).filter(event => event.deletedAt === null && event.trashedAt !== null)).toHaveLength(2);
    expect(screen.getByText(/^2\s+événements placés dans la corbeille$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(live()).toHaveLength(2);
  });

  it('erases the parts chosen, its subscriptions kept', () => {
    const own = addEvent({ ...blankDraft(`${today()}T10:00`, `${today()}T11:00`, 'Europe/Paris'), title: 'Dentiste' });
    writeLocal([{ type: 'calendarFeed', id: 'club', patch: { kind: 'ics', name: 'Club', url: 'https://example.org/club.ics', color: 'sage', hidden: false, position: 'a0', refreshedAt: null, error: '', createdAt: 1, deletedAt: null } }]);
    const parts = calendarModule.erase!.parts();
    expect(parts.map(part => [part.id, part.count])).toEqual([
      ['events', 1],
      ['imported', 0],
      ['subscriptions', 1],
      ['labels', 0],
    ]);
    expect(calendarModule.erase!.run(new Set(['events']))).toBe(1);
    expect(state().events[own]!.deletedAt).not.toBeNull();
    expect(state().feeds.club!.deletedAt).toBeNull();
  });

  it('shows a contact’s birthday with the ways to wish it', async () => {
    const day = addDays(today(), 3);
    const id = person('Léa', `1991-${day.slice(5)}`, '06 12 34 56 78');
    open(`/agenda/birthday/${id}`);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Léa Martin' })).toBeInTheDocument();
    // jsdom's browser speaks en-US, and « 06 » starts no American number: its country unknown, no WhatsApp.
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:0612345678');
    expect(screen.getByText(new RegExp(`Anniversaire de Léa Martin \\(${Number(day.slice(0, 4)) - 1991} ans\\)`))).toBeInTheDocument();
    // Contacts' order: the ways to reach them first, then Contacts, then a gift idea.
    const opens = screen.getByRole('button', { name: 'Ouvrir dans Contacts' });
    expect(screen.getByRole('link', { name: 'Appeler' }).compareDocumentPosition(opens) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('restores from the bin with « Annuler », and asks before deleting for good', async () => {
    const user = userEvent.setup();
    const id = addEvent({ ...blankDraft(`${today()}T10:00`, `${today()}T11:00`, 'Europe/Paris'), title: 'Dentiste' });
    writeLocal([{ type: 'calendarEvent', id, patch: { trashedAt: Date.now() } }]);
    open('/agenda/trash');
    render(<App />);
    expect(await screen.findByText('Dentiste')).toBeInTheDocument();
    // Nothing goes for good before it is asked.
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement Dentiste' }));
    const asked = await screen.findByRole('alertdialog', { name: 'Supprimer définitivement ?' });
    expect(useCalendarStore.getState().events[id]!.deletedAt).toBeNull();
    await user.click(within(asked).getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Restaurer' }));
    expect(useCalendarStore.getState().events[id]!.trashedAt).toBeNull();
    expect(await screen.findByText('Événement restauré')).toBeInTheDocument();
  });

  it('offers « Afficher plus » on the planning only while something lies further, never under its empty state', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 400);
    open(`/agenda/schedule/${day}`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Rien de prévu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument();
    act(() => {
      addEvent({ ...blankDraft(`${addDays(day, 2)}T10:00`, `${addDays(day, 2)}T11:00`, 'Europe/Paris'), title: 'Atelier' });
      addEvent({ ...blankDraft(`${addDays(day, 100)}T10:00`, `${addDays(day, 100)}T11:00`, 'Europe/Paris'), title: 'Concert' });
    });
    expect(await screen.findByText('Atelier')).toBeInTheDocument();
    expect(screen.queryByText('Concert')).not.toBeInTheDocument();
    // Pressed, it reaches what lies further at once, however far; then nothing lies further.
    await user.click(screen.getByRole('button', { name: 'Afficher plus' }));
    expect(await screen.findByText('Concert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument();
  });

  it('makes an event from the quick form with its place, people and description, in one batch', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 2);
    const lea = person('Léa', null, null);
    open(`/agenda/week/${day}`);
    render(<App />);
    act(() => openQuick({ start: `${day}T10:00`, end: `${day}T11:30`, anchor: { left: 0, top: 0, width: 100, height: 40 } }));
    const quick = await screen.findByRole('dialog', { name: 'Nouvel événement' });
    await user.type(within(quick).getByRole('textbox', { name: 'Titre' }), 'Café');
    // Each line opens into its field, the caret in it.
    await user.click(within(quick).getByRole('button', { name: 'Ajouter un lieu' }));
    expect(within(quick).getByRole('combobox', { name: 'Lieu' })).toHaveFocus();
    await user.keyboard('Le Perchoir');
    await user.click(within(quick).getByRole('button', { name: 'Ajouter des personnes' }));
    await user.keyboard('Léa{Enter}');
    await user.click(within(quick).getByRole('button', { name: 'Ajouter une description' }));
    await user.keyboard('Le livre.');
    await user.click(within(quick).getByRole('button', { name: 'Enregistrer' }));
    const [made] = Object.values(state().events);
    expect(made).toMatchObject({ title: 'Café', place: 'Le Perchoir', contactIds: [lea], description: 'Le livre.', start: `${day}T10:00`, end: `${day}T11:30` });
    expect(new Set(Object.values(getRecord('calendarEvent', made!.id)!.clocks)).size).toBe(1);
  });

  it('closes an open time list on Escape, never the quick form around it', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 2);
    open(`/agenda/week/${day}`);
    render(<App />);
    act(() => openQuick({ start: `${day}T10:00`, end: `${day}T11:30`, anchor: { left: 0, top: 0, width: 100, height: 40 } }));
    const quick = await screen.findByRole('dialog', { name: 'Nouvel événement' });
    const end = within(quick).getByRole('combobox', { name: 'Heure de fin' });
    await user.click(end);
    expect(end).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(end).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog', { name: 'Nouvel événement' })).toBeInTheDocument();
    // The list closed, the next Escape is the form's: nothing typed, it goes.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nouvel événement' })).not.toBeInTheDocument());
  });

  it('carries what the quick form holds to « Plus d’options », people included, and asks before it is left', async () => {
    const user = userEvent.setup();
    const day = addDays(today(), 2);
    person('Léa', null, null);
    open(`/agenda/week/${day}`);
    render(<App />);
    act(() => openQuick({ start: `${day}T10:00`, end: `${day}T11:30`, anchor: { left: 0, top: 0, width: 100, height: 40 } }));
    const quick = await screen.findByRole('dialog', { name: 'Nouvel événement' });
    await user.type(within(quick).getByRole('textbox', { name: 'Titre' }), 'Atelier');
    await user.click(within(quick).getByRole('button', { name: 'Ajouter des personnes' }));
    await user.keyboard('Léa{Enter}');
    await user.click(within(quick).getByRole('button', { name: 'Plus d’options' }));
    await waitFor(() => expect(location.pathname).toBe('/agenda/new'));
    expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveValue('Atelier');
    expect(screen.getByRole('list', { name: 'Avec' })).toHaveTextContent('Léa Martin');
    // Nothing changed here yet, but what was typed there is not lost by a slip either.
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' })).toBeInTheDocument();
    expect(Object.values(state().events)).toHaveLength(0);
  });

  it('finds events from the search box', async () => {
    addEvent({ ...blankDraft(`${today()}T18:00`, `${today()}T19:00`, 'Europe/Paris'), title: 'Cours de piano', place: 'Conservatoire' });
    open('/agenda');
    render(<App />);
    act(() => setQuery('conserv'));
    expect(await screen.findByText('Cours de piano')).toBeInTheDocument();
  });
});
