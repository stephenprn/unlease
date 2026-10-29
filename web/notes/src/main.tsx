/**
 * Boot: open the database, read the library into memory, act on a capture
 * link (an installed app's shortcut or share), then render.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'virtual:carnet/tokens.css';
import './ui/styles/base.css';
import './ui/styles/typography.css';

import { t } from '@unlease/core/i18n';
import { addNotesEnglish } from '@unlease/notes/i18n';

import { boot } from './app/boot';
import { useSettingsStore } from './app/store/settings';
import { showWarning } from './app/store/ui';
import { applyAppearance } from './ui/appearanceStyle';
import { LocaleRoot } from './ui/App';
import { handleCaptureRoute } from './ui/captureRoute';
import { watchOutlines } from './ui/outlines';
import { initHistory } from './ui/router';

// The design system's and Carnet's English, before anything is shown.
addNotesEnglish();

async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;
  // The demo: `?demo` on the dev server, always in the demo build (`build:demo`, GitHub Pages). Not in the server's build.
  let afterBoot: (() => void) | null = null;
  const params = new URLSearchParams(location.search);
  if (import.meta.env.MODE === 'demo' || (import.meta.env.DEV && params.has('demo'))) {
    const { startDemo } = await import('./dev/demo');
    afterBoot = await startDemo(params.get('demo') || '1');
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
  handleCaptureRoute();
  // Production only, never the demo (it starts afresh on each load): the shell that lets the installed app open without a network.
  if (import.meta.env.PROD && import.meta.env.MODE !== 'demo' && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  // Plain containers marked `data-outline` (a page's blocks) take their organic outline as they are sized.
  watchOutlines(document.body);
  createRoot(root).render(
    <StrictMode>
      <LocaleRoot />
    </StrictMode>,
  );
}

void start();
