/** highlight.js ships no types for its language modules: each is a grammar for `registerLanguage`. */
declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js';

  const language: LanguageFn;
  export default language;
}
