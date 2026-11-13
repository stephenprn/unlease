/**
 * Pages' import on the web (`PagesImport`): a Notion export dropped as its .zip, its pages previewed
 * in the tree's order and left out by their boxes, then written under a new page of their own, the
 * picture attached after and the whole taken back by the slip's « Annuler »; Markdown files
 * imported again adding nothing. And « Effacer des données »'s parts, erased in one batch.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { zipSync, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pagesEraseParts } from '@unlease/pages/services/erase';
import { freshLibrary } from '@test/library';
import { useUiStore } from '@shared/app/store/ui';
import { pagesLibrary } from '../../app/store/blocks';
import { createPage, erasePages } from '../../app/store/pages';
import { PagesImport } from '../features/importing/PagesImport';

const V = '0'.repeat(31) + '1';
const L = '0'.repeat(31) + '2';

const notionZip = (): File =>
  new File(
    [
      zipSync({
        [`Voyage ${V}.md`]: strToU8(`# Voyage\n\nVoir [Lisbonne](Voyage%20${V}/Lisbonne%20${L}.md).\n\n![carte.png](Voyage%20${V}/carte.png)\n`),
        [`Voyage ${V}/carte.png`]: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
        [`Voyage ${V}/Lisbonne ${L}.md`]: strToU8('# Lisbonne\n\n- [ ] Réserver'),
        [`Voyage ${V}/Guide.html`]: strToU8('<html></html>'),
      }) as BlobPart,
    ],
    'Export-abc.zip',
    { type: 'application/zip' },
  );

/** The same export with everything in one top folder, as some exports and folders zipped by hand are. */
const rootedZip = (): File =>
  new File(
    [
      zipSync({
        [`Export-abc/Voyage ${V}.md`]: strToU8(`# Voyage\n\n![carte.png](Voyage%20${V}/carte.png)\n`),
        [`Export-abc/Voyage ${V}/carte.png`]: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
      }) as BlobPart,
    ],
    'Export-abc.zip',
    { type: 'application/zip' },
  );

const pagesNamed = (title: string) => Object.values(pagesLibrary().blocks).filter(block => block.kind === 'page' && block.text === title && block.deletedAt === null);

