/**
 * « Compte à rebours » placed on the home screen: the quick window lists what is coming; a pick
 * points the widget at the event, hands it its picture at once and completes the placing.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, today } from '@unlease/calendar/services/time';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { QuickProviders } from '@app/providers/QuickProviders';
import { addEvent } from '@app/store/actions';
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

it('points a countdown at an event as it is placed', async () => {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  bootstrap();
  const day = addDays(today(Date.now()), 12);
  const id = addEvent({ ...blankDraft(`${day}T14:30`, `${day}T18:00`, ''), title: 'Mariage de Léa' });
  addEvent({ ...blankDraft(addDays(day, 2), addDays(day, 3), ''), title: 'Brocante' });

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuickProviders widgetId={7} target="" configuring />);
  });
  expect(textOf(tree)).toContain('Compter jusqu’à quel événement ?');
  expect(textOf(tree)).toContain('Brocante');
  const rows = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes('Mariage de Léa')).length > 0, { deep: false });
  await act(async () => {
    rows[rows.length - 1]!.props.onPress();
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(widgets.targets).toEqual([[7, `event:${id}`]]);
  const [widget, payload] = widgets.published[0]!;
  expect(widget).toBe(7);
  expect(JSON.parse(payload)).toMatchObject({ id: 'countdown', target: `event:${id}`, gone: false, title: 'Mariage de Léa', occurrences: [{ day, time: '14:30' }] });
  expect(widgets.closed).toEqual([true]);
  await act(async () => tree.unmount());
});
