/**
 * An app's start, as its entry calls it (`notes/src/main.tsx`, `pages/src/main.tsx`): the app and the
 * data of those it reads installed, then the database opened, every record in memory, what the app
 * asks of the address (Carnet's capture links: an installed app's shortcut or share), then render.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'virtual:unlease/tokens.css';
import './ui/styles/base.css';
import './ui/styles/typography.css';

import { t } from '@unlease/core/i18n';

import { boot } from './app/boot';
import { useSettingsStore } from './app/store/settings';
import { showWarning } from './app/store/ui';
import { installApp, type AppData, type AppModule } from './modules';
import { applyAppearance } from './ui/appearanceStyle';
import { LocaleRoot } from './ui/App';
import { watchOutlines } from './ui/outlines';
import { browserPath, initHistory } from './ui/router';

export interface StartOptions {
  /** The data of the apps it reads (Pages: Carnet's). */
  readonly reads?: readonly AppData[];
  /** The demo, when this start is one (`?demo` on the dev server, always in the demo build): it returns what runs once the records are in. */
  readonly demo?: (scene: string) => Promise<() => void>;
}

/** The demo's 404 page sends an app's deep link to its page with `?to=<path>`: the address is put back first. */
function arriveFromDemo404(params: URLSearchParams): void {
  const to = params.get('to');
  if (!to?.startsWith('/')) return;
  history.replaceState(null, '', browserPath(to));
}

export async function startApp(module: AppModule, { reads = [], demo }: StartOptions = {}): Promise<void> {
  installApp(module, reads);
  const root = document.getElementById('root');
  if (!root) return;
  let afterBoot: (() => void) | null = null;
  const params = new URLSearchParams(location.search);
  if (demo && (import.meta.env.MODE === 'demo' || (import.meta.env.DEV && params.has('demo')))) {
    if (import.meta.env.MODE === 'demo') arriveFromDemo404(params);
    afterBoot = await demo(params.get('demo') || '1');
  }
  initHistory();
  // The settings are read before boot first waits: the colours and the ground are laid before anything paints.
  const booting = boot();
  const settings = useSettingsStore.getState();
  applyAppearance(settings.appearance, settings.theme);
  const result = await booting;
  afterBoot?.();
  if (!result.persistent) {
    showWarning(t('Ce navigateur bloque le stockage : vos notes seront perdues au rechargement, sauf celles déjà envoyées au serveur.'));
  }
  module.start?.();
  // Production only, never the demo (it starts afresh on each load): the shell that lets the installed app open without a network,
  // its own worker holding its whole path (`/notes` as well as `/notes/…`: the server allows it, `Service-Worker-Allowed`).
  if (import.meta.env.PROD && import.meta.env.MODE !== 'demo' && 'serviceWorker' in navigator) {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base.replace(/\/$/, '') }).catch(() => undefined);
  }
  // Plain containers marked `data-outline` (a page's blocks) take their organic outline as they are sized.
  watchOutlines(document.body);
  createRoot(root).render(
    <StrictMode>
      <LocaleRoot />
    </StrictMode>,
  );
}
