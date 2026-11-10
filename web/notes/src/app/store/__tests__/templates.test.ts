import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { collectionTemplate, kindTemplateId, linksReadBefore, presetFields } from '@unlease/notes/services/templates';

import { freshLibrary } from '@test/library';
import { addLink, createLine, deleteTemplate, resetKindTemplate, saveTemplate, setCollectionTemplate, updateLink } from '../actions';
import { useLibraryStore } from '../library';
import { getRecord } from '@shared/app/store/records';
import { addField, moveField, ownTemplates, templateKey, templatePart } from '../../templates';

const WINE: TemplateField[] = [
  { id: 'domain', name: 'Domaine', type: 'text', hint: 'Le domaine ou le château' },
  { id: 'vintage', name: 'Millésime', type: 'number', hint: '' },
];

const templates = () => useLibraryStore.getState().linkTemplates;

describe('link templates, as library writes', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('saves one of the person’s own whole, its words trimmed, and its undo takes it back', () => {
    const { id, undo } = saveTemplate({ id: null, name: '  Vin ', kind: null, fields: [{ ...WINE[0]!, name: ' Domaine ' }, WINE[1]!] });
    const saved = templates()[id]!;
    expect(saved).toMatchObject({ name: 'Vin', kind: null, deletedAt: null });
    expect(saved.fields.map(field => field.name)).toEqual(['Domaine', 'Millésime']);
    expect(ownTemplates(templates()).map(template => template.id)).toEqual([id]);
    undo();
    expect(templates()[id]!.deletedAt).not.toBeNull();
    expect(ownTemplates(templates())).toEqual([]);
  });

  it('keeps a kind’s changed template under the kind’s fixed id, and its preset is no record at all', () => {
    const fields = [...presetFields('recipe'), { id: 'veggie', name: 'Végétarien', type: 'yesno' as const, hint: '' }];
    const { id } = saveTemplate({ id: null, name: 'ignored', kind: 'recipe', fields });
    expect(id).toBe(kindTemplateId('recipe'));
    expect(templates()[id]).toMatchObject({ name: '', kind: 'recipe', deletedAt: null });
    expect(templates()[id]!.fields).toHaveLength(4);

    // Saved back to what the preset says: the record goes, the preset reads again.
    saveTemplate({ id: null, name: '', kind: 'recipe', fields: presetFields('recipe') });
    expect(templates()[id]!.deletedAt).not.toBeNull();
    // Nothing changed and nothing stored: nothing written.
    const { undo } = saveTemplate({ id: null, name: '', kind: 'film', fields: presetFields('film') });
    expect(getRecord('linkTemplate', kindTemplateId('film'))).toBeUndefined();
    undo();
  });

  it('sets a kind’s template back to its preset, undoably, and writes it again under the same id', () => {
    saveTemplate({ id: null, name: '', kind: 'book', fields: [WINE[0]!] });
    const undo = resetKindTemplate('book');
    expect(templates()[kindTemplateId('book')]!.deletedAt).not.toBeNull();
    undo();
    expect(templates()[kindTemplateId('book')]!.deletedAt).toBeNull();
    resetKindTemplate('book');
    // Edited again later: the same record, live again.
    saveTemplate({ id: null, name: '', kind: 'book', fields: WINE });
    expect(templates()[kindTemplateId('book')]).toMatchObject({ deletedAt: null });
    expect(templates()[kindTemplateId('book')]!.fields.map(field => field.id)).toEqual(['domain', 'vintage']);
  });

  it('gives a collection one of the person’s own, never « Non classé », and a deleted one reads as none', () => {
    const line = createLine({ title: 'Vins' });
    const { id } = saveTemplate({ id: null, name: 'Vin', kind: null, fields: WINE });
    const undo = setCollectionTemplate(line, id);
    expect(useLibraryStore.getState().notes[line]!.templateId).toBe(id);
    expect(collectionTemplate(templates(), useLibraryStore.getState().notes[line])?.id).toBe(id);
    setCollectionTemplate(INBOX_ID, id);
    expect(useLibraryStore.getState().notes[INBOX_ID]!.templateId ?? null).toBeNull();

    const back = deleteTemplate(id);
    // The collection keeps the id: it simply reads by kind again.
    expect(useLibraryStore.getState().notes[line]!.templateId).toBe(id);
    expect(collectionTemplate(templates(), useLibraryStore.getState().notes[line])).toBeNull();
    back();
    expect(collectionTemplate(templates(), useLibraryStore.getState().notes[line])?.id).toBe(id);
    undo();
    expect(useLibraryStore.getState().notes[line]!.templateId ?? null).toBeNull();
  });

  it('chooses a new template for the collection it was made from, in the same batch, and takes both back', () => {
    const line = createLine({ title: 'Plantes' });
    const { id, undo } = saveTemplate({ id: null, name: 'Plante', kind: null, fields: [WINE[0]!] }, { forCollection: line });
    expect(useLibraryStore.getState().notes[line]!.templateId).toBe(id);
    expect(getRecord('note', line)!.clocks.templateId).toBe(getRecord('linkTemplate', id)!.clocks.name);
    undo();
    expect(useLibraryStore.getState().notes[line]!.templateId ?? null).toBeNull();
    expect(templates()[id]!.deletedAt).not.toBeNull();
  });

  it('finds the links read with another version once a template changes', () => {
    const line = createLine({ title: 'Recettes' });
    const read = addLink('https://example.org/tarte', { noteId: line });
    updateLink(read, { status: 'ready', kind: 'recipe', readWith: null });
    const of = () => linksReadBefore({ id: kindTemplateId('recipe'), kind: 'recipe' }, Object.values(useLibraryStore.getState().links), useLibraryStore.getState().notes, templates());
    // Read before templates: with the presets, which still read.
    expect(of()).toEqual([]);
    saveTemplate({ id: null, name: '', kind: 'recipe', fields: [...presetFields('recipe'), { id: 'f9', name: 'Végétarien', type: 'yesno', hint: '' }] });
    expect(of().map(link => link.id)).toEqual([read]);
  });
});

