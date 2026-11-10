import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { kindTemplateId, presetFields, templateSignature } from '@unlease/notes/services/templates';
import { TEMPLATE_TRY_PATH } from '@unlease/notes/sync/templateTry';

import { freshLibrary } from '@test/library';
import { addLink, createLine, saveTemplate, setCollectionTemplate, updateLink } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { setReading } from '../../app/store/prefs';
import { setServer } from '@shared/app/store/settings';
import { setSyncState } from '@shared/app/store/syncStatus';
import { useUiStore } from '@shared/app/store/ui';
import { initHistory, navigate } from '@shared/ui/router';
import { LinkPanel } from '../features/links/LinkPanel';
import { LineScreen } from '../screens/LineScreen';
import { TemplateScreen } from '../screens/TemplateScreen';
import { TemplatesScreen } from '../screens/TemplatesScreen';

const WINE: TemplateField[] = [
  { id: 'domain', name: 'Domaine', type: 'text', hint: 'Le domaine ou le château' },
  { id: 'vintage', name: 'Millésime', type: 'number', hint: 'L’année de la vendange' },
  { id: 'grapes', name: 'Cépages', type: 'list', hint: '' },
];

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const templates = () => useLibraryStore.getState().linkTemplates;
const at = (path: string): void => history.replaceState({ index: 0 }, '', path);

