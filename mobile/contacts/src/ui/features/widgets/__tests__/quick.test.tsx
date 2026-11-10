/**
 * « Appels rapides » placed on the home screen: the quick window lists the favourites and the labels;
 * a pick points the widget, hands it its picture at once and completes the placing.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { QuickProviders } from '@app/providers/QuickProviders';
import { createContact, createLabel } from '@app/store/actions';
import { resetLibrary } from '@app/store/libraryStore';

const widgets = { targets: [] as [number, string][], published: [] as [number, string][], closed: [] as boolean[] };

jest.mock('../../../../../../shared/specs/NativeWidgets', () => ({
  __esModule: true,
  default: {
    placed: async () => '[]',
    publish: (id: number, payload: string) => widgets.published.push([id, payload]),
    share: () => undefined,
    setTarget: (id: number, target: string) => widgets.targets.push([id, target]),
    takeTicks: async () => '[]',
    quickClipboard: async () => '',
    clearQuickScrim: () => undefined,
    closeQuick: (done: boolean) => widgets.closed.push(done),
  },
}));

jest.useFakeTimers();

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

it('points a quick calls widget at a label as it is placed', async () => {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  bootstrap();
  const family = createLabel('Famille');
  createContact({ firstName: 'Paul', lastName: 'Durand', company: '', jobTitle: '', phones: [{ id: 'p1', number: '0612345678', kind: 'mobile', label: '' }], emails: [], addresses: [], birthday: null, labelIds: [family], favorite: false, photoId: null, photoMime: '', photoUploaded: false });

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuickProviders widgetId={7} target="" configuring />);
  });
  expect(textOf(tree)).toContain('Quels contacts afficher ?');
  expect(textOf(tree)).toContain('Favoris');
  const row = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes('Famille')).length > 0, { deep: false });
  await act(async () => {
    row[row.length - 1]!.props.onPress();
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(widgets.targets).toEqual([[7, `label:${family}`]]);
  const [id, payload] = widgets.published[0]!;
  expect(id).toBe(7);
  expect(JSON.parse(payload)).toMatchObject({ id: `label:${family}`, title: 'Famille', people: [{ name: 'Paul', call: '0612345678' }] });
  expect(widgets.closed).toEqual([true]);
  await act(async () => tree.unmount());
});