describe('the editor’s fields', () => {
  it('moves a field within the list', () => {
    const fields = [...WINE, { id: 'region', name: 'Région', type: 'text' as const, hint: '' }];
    expect(moveField(fields, 'region', 0).map(field => field.id)).toEqual(['region', 'domain', 'vintage']);
    expect(moveField(fields, 'domain', 9).map(field => field.id)).toEqual(['vintage', 'region', 'domain']);
  });

  it('adds a suggestion with its own id unless the template uses it, eight at most', () => {
    const renamed = [{ id: 'servings', name: 'Pour', type: 'text' as const, hint: '' }];
    const added = addField(renamed, { id: 'servings', name: 'Portions', type: 'text', hint: '' });
    expect(added.fields.map(field => field.id)).toEqual(['servings', 'f2']);
    const blank = addField(WINE);
    expect(blank.fields[2]).toEqual({ id: 'f3', name: '', type: 'text', hint: '' });
    const eight = Array.from({ length: 8 }, (_, index) => ({ id: `f${index + 1}`, name: `Champ ${index + 1}`, type: 'text' as const, hint: '' }));
    expect(addField(eight).id).toBeNull();
  });

  it('reads the editor’s address both ways', () => {
    expect(templateKey('new')).toEqual({ kind: 'new' });
    expect(templateKey('kind-recipe')).toEqual({ kind: 'kind', linkKind: 'recipe' });
    // « Lien » has no template of its own: an address naming it is read as an id, which no template has.
    expect(templateKey('kind-other')).toEqual({ kind: 'own', id: 'kind-other' });
    expect(templatePart({ id: 'x', kind: 'film' })).toBe('kind-film');
    expect(templatePart({ id: 'abc', kind: null })).toBe('abc');
  });
});
