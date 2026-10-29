/**
 * Code coloured in its language. The grammars come in their own file, fetched the first time a
 * code block shows (the browser keeps it, offline too); until then the code shows plain.
 */
import { useEffect, useState } from 'react';

import type { HLJSApi } from 'highlight.js';

import { codeLanguage } from '@unlease/notes/services/code';

let loaded: HLJSApi | null = null;
let loading: Promise<HLJSApi> | null = null;

function load(): Promise<HLJSApi> {
  loading ??= import('./hljs').then(module => (loaded = module.default));
  return loading;
}

const escapeHtml = (value: string): string => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!);

/** The code as highlight.js marks it up (its own escaping), or escaped plain text. */
export function highlightHtml(code: string, language: string): string {
  const grammar = codeLanguage(language).hljs;
  if (!loaded || !grammar || !loaded.getLanguage(grammar)) return escapeHtml(code);
  try {
    return loaded.highlight(code, { language: grammar, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** True once the grammars are here: a code block draws itself again in colour. */
export function useHighlighter(): boolean {
  const [ready, setReady] = useState(loaded !== null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    load().then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}