describe('« Modèles de fiche »', () => {
  let wines: string;
  let wine: string;

  beforeEach(async () => {
    await freshLibrary();
    initHistory();
    at('/notes/templates');
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    setReading(true);
    wines = createLine({ title: 'Vins' });
    wine = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }).id;
    setCollectionTemplate(wines, wine);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the person’s own, then every kind’s, with what each notes', async () => {
    saveTemplate({ id: null, name: '', kind: 'recipe', fields: [...presetFields('recipe'), { id: 'veggie', name: 'Végétarien', type: 'yesno', hint: '' }] });
    render(<TemplatesScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Modèles de fiche' })).toBeInTheDocument();
    expect(screen.getByText('Ce que Claude relève sur les liens que vous gardez.')).toBeInTheDocument();
    const own = screen.getByRole('region', { name: 'Vos modèles' });
    expect(within(own).getByRole('button', { name: /^Vin\s?3\schamps · Vins$/ })).toBeInTheDocument();
    expect(within(own).getByRole('button', { name: 'Nouveau modèle' })).toBeInTheDocument();
    const kinds = screen.getByRole('region', { name: 'Par type de lien' });
    // Every kind but « Lien », in the kinds' order, their fields after their name; a changed one says so.
    expect(within(kinds).getAllByRole('button')).toHaveLength(12);
    expect(within(kinds).getByRole('button', { name: /^Film/ })).toHaveTextContent('Réalisateur, Année, Durée, Genre, Note');
    expect(within(kinds).getByRole('button', { name: /^Recette/ })).toHaveTextContent('Temps total, Portions, Difficulté, Végétarien · Modifié');

    await userEvent.click(within(kinds).getByRole('button', { name: /^Recette/ }));
    expect(location.pathname).toBe('/notes/templates/kind-recipe');
  });

  it('makes a new one: its name first, fields typed or picked among the common ones, saved whole', async () => {
    at('/notes/templates/new');
    const { unmount } = render(<TemplateScreen part="new" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Nouveau modèle' })).toBeInTheDocument();
    expect(screen.getByText('Aucun champ : Claude ne relèvera que le titre, le résumé et le prix.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du modèle')).toHaveFocus();

    // Saved without a name or a named field: every problem at once, nothing written.
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un champ' }));
    expect(screen.getByLabelText('Nom du champ 1')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Donnez-lui un nom.')).toBeInTheDocument();
    expect(screen.getByText('Nommez ce champ.')).toBeInTheDocument();
    expect(screen.getByText('2 champs sont à corriger.')).toBeInTheDocument();
    expect(Object.keys(templates())).toEqual([wine]);

    await userEvent.type(screen.getByLabelText('Nom du modèle'), 'Plante');
    await userEvent.type(screen.getByLabelText('Nom du champ 1'), 'Exposition');
    await userEvent.type(screen.getByLabelText('Ce qu’il faut y mettre, champ 1'), 'Soleil, mi-ombre ou ombre');
    // A common field in one press, its type and what it holds with it.
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le champ « Marque »' }));
    expect(screen.getByLabelText('Nom du champ 2')).toHaveValue('Marque');
    expect(screen.queryByRole('button', { name: 'Ajouter le champ « Marque »' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const made = Object.values(templates()).find(template => template.name === 'Plante')!;
    expect(made.fields).toEqual([
      { id: 'f1', name: 'Exposition', type: 'text', hint: 'Soleil, mi-ombre ou ombre' },
      { id: 'brand', name: 'Marque', type: 'text', hint: 'La marque ou le fabricant' },
    ]);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle enregistré', tone: 'success' });
    // The editor goes on with the template saved, at its own address.
    expect(location.pathname).toBe(`/notes/templates/${made.id}`);
    unmount();
  }, 20_000);

  it('chooses a new one for the collection it was made from', async () => {
    at(`/notes/templates/new?for=${wines}`);
    render(<TemplateScreen part="new" />);
    expect(screen.getByText('Lu sur les liens de Vins une fois enregistré.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nom du modèle'), 'Grand vin');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le champ « Marque »' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const made = Object.values(templates()).find(template => template.name === 'Grand vin')!;
    expect(useLibraryStore.getState().notes[wines]!.templateId).toBe(made.id);
  });

  it('moves, retypes and deletes fields, by the menu and by the keys', async () => {
    at(`/notes/templates/${wine}`);
    render(<TemplateScreen part={wine} />);
    expect(screen.getByText('Lu sur les liens de Vins.')).toBeInTheDocument();
    const names = () => screen.getAllByRole('textbox', { name: /^Nom du champ \d$/ }).map(input => (input as HTMLInputElement).value);
    expect(names()).toEqual(['Domaine', 'Millésime', 'Cépages']);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Actions de « Domaine »' }));
    expect(screen.getByRole('menuitem', { name: 'Monter' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Descendre' }));
    expect(names()).toEqual(['Millésime', 'Domaine', 'Cépages']);

    // Alt+↓ from anywhere in a row, the focus staying where it was.
    const grapes = screen.getByLabelText('Nom du champ 3');
    grapes.focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(names()).toEqual(['Millésime', 'Cépages', 'Domaine']);
    expect(screen.getByDisplayValue('Cépages')).toHaveFocus();
    expect(screen.getByText('Cépages : position 2 sur 3')).toBeInTheDocument();

    // The type from the app's menu: its glyph and its name in the field.
    await userEvent.click(screen.getByRole('button', { name: 'Type du champ 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Texte · Quelques mots' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions de « Domaine »' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer le champ' }));
    expect(names()).toEqual(['Millésime', 'Cépages']);

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(templates()[wine]!.fields).toEqual([
      { id: 'vintage', name: 'Millésime', type: 'text', hint: 'L’année de la vendange' },
      { id: 'grapes', name: 'Cépages', type: 'list', hint: '' },
    ]);
  }, 20_000);

  it('stops at eight fields and says so', async () => {
    saveTemplate({ id: wine, name: 'Vin', kind: null, fields: Array.from({ length: 8 }, (_, index) => ({ id: `f${index + 1}`, name: `Champ ${index + 1}`, type: 'text' as const, hint: '' })) });
    render(<TemplateScreen part={wine} />);
    expect(screen.getByText('8 champs au plus.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un champ' })).toBeNull();
    expect(screen.queryByText('Champs courants')).toBeNull();
  });

  it('asks before leaving with changes', async () => {
    at(`/notes/templates/${wine}`);
    render(<TemplateScreen part={wine} />);
    await userEvent.type(screen.getByLabelText('Nom du modèle'), ' blanc');
    act(() => navigate('/notes'));
    expect(await screen.findByRole('alertdialog', { name: 'Abandonner les modifications ?' })).toBeInTheDocument();
    expect(location.pathname).toBe(`/notes/templates/${wine}`);
  });

  it('sets a kind’s template back to its preset, undoably', async () => {
    saveTemplate({ id: null, name: '', kind: 'book', fields: [WINE[0]!] });
    render(<TemplateScreen part="kind-book" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Livre' })).toBeInTheDocument();
    expect(screen.getByText('Pour les liens que Claude reconnaît comme « Livre ».')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir l’original' }));
    expect(templates()[kindTemplateId('book')]!.deletedAt).not.toBeNull();
    // The editor follows: the preset's fields, nothing to save.
    expect(screen.getAllByRole('textbox', { name: /^Nom du champ \d$/ }).map(input => (input as HTMLInputElement).value)).toEqual(['Auteur', 'Éditeur', 'Année', 'Pages']);
    expect(screen.queryByRole('button', { name: 'Rétablir l’original' })).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle d’origine rétabli', action: { label: 'Annuler' } });
    act(() => useUiStore.getState().snack!.action!.run());
    expect(templates()[kindTemplateId('book')]!.deletedAt).toBeNull();
    expect(screen.getByLabelText('Nom du champ 1')).toHaveValue('Domaine');
  });

  it('deletes one of the person’s own from its menu, undoably', async () => {
    at(`/notes/templates/${wine}`);
    render(<TemplateScreen part={wine} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer le modèle' }));
    expect(templates()[wine]!.deletedAt).not.toBeNull();
    // The editor stays as it was until the list is on screen.
    expect(screen.queryByText('Ce modèle n’existe plus')).toBeNull();
    await waitFor(() => expect(location.pathname).toBe('/notes/templates'));
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle supprimé', action: { label: 'Annuler' } });
  });

  it('tries the fields on one of its links and lists every field, a dash for none', async () => {
    const link = addLink('https://cave.example.org/chablis', { noteId: wines });
    updateLink(link, { status: 'ready', title: 'Chablis 2021', readWith: templateSignature(WINE) });
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
    render(<TemplateScreen part={wine} />);
    const panel = screen.getByRole('region', { name: 'Essayer' });
    expect(within(panel).getByRole('button', { name: 'Lien' })).toHaveTextContent('Chablis 2021');
    await userEvent.click(within(panel).getByRole('button', { name: 'Essayer' }));
    const result = await within(panel).findByText('Chablis premier cru');
    expect(result).toBeInTheDocument();
    expect(within(panel).getByText('Domaine Laroche')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Rien trouvé')).toHaveTextContent('—');
    expect(within(panel).getByText(/^Lu en [\d,]+\ss · 0,004\s\$$/)).toBeInTheDocument();
    // Nothing written.
    expect(templates()[wine]!.fields).toEqual(WINE);
  });

  it('says the server’s refusal, and offers nothing without Claude or offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Budget Claude du mois atteint' }, 402)));
    const { unmount } = render(<TemplateScreen part="kind-film" />);
    let panel = screen.getByRole('region', { name: 'Essayer' });
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Adresse' }), 'https://example.org/film');
    await userEvent.click(within(panel).getByRole('button', { name: 'Essayer' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/Budget|Le serveur a répondu 402/);
    unmount();

    act(() => setSyncState({ phase: 'offline', message: 'Serveur injoignable' }));
    const offline = render(<TemplateScreen part="kind-film" />);
    panel = screen.getByRole('region', { name: 'Essayer' });
    expect(within(panel).getByText('Serveur injoignable')).toBeInTheDocument();
    offline.unmount();

    setReading(false);
    render(<TemplateScreen part="kind-film" />);
    panel = screen.getByRole('region', { name: 'Essayer' });
    expect(within(panel).getByText('Claude n’est pas configuré : l’essai n’est pas possible.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Essayer' })).toBeNull();
  }, 20_000);
});

describe('a collection’s « Modèle de fiche », and a link read with another version', () => {
  let wines: string;
  let wine: string;
  let link: string;

  beforeEach(async () => {
    await freshLibrary();
    initHistory();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
    setReading(true);
    wines = createLine({ title: 'Vins' });
    wine = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE }).id;
    link = addLink('https://cave.example.org/chablis', { noteId: wines });
    // Read by kind, before the collection had its template.
    updateLink(link, { status: 'ready', title: 'Chablis 2021', kind: 'product', readWith: null, attributes: [{ label: 'Marque', value: 'Laroche' }] });
  });

  it('is chosen from the collection’s menu, at once and undoably, never on « Non classé »', async () => {
    render(<LineScreen id={wines} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Modèle de fiche' }));
    const picker = screen.getByRole('radiogroup', { name: 'Modèle de fiche' });
    expect(within(picker).getByRole('radio', { name: /^Selon le type de lien/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(picker).getByRole('radio', { name: /^Vin\s?3\schamps$/ }));
    expect(useLibraryStore.getState().notes[wines]!.templateId).toBe(wine);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Modèle choisi', action: { label: 'Annuler' } });

    // Its links read with another version: the well over the rows offers to read them again.
    expect(await screen.findByText(/^1\slien lu avec une autre version · environ 0,04 \$ pour le relire$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));
    expect(useLibraryStore.getState().links[link]!.status).toBe('pending');
  });

  it('has no picker on « Non classé »', async () => {
    render(<LineScreen id={INBOX_ID} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    expect(screen.queryByRole('menuitem', { name: 'Modèle de fiche' })).toBeNull();
  });

  it('says on the link’s page that it was read with another version, and opens the template it reads with', async () => {
    setCollectionTemplate(wines, wine);
    render(<LinkPanel id={link} onClose={() => {}} />);
    expect(screen.getByText('Lu avec une version précédente de la fiche.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Plus d’actions' })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Modifier la fiche' }));
    await waitFor(() => expect(location.pathname).toBe(`/notes/templates/${wine}`));
  });

  it('reads as current a link read with the template it has now', () => {
    setCollectionTemplate(wines, wine);
    updateLink(link, { readWith: templateSignature(WINE) });
    render(<LinkPanel id={link} onClose={() => {}} />);
    expect(screen.queryByText('Lu avec une version précédente de la fiche.')).toBeNull();
  });
});
