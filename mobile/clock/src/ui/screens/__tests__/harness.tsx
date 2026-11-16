/** What the screens' tests share: the app booted on a fresh database, and ways to find and press what is drawn. */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { resetLibrary } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

export const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });

/** No server is set in these tests: anything asked is not found. */
export function fakeFetch() {
  return Promise.resolve(answer({ error: 'not found' }, 404));
}

export function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ');
}

export const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => (node.props as { accessibilityLabel?: unknown }).accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });

/** The last pressable drawing `text` (a row whose label is its text). */
export function pressableWithText(tree: ReactTestRenderer, text: string): ReactTestInstance {
  const found = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes(text)).length > 0, { deep: false });
  if (found.length === 0) throw new Error(`nothing pressable reads « ${text} »`);
  return found[found.length - 1]!;
}

/** The text inputs whose label (or placeholder) is `label`. */
export const inputs = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => typeof node.props.onChangeText === 'function' && (node.props.accessibilityLabel === label || node.props.placeholder === label), { deep: false });

/** A wheel of the time (« Heures », « Minutes »), turned by TalkBack's adjust actions. */
export async function turn(tree: ReactTestRenderer, label: string, steps: number): Promise<void> {
  const wheel = tree.root.find(node => node.props.accessibilityRole === 'adjustable' && node.props.accessibilityLabel === label && typeof node.props.onAccessibilityAction === 'function');
  for (let index = 0; index < Math.abs(steps); index += 1) {
    await act(async () => {
      wheel.props.onAccessibilityAction({ nativeEvent: { actionName: steps > 0 ? 'increment' : 'decrement' } });
    });
  }
}

export async function press(node: ReactTestInstance): Promise<void> {
  await act(async () => {
    node.props.onPress();
  });
}

export async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

export async function go(...args: unknown[]): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...a: unknown[]) => void)(...args);
  });
  await settle();
}

let mounted: ReactTestRenderer | null = null;

export async function boot({ onboarded, prepare }: { onboarded: boolean; prepare?: () => void }): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  if (onboarded) writePreference('onboarded', true);
  if (prepare) {
    // What the phone held before the app opened: written once the library is loaded.
    bootstrap();
    prepare();
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await settle();
  mounted = tree;
  return tree;
}

export async function unmountAll(): Promise<void> {
  const last = mounted;
  if (last) await act(async () => last.unmount());
  mounted = null;
}