describe('Pages’ import', () => {
  beforeEach(async () => {
    await freshLibrary();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  it('previews a Notion export page by page, then writes it under a new page, its picture attached, and takes it back', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    render(<PagesImport onImported={onImported} />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), notionZip());

    expect(await screen.findByRole('heading', { name: 'Ce que contient le fichier' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Les pages de l’export' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map(item => item.querySelector('.t-body')?.textContent);
    expect(titles).toEqual(['Voyage', 'Lisbonne', 'Guide.html']);
    expect(within(list).getAllByText('Dans Voyage')).toHaveLength(2);
    expect(within(list).getByText(/Markdown & CSV/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByRole('radio', { name: /Sous une nouvelle page/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Importer 2\u00a0pages' }));

    expect(await screen.findByRole('heading', { name: 'Import terminé' })).toBeInTheDocument();
    const container = pagesNamed('Import Notion du ' + new Date().getDate() + ' ' + ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][new Date().getMonth()])[0]!;
    const voyage = pagesNamed('Voyage')[0]!;
    expect(voyage.parentId).toBe(container.id);
    expect(pagesNamed('Lisbonne')[0]!.parentId).toBe(voyage.id);
    const picture = Object.values(pagesLibrary().blocks).find(block => block.kind === 'image' && block.parentId === voyage.id)!;
    await waitFor(() => expect(pagesLibrary().blocks[picture.id]!.fileId).not.toBeNull());
    expect(screen.getByText('1 image ou fichier joint')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();

    // The slip takes the whole import back.
    useUiStore.getState().snack?.action?.run();
    expect(pagesNamed('Voyage')).toHaveLength(0);
    expect(pagesLibrary().blocks[container.id]!.deletedAt).not.toBeNull();
  });

  it('keeps a picture when everything sits in one folder', async () => {
    const user = userEvent.setup();
    render(<PagesImport />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), rootedZip());
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: /^Importer 1\spage$/ }));
    expect(await screen.findByRole('heading', { name: 'Import terminé' })).toBeInTheDocument();
    const voyage = pagesNamed('Voyage')[0]!;
    const picture = Object.values(pagesLibrary().blocks).find(block => block.kind === 'image' && block.parentId === voyage.id)!;
    await waitFor(() => expect(pagesLibrary().blocks[picture.id]!.fileId).not.toBeNull());
    expect(screen.queryByText(/Ce fichier est vide/)).not.toBeInTheDocument();
  });

  it('takes the pages’ icons from Notion’s HTML export dropped beside the Markdown one, each archive in its own folder', async () => {
    const user = userEvent.setup();
    const header = (icon: string, title: string): Uint8Array =>
      strToU8(`<html><body><article id="1d0c5e2a" class="page sans"><header><div class="page-header-icon undefined">${icon}</div><h1 class="page-title">${title}</h1></header><div class="page-body"></div></article></body></html>`);
    const markdown = new File(
      [
        zipSync({
          [`Export-3f6b/Voyage ${V}.md`]: strToU8(`# Voyage\n\n![carte.png](Voyage%20${V}/carte.png)\n`),
          [`Export-3f6b/Voyage ${V}/carte.png`]: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
          [`Export-3f6b/Voyage ${V}/Lisbonne ${L}.md`]: strToU8('# Lisbonne\n\nLe tram.'),
        }) as BlobPart,
      ],
      'Export-3f6b.zip',
      { type: 'application/zip' },
    );
    const html = new File(
      [
        zipSync({
          [`Export-7c1d/Voyage ${V}.html`]: header('<span class="icon">🌍</span>', 'Voyage'),
          [`Export-7c1d/Voyage ${V}/Lisbonne ${L}.html`]: header(`<img class="icon" src="Lisbonne%20${L}/tram.png"/>`, 'Lisbonne'),
          [`Export-7c1d/Voyage ${V}/Lisbonne ${L}/tram.png`]: new Uint8Array([137, 80, 78, 71, 4]),
        }) as BlobPart,
      ],
      'Export-7c1d.zip',
      { type: 'application/zip' },
    );
    render(<PagesImport />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), [markdown, html]);

    const list = await screen.findByRole('list', { name: 'Les pages de l’export' });
    const titles = within(list)
      .getAllByRole('listitem')
      .map(item => item.querySelector('.t-body')?.textContent);
    expect(titles).toEqual(['🌍 Voyage', 'Lisbonne']);
    expect(within(list).getByText(/icône est une image/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Importer 2 pages' }));
    expect(await screen.findByRole('heading', { name: 'Import terminé' })).toBeInTheDocument();
    const voyage = pagesNamed('Voyage')[0]!;
    expect(voyage.icon).toBe('🌍');
    expect(pagesNamed('Lisbonne')[0]!.icon).toBeNull();
    // The picture's bytes found under its own archive's folder.
    const picture = Object.values(pagesLibrary().blocks).find(block => block.kind === 'image' && block.parentId === voyage.id)!;
    await waitFor(() => expect(pagesLibrary().blocks[picture.id]!.fileId).not.toBeNull());
  });

  it('leaves a page out with its sub-pages, and adds nothing when the same files come again', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PagesImport />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), [new File(['# Recettes\n\nTarte'], 'Recettes.md', { type: 'text/markdown' }), new File(['Une idée'], 'Idée.md', { type: 'text/markdown' })]);
    await user.click(await screen.findByRole('checkbox', { name: 'Importer Idée' }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('radio', { name: /En haut de l’arborescence/ }));
    await user.click(screen.getByRole('button', { name: 'Importer 1\u00a0page' }));
    await screen.findByRole('heading', { name: 'Import terminé' });
    expect(pagesNamed('Recettes')[0]!.parentId).toBeNull();
    expect(pagesNamed('Idée')).toHaveLength(0);
    unmount();

    render(<PagesImport />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), new File(['# Recettes\n\nTarte'], 'Recettes.md', { type: 'text/markdown' }));
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('radio', { name: /En haut de l’arborescence/ }));
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByText('Déjà là')).toBeInTheDocument();
  });

  it('says why a file is refused, and stays on its first step', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<PagesImport />);
    await user.upload(screen.getByLabelText('Export de Notion ou fichiers Markdown'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('photo.jpg : Ni une archive .zip, ni un fichier Markdown ou CSV.');
  });
});

describe('erasing Pages’ data', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('erases the pages and keeps the journal, in one batch', () => {
    const voyage = createPage({ title: 'Voyage' });
    createPage({ parentId: voyage, title: 'Lisbonne' });
    const journal = createPage({ title: 'Journal' });
    createPage({ parentId: journal, title: 'Lundi 2 novembre 2026' });
    expect(pagesEraseParts(pagesLibrary()).map(part => part.count)).toEqual([2, 2]);
    expect(erasePages(new Set(['pages']))).toBe(2);
    expect(pagesNamed('Voyage')).toHaveLength(0);
    expect(pagesNamed('Journal')).toHaveLength(1);
  });
});
