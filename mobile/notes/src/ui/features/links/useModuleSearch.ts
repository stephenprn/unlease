/**
 * A module sheet's question to the server: asked when the sheet opens (its body mounts with it) and
 * again on demand ("Chercher à nouveau"), dropped when it closes. The web's `useModuleSearch`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';

export type ModulePhase<T> = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: T };

/** `start: false` waits for the first `search` (a recap asks where the person stopped first). */
export function useModuleSearch<T>(run: (fresh: boolean, signal: AbortSignal) => Promise<T>, start = true): { readonly phase: ModulePhase<T>; readonly search: (fresh: boolean) => void } {
  const [phase, setPhase] = useState<ModulePhase<T>>({ kind: 'asking' });
  const [ask, setAsk] = useState({ fresh: false, round: start ? 0 : -1 });
  // The latest `run`, read when a round starts: its identity changes on every render.
  const latest = useRef(run);
  latest.current = run;

  useEffect(() => {
    if (ask.round < 0) return;
    const controller = new AbortController();
    latest.current(ask.fresh, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [ask]);

  // After a failure nothing was kept, so asking again searches again either way.
  const search = useCallback((fresh: boolean) => {
    setPhase({ kind: 'asking' });
    setAsk(previous => ({ fresh, round: Math.max(0, previous.round + 1) }));
  }, []);
  return { phase, search };
}
