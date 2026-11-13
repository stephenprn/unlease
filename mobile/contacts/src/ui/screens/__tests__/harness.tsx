/** What the screens' tests share: a fake server, the app booted on a fresh database, and ways to find and press what is drawn. */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import type { ServerSettings } from '@unlease/core/sync/settings';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { resetLibrary } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';

export const SETTINGS: ServerSettings = {
  apps: { enabled: ['notes', 'pages', 'contacts'] },
  setup: { done: true },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' },
  drive: { provider: null, url: '', folder: '', library: null, tokenHint: null, leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
  immich: { url: '', keyHint: null },
};

export const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });

/** What the first run asks of the server; a sync waits forever (no records come). */
export function fakeFetch(input: string) {
  const url = new URL(input);
  if (url.pathname === '/api/sync') return new Promise(() => {});
  if (url.pathname === '/api/health') return Promise.resolve(answer({ ok: true, analysis: false, version: '0.1.0', apps: SETTINGS.apps.enabled, setup: true }));
  if (url.pathname === '/api/settings') return Promise.resolve(answer(SETTINGS));
  if (url.pathname === '/api/usage') return Promise.resolve(answer({}));
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

/** The first pressable drawing `text` (a row whose label is its text). */
export function pressableWithText(tree: ReactTestRenderer, text: string): ReactTestInstance {
  const found = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes(text)).length > 0, { deep: false });
  if (found.length === 0) throw new Error(`nothing pressable reads « ${text} »`);
  return found[found.length - 1]!;
}

/** The text inputs whose label (or placeholder) is `label`. */
export const inputs = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll(node => typeof node.props.onChangeText === 'function' && (node.props.accessibilityLabel === label || node.props.placeholder === label), { deep: false });

export async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

let mounted: ReactTestRenderer | null = null;

export const current = (): ReactTestRenderer => mounted!;

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
