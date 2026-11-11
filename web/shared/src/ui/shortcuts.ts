/**
 * The keyboard and the clipboard, suite-wide.
 *
 * Shortcuts are single keys, as in Keep, and only fire when no field has the
 * focus and no dialog is open (dialogs handle their own keys); ⌘P (Ctrl+P
 * elsewhere) and Ctrl+K (⌘K), the spotlight, work from anywhere. Each app adds
 * its own (`AppModule.commands` with a key, `onKey` on its pages); a paste or a
 * drop outside any field goes to the app on screen (Carnet files the links it
 * holds, or makes a photo note of an image).
 */
import { useEffect } from 'react';

import { setQuery, useSearchStore } from '../app/store/search';
import { setShortcutsOpen, setSpotlightOpen } from '../app/store/ui';
import { moduleOfRoute, theApp } from '../modules';
import { hasOpenLayer } from './components/layers';
import { isApple, isEditable } from './dom';
import { SEARCH_INPUT_ID } from './navigation/Header';
import { getLocation, parseRoute, type Route } from './router';

/** The page under whatever is open (an overlay's background): where a key or a paste acts. */
function pageRoute(): Route {
  const here = getLocation();
  const route = parseRoute(here.path);
  const under = moduleOfRoute(route)?.pageUnder?.(route, here.state.background);
  return under ?? route;
}

export function useGlobalKeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      // ⌘P (Ctrl+P elsewhere) searches from anywhere, and never prints the app: even over a dialog, it is taken.
      if ((isApple() ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (!hasOpenLayer()) setSpotlightOpen(true);
        return;
      }
      // Ctrl+K (⌘K) too; in a page, with words selected, it stays the editor's link (an editor that took the key says so).
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        const selection = document.getSelection();
        if (event.defaultPrevented || hasOpenLayer() || (isEditable(event.target) && selection && !selection.isCollapsed)) return;
        event.preventDefault();
        setSpotlightOpen(true);
        return;
      }
      if (event.defaultPrevented || hasOpenLayer()) return;
      // Windows reports AltGr as Ctrl+Alt: "#" typed with it (AZERTY) is still the bin's key.
      const altGr = !isApple() && event.ctrlKey && event.altKey && !event.metaKey && event.key === '#';
      if ((event.ctrlKey || event.metaKey || event.altKey) && !altGr) return;
      const route = pageRoute();
      const module = moduleOfRoute(route);
      if (event.key === 'Escape') {
        // The page's own first (a selection), then the search.
        if (module?.onKey?.(event, route)) return;
        if (useSearchStore.getState().query && !isEditable(event.target)) setQuery('');
        return;
      }
      if (isEditable(event.target)) return;
      const run = (action: () => void): void => {
        event.preventDefault();
        action();
      };
      if (event.key === '/') {
        run(() => {
          const field = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
          field?.focus();
          field?.select();
        });
        return;
      }
      if (event.key === '?') {
        run(() => setShortcutsOpen(true));
        return;
      }
      // The app's keys, wherever one is pressed: its thing made (C, in every app), a checklist (L).
      const key = event.key.toLowerCase();
      const command = theApp().commands?.find(entry => entry.key === key || entry.aliases?.includes(key));
      if (command) {
        run(command.run);
        return;
      }
      if (module?.onKey?.(event, route)) event.preventDefault();
    };

    const onPaste = (event: ClipboardEvent): void => {
      if (event.defaultPrevented || hasOpenLayer() || isEditable(event.target) || !event.clipboardData) return;
      const route = pageRoute();
      if (moduleOfRoute(route)?.onPaste?.(event.clipboardData, route)) event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, [enabled]);

  // A file dropped where nothing takes it is never opened in the app's place; the app on screen may take it (pictures on the board become a note).
  useEffect(() => {
    const carriesFiles = (event: DragEvent): boolean => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
    const onDragOver = (event: DragEvent): void => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event) || event.defaultPrevented) return;
      event.preventDefault();
      if (!enabled || hasOpenLayer()) return;
      const route = pageRoute();
      moduleOfRoute(route)?.onDropFiles?.([...event.dataTransfer!.files], route);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);
}
