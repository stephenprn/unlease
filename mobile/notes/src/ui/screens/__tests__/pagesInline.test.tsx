/**
 * A page's inline pieces on the phone: a table of contents that takes the page to a heading, a date
 * read as today's words and changed in its sheet from the bar, « Dans le texte » in the insert
 * sheet, « [[ » asking for a page to cite, and « :word » offering its emoji on the bar.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@data/db/database';
import { writePreference } from '@data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage, insertBlock } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { setFocused } from '@ui/features/pages/editorStore';
import { pageMarkdown } from '@ui/features/pages/pageExport';
import { openPageSheet } from '@ui/features/pages/sheetStore';

jest.useFakeTimers();
jest.setSystemTime(new Date(2026, 9, 28, 10, 0));

// The preset's TextInput mock has no caret.
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection: jest.fn() });

function outermost(tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean): ReactTestInstance[] {
  return tree.root.findAll(node => match(node.props as Record<string, unknown>), { deep: false });
}

function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ');
}

const pressable = (tree: ReactTestRenderer, label: string) => outermost(tree, props => props.accessibilityLabel === label && typeof props.onPress === 'function');
const textOfBlock = (id: string): string => useLibraryStore.getState().blocks[id]?.text ?? '';

let tree: ReactTestRenderer | null = null;
const ids = { page: '', intro: '', voyage: '', hidden: '', when: '', todo: '' };

async function boot(): Promise<ReactTestRenderer> {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'pagesInline.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const page = createPage({ title: 'Voyage au Portugal' });
    const toc = insertBlock(page, page, 0, { kind: 'toc' });
    const voyage = insertBlock(page, page, 1, { kind: 'h1', text: 'Voyage' });
    const when = insertBlock(page, page, 2, { kind: 'text', text: 'Départ {@date=2026-10-29} avec {k:Ctrl+P}' });
    const toggle = insertBlock(page, page, 3, { kind: 'toggle', text: 'Détails' });
    const hidden = insertBlock(page, toggle, 0, { kind: 'h2', text: 'Le {@date=2026-11-12T0930}' });
    const todo = insertBlock(page, page, 4, { kind: 'todo', text: 'Bravo ', checked: false });
    createPage({ title: 'Lisbonne' });
    ids.page = page;
    ids.intro = toc;
    ids.voyage = voyage;
    ids.hidden = hidden;
    ids.when = when;
    ids.todo = todo;
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: ids.page });
    jest.advanceTimersByTime(400);
  });
  return tree!;
}

/** The field of the task block, as a person types in it. */
function taskField(root: ReactTestRenderer): ReactTestInstance {
  return root.root.findAll(node => node.type === TextInput && node.props.accessibilityLabel === 'À faire')[0]!;
}

async function type(root: ReactTestRenderer, before: string, after: string): Promise<void> {
  await act(async () => {
    taskField(root).props.onSelectionChange({ nativeEvent: { selection: { start: before.length, end: before.length } } });
  });
  await act(async () => {
    taskField(root).props.onChangeText(after);
  });
  await act(async () => {
    taskField(root).props.onSelectionChange({ nativeEvent: { selection: { start: after.length, end: after.length } } });
    jest.advanceTimersByTime(20);
  });
}

describe('inline pieces of a page', () => {
  beforeAll(async () => {
    await boot();
  });

  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
  });

  it('shares dates in words that stay true and keys as keys, the table of contents left out', () => {
    const markdown = pageMarkdown(ids.page);
    expect(markdown).toMatch(/^Départ 29\s+oct\.\s+2026 avec <kbd>Ctrl\+P<\/kbd>$/m);
    expect(markdown).toMatch(/## Le 12\s+nov\.\s+2026 09:30/);
    expect(markdown.startsWith('# Voyage au Portugal\n\n# Voyage\n')).toBe(true);
  });

  it('lists the headings in a table of contents, each taking the page to it', async () => {
    const root = tree!;
    const voyage = pressable(root, 'Voyage');
    // A heading in a closed toggle is listed too, its date in words that stay true.
    const hidden = outermost(root, props => typeof props.accessibilityLabel === 'string' && /^Le 12\s+nov\.\s+2026 09:30$/.test(props.accessibilityLabel) && typeof props.onPress === 'function');
    expect(voyage).toHaveLength(1);
    expect(hidden).toHaveLength(1);
    await act(async () => {
      hidden[0]!.props.onPress();
    });
    expect((navigationRef.getCurrentRoute()?.params as { block?: string } | undefined)?.block).toBe(ids.hidden);
  });

  it('shows a date as today reads it, and changes it from the bar', async () => {
    const root = tree!;
    expect(textOf(root)).toContain('Demain');
    // The caret right after the date: the bar offers to change it.
    await act(async () => {
      setFocused(ids.when, { start: 8, end: 8 });
    });
    const edit = pressable(root, 'Modifier la date');
    expect(edit).toHaveLength(1);
    await act(async () => {
      edit[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(textOf(root)).toMatch(/29\s+oct\.\s+2026/);
    await act(async () => {
      pressable(root, 'Lundi prochain')[0]!.props.onPress();
    });
    expect(textOfBlock(ids.when)).toContain('{@date=2026-11-02}');
    await act(async () => {
      pressable(root, 'Heure')[0]!.props.onPress();
    });
    expect(textOfBlock(ids.when)).toContain('{@date=2026-11-02T0900}');
    await act(async () => {
      pressable(root, 'Retirer la date')[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(textOfBlock(ids.when)).toBe('Départ avec {k:Ctrl+P}');
  });

  it('offers a date and an emoji in the text from the insert sheet', async () => {
    const root = tree!;
    await act(async () => {
      openPageSheet({ kind: 'insert', block: ids.when });
      jest.advanceTimersByTime(400);
    });
    const shown = textOf(root);
    expect(shown).toContain('Dans le texte');
    expect(shown).toContain('Aujourd’hui, à changer ensuite');
    expect(shown).toContain('Un emoji dans la phrase');
  });

  it('asks for a page to cite on « [[ », then cites it', async () => {
    const root = tree!;
    await act(async () => {
      taskField(root).props.onFocus();
    });
    await type(root, 'Bravo ', 'Bravo [');
    await type(root, 'Bravo [', 'Bravo [[');
    expect(textOf(root)).toContain('Citer une page');
    const lisbonne = pressable(root, 'Lisbonne');
    expect(lisbonne.length).toBeGreaterThan(0);
    await act(async () => {
      lisbonne[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(textOfBlock(ids.todo)).toMatch(/^Bravo \{@page=[\w-]+\} $/);
  });

  it('offers the emoji « :word » names on the bar', async () => {
    const root = tree!;
    const before = '@Lisbonne ';
    const field = (): string => `Bravo ${before}`;
    await act(async () => {
      taskField(root).props.onFocus();
    });
    await type(root, field(), `${field()}:`);
    await type(root, `${field()}:`, `${field()}:so`);
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
    await type(root, `${field()}:so`, `${field()}:sol`);
    const sun = pressable(root, 'soleil');
    expect(sun).toHaveLength(1);
    const glyph = sun[0]!.findAll(node => typeof node.children[0] === 'string')[0]!.children[0] as string;
    await act(async () => {
      sun[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(textOfBlock(ids.todo)).toMatch(new RegExp(`^Bravo \\{@page=[\\w-]+\\} ${glyph}$`, 'u'));
  });
});
