import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { collectionTemplate, kindTemplateId, presetFields, templateSignature } from '@unlease/notes/services/templates';
import { TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';

import { freshLibrary } from '@test/library';
import { addLink, createLine, saveCollectionFacts, saveTemplate, updateLink } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { setReading } from '../../app/store/prefs';
import { setServer } from '@shared/app/store/settings';
import { setSyncState } from '@shared/app/store/syncStatus';
import { useUiStore } from '@shared/app/store/ui';
import { initHistory, navigate } from '@shared/ui/router';
import { LinkPanel } from '../features/links/LinkPanel';
import { FactsEditScreen } from '../screens/FactsEditScreen';
import { FactsScreen } from '../screens/FactsScreen';
import { LineScreen } from '../screens/LineScreen';

const WINE: TemplateField[] = [
  { id: 'domain', name: 'Domaine', type: 'text', hint: 'Le domaine ou le château' },
  { id: 'vintage', name: 'Millésime', type: 'number', hint: 'L’année de la vendange' },
  { id: 'grapes', name: 'Cépages', type: 'list', hint: '' },
];

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const state = () => useLibraryStore.getState();
const own = (lineId: string) => collectionTemplate(state().linkTemplates, state().notes[lineId]);
const at = (path: string): void => history.replaceState({ index: 0 }, '', path);
/** The facts' names as their lines read them. */
const factNames = (): string[] => within(screen.getByRole('list', { name: 'Informations' })).getAllByRole('listitem').map(item => item.getAttribute('aria-label') ?? '');

describe('a collection’s « Ce que Claude relève »', () => {
  let wines: string;
  let link: string;

  beforeEach(async () => {
    await freshLibrary();
    initHistory();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    setReading(true);
    wines = createLine({ title: 'Vins' });
    link = addLink('https://cave.example.org/chablis', { noteId: wines });
    // Read by its kind, the collection noting Claude's usual facts.
    updateLink(link, { status: 'ready', title: 'Chablis 2021', kind: 'product', readWith: null, attributes: [{ label: 'Marque', value: 'Laroche' }] });
    at(`/notes/facts/${wines}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens from the collection’s menu, never on « Non classé »', async () => {
    const { unmount } = render(<LineScreen id={wines} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ce que Claude relève' }));
    await waitFor(() => expect(location.pathname).toBe(`/notes/facts/${wines}`));
    unmount();

    render(<LineScreen id={INBOX_ID} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    expect(screen.queryByRole('menuitem', { name: 'Ce que Claude relève' })).toBeNull();
  });

  it('says Claude’s usual facts are noted, and the kinds its links have with theirs', async () => {
    render(<FactsEditScreen part={wines} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ce que Claude relève' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sur les liens de Vins/ })).toBeInTheDocument();
    const choices = screen.getByRole('radiogroup', { name: 'Ce que Claude relève' });
    expect(within(choices).getByRole('radio', { name: /^Les informations habituelles/ })).toHaveAttribute('aria-checked', 'true');
    // Its links are products: the product's usual facts, opening them.
    const usual = screen.getByRole('region', { name: 'Types de liens ici' });
    const product = within(usual).getByRole('button', { name: /^Article/ });
    expect(product).toHaveTextContent('Marque, Couleur, Taille(s), Matière, Modèle, Disponibilité');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.click(product);
    expect(location.pathname).toBe('/notes/facts/kind-product');
  });

  it('takes its own facts, starting from its links’ usual ones, changed in place and saved whole, undoably', async () => {
    render(<FactsEditScreen part={wines} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Les informations de cette collection/ }));
    // Its links' kind's usual facts, to change rather than write from nothing.
    expect(factNames()).toEqual(['Marque', 'Couleur', 'Taille(s)', 'Matière', 'Modèle', 'Disponibilité']);
    // A fact reads as one line, and opens in place.
    const brand = screen.getByRole('button', { name: /^Marque/ });
    expect(brand).toHaveAttribute('aria-expanded', 'false');
    expect(brand).toHaveTextContent('La marque ou le fabricant');
    await userEvent.click(brand);
    expect(brand).toHaveAttribute('aria-expanded', 'true');
    const name = screen.getByLabelText('Nom de l’information');
    await userEvent.clear(name);
    await userEvent.type(name, 'Domaine');
    await userEvent.click(screen.getByRole('button', { name: 'Réponse' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'plusieurs valeurs' }));
    // Removing the others, then one added from nothing, and a suggestion in one press.
    for (const other of ['Couleur', 'Taille(s)', 'Matière', 'Modèle', 'Disponibilité']) {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${other.replace(/[()]/g, '\\$&')}`) }));
      await userEvent.click(screen.getByRole('button', { name: 'Supprimer l’information' }));
    }
    expect(factNames()).toEqual(['Domaine']);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une information' }));
    expect(screen.getByLabelText('Nom de l’information')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Nom de l’information'), 'Millésime');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter « Année »' }));
    expect(factNames()).toEqual(['Domaine', 'Millésime', 'Année']);

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const template = own(wines)!;
    expect(template.name).toBe('Vins');
    expect(template.fields.map(field => [field.name, field.type])).toEqual([
      ['Domaine', 'list'],
      ['Millésime', 'text'],
      ['Année', 'number'],
    ]);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Informations enregistrées', action: { label: 'Annuler' } });
    // Its link was noted before: the well offers to note it again.
    expect(await screen.findByText(/^1\slien lu avant ce changement · environ 0,04 \$ pour le relire$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));
    expect(state().links[link]!.status).toBe('pending');
  }, 30_000);

  it('keeps a fact with a problem open, and saves nothing until it is named', async () => {
    saveCollectionFacts(wines, WINE);
    render(<FactsEditScreen part={wines} />);
    await userEvent.click(screen.getByRole('button', { name: /^Domaine/ }));
    await userEvent.clear(screen.getByLabelText('Nom de l’information'));
    // Another fact opened: the unnamed one stays open, and the save says why.
    await userEvent.click(screen.getByRole('button', { name: /^Cépages/ }));
    expect(screen.getAllByLabelText('Nom de l’information')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Nommez cette information.')).toBeInTheDocument();
    expect(own(wines)!.fields).toEqual(WINE);
  });

  it('moves facts by the keys, the focus staying where it was', async () => {
    saveCollectionFacts(wines, WINE);
    render(<FactsEditScreen part={wines} />);
    expect(factNames()).toEqual(['Domaine', 'Millésime', 'Cépages']);
    screen.getByRole('button', { name: /^Cépages/ }).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(factNames()).toEqual(['Domaine', 'Cépages', 'Millésime']);
    expect(screen.getByRole('button', { name: /^Cépages/ })).toHaveFocus();
    expect(screen.getByText('Cépages : position 2 sur 3')).toBeInTheDocument();
  });

  it('goes back to Claude’s usual facts: its list goes with it, undoably', async () => {
    saveCollectionFacts(wines, WINE);
    const template = own(wines)!.id;
    render(<FactsEditScreen part={wines} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Les informations habituelles/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(own(wines)).toBeNull();
    expect(state().linkTemplates[template]!.deletedAt).not.toBeNull();
    act(() => useUiStore.getState().snack!.action!.run());
    expect(own(wines)!.id).toBe(template);
  });

  it('says when its list is noted on other collections too', () => {
    saveCollectionFacts(wines, WINE);
    const cellar = createLine({ title: 'Cave' });
    useLibraryStore.setState(s => ({ notes: { ...s.notes, [cellar]: { ...s.notes[cellar]!, templateId: own(wines)!.id } } }));
    render(<FactsEditScreen part={wines} />);
    expect(screen.getByText('Aussi relevées sur les liens de Cave.')).toBeInTheDocument();
  });

  it('stops at eight facts and says so', () => {
    saveCollectionFacts(
      wines,
      Array.from({ length: 8 }, (_, index) => ({ id: `f${index + 1}`, name: `Information ${index + 1}`, type: 'text' as const, hint: '' })),
    );
    render(<FactsEditScreen part={wines} />);
    expect(screen.getByText('8 informations au plus.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une information' })).toBeNull();
    expect(screen.queryByText('Suggestions')).toBeNull();
  });

  it('asks before leaving with changes', async () => {
    render(<FactsEditScreen part={wines} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Les informations de cette collection/ }));
    act(() => navigate('/notes'));
    expect(await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' })).toBeInTheDocument();
    expect(location.pathname).toBe(`/notes/facts/${wines}`);
  });

  it('previews its facts on one of its links, every fact listed, a dash for none, nothing written', async () => {
    saveCollectionFacts(wines, WINE);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith(TEMPLATE_TRY_PATH)) {
        const body = JSON.parse(String(init?.body)) as { url: string; fields: TemplateField[] };
        expect(body.url).toBe('https://cave.example.org/chablis');
        expect(body.fields.map(field => field.name)).toEqual(['Domaine', 'Millésime', 'Cépages']);
        return json({ title: 'Chablis premier cru', values: { domain: 'Domaine Laroche', vintage: '2021' }, costUsd: 0.004 });
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<FactsEditScreen part={wines} />);
    const panel = screen.getByRole('region', { name: 'Aperçu sur un lien' });
    expect(within(panel).getByRole('button', { name: 'Lien' })).toHaveTextContent('Chablis 2021');
    await userEvent.click(within(panel).getByRole('button', { name: 'Essayer' }));
    expect(await within(panel).findByText('Chablis premier cru')).toBeInTheDocument();
    expect(within(panel).getByText('Domaine Laroche')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Rien trouvé')).toHaveTextContent('—');
    expect(own(wines)!.fields).toEqual(WINE);
  });

  it('follows an old address naming its list to the collection', async () => {
    saveCollectionFacts(wines, WINE);
    const template = own(wines)!.id;
    at(`/notes/templates/${template}`);
    render(<FactsEditScreen part={template} />);
    await waitFor(() => expect(location.pathname).toBe(`/notes/facts/${wines}`));
  });
});

describe('a kind’s usual facts', () => {
  beforeEach(async () => {
    await freshLibrary();
    initHistory();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    setReading(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('changes them, and goes back to Claude’s, undoably', async () => {
    saveTemplate({ id: null, name: '', kind: 'book', fields: [WINE[0]!] });
    render(<FactsEditScreen part="kind-book" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Informations habituelles · Livre' })).toBeInTheDocument();
    expect(screen.getByText('Claude les relève sur chaque lien qu’il reconnaît comme « Livre », sauf dans une collection qui a les siennes.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir celles de Claude' }));
    expect(state().linkTemplates[kindTemplateId('book')]!.deletedAt).not.toBeNull();
    // The page follows: Claude's facts, nothing to save.
    expect(factNames()).toEqual(['Auteur', 'Éditeur', 'Année', 'Pages']);
    expect(screen.queryByRole('button', { name: 'Rétablir celles de Claude' })).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Informations de Claude rétablies', action: { label: 'Annuler' } });
    act(() => useUiStore.getState().snack!.action!.run());
    expect(factNames()).toEqual(['Domaine']);
  });

  it('says the server’s refusal, and offers nothing without Claude or offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Budget Claude du mois atteint' }, 402)));
    const { unmount } = render(<FactsEditScreen part="kind-film" />);
    let panel = screen.getByRole('region', { name: 'Aperçu sur un lien' });
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Adresse' }), 'https://example.org/film');
    await userEvent.click(within(panel).getByRole('button', { name: 'Essayer' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/Budget|Le serveur a répondu 402/);
    unmount();

    act(() => setSyncState({ phase: 'offline', message: 'Serveur injoignable' }));
    const offline = render(<FactsEditScreen part="kind-film" />);
    panel = screen.getByRole('region', { name: 'Aperçu sur un lien' });
    expect(within(panel).getByText('Serveur injoignable')).toBeInTheDocument();
    offline.unmount();

    // Without a key, no try at all.
    setReading(false);
    render(<FactsEditScreen part="kind-film" />);
    expect(screen.queryByRole('region', { name: 'Aperçu sur un lien' })).not.toBeInTheDocument();
  }, 20_000);
});

describe('the overview, and a link’s page', () => {
  let wines: string;
  let link: string;

  beforeEach(async () => {
    await freshLibrary();
    initHistory();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    setReading(true);
    wines = createLine({ title: 'Vins' });
    link = addLink('https://cave.example.org/chablis', { noteId: wines });
    updateLink(link, { status: 'ready', title: 'Chablis 2021', kind: 'product', readWith: null });
  });

  it('lists the collections with their own facts, then every kind’s usual ones', async () => {
    saveCollectionFacts(wines, WINE);
    saveTemplate({ id: null, name: '', kind: 'recipe', fields: [...presetFields('recipe'), { id: 'veggie', name: 'Végétarien', type: 'yesno', hint: '' }] });
    render(<FactsScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ce que Claude relève' })).toBeInTheDocument();
    const collections = screen.getByRole('region', { name: 'Collections qui ont les leurs' });
    expect(within(collections).getByRole('button', { name: /^Vins/ })).toHaveTextContent('Domaine, Millésime, Cépages');
    const kinds = screen.getByRole('region', { name: 'Informations habituelles, par type de lien' });
    // Every kind but « Lien », in the kinds' order, their facts after their name; a changed one says so.
    expect(within(kinds).getAllByRole('button')).toHaveLength(12);
    expect(within(kinds).getByRole('button', { name: /^Film/ })).toHaveTextContent('Réalisateur, Année, Durée, Genre, Note');
    expect(within(kinds).getByRole('button', { name: /^Recette/ })).toHaveTextContent('Temps total, Portions, Difficulté, Végétarien · Modifiées');
    await userEvent.click(within(collections).getByRole('button', { name: /^Vins/ }));
    expect(location.pathname).toBe(`/notes/facts/${wines}`);
  });

  it('says on the link’s page it was noted before its facts changed, and opens its collection’s', async () => {
    saveCollectionFacts(wines, WINE);
    render(<LinkPanel id={link} onClose={() => {}} />);
    expect(screen.getByText('Lu avant le dernier changement de ses informations.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ce que Claude relève' }));
    await waitFor(() => expect(location.pathname).toBe(`/notes/facts/${wines}`));
  });

  it('reads as current a link noted with the facts it has now', () => {
    saveCollectionFacts(wines, WINE);
    updateLink(link, { readWith: templateSignature(WINE) });
    render(<LinkPanel id={link} onClose={() => {}} />);
    expect(screen.queryByText('Lu avant le dernier changement de ses informations.')).toBeNull();
  });
});
