/**
 * A code block's languages: the most used ones, by stored key (keys sync: append only). `hljs`
 * names the web's highlighter grammar; `aliases` are what the picker also finds them by.
 */
import { t } from '@unlease/core/i18n';

export interface CodeLanguage {
  readonly key: string;
  readonly name: string;
  /** highlight.js's grammar, or null for plain text. */
  readonly hljs: string | null;
  readonly aliases: readonly string[];
}

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { key: 'plain', get name() { return t('Texte brut'); }, hljs: null, aliases: ['texte', 'text', 'txt', 'plain'] },
  { key: 'javascript', name: 'JavaScript', hljs: 'javascript', aliases: ['js', 'jsx', 'node'] },
  { key: 'typescript', name: 'TypeScript', hljs: 'typescript', aliases: ['ts', 'tsx'] },
  { key: 'python', name: 'Python', hljs: 'python', aliases: ['py'] },
  { key: 'java', name: 'Java', hljs: 'java', aliases: [] },
  { key: 'kotlin', name: 'Kotlin', hljs: 'kotlin', aliases: ['kt'] },
  { key: 'swift', name: 'Swift', hljs: 'swift', aliases: [] },
  { key: 'c', name: 'C', hljs: 'c', aliases: ['h'] },
  { key: 'cpp', name: 'C++', hljs: 'cpp', aliases: ['c++', 'hpp', 'cc'] },
  { key: 'csharp', name: 'C#', hljs: 'csharp', aliases: ['cs', 'c#', 'dotnet'] },
  { key: 'go', name: 'Go', hljs: 'go', aliases: ['golang'] },
  { key: 'rust', name: 'Rust', hljs: 'rust', aliases: ['rs'] },
  { key: 'php', name: 'PHP', hljs: 'php', aliases: [] },
  { key: 'ruby', name: 'Ruby', hljs: 'ruby', aliases: ['rb'] },
  { key: 'dart', name: 'Dart', hljs: 'dart', aliases: ['flutter'] },
  { key: 'scala', name: 'Scala', hljs: 'scala', aliases: [] },
  { key: 'r', name: 'R', hljs: 'r', aliases: [] },
  { key: 'lua', name: 'Lua', hljs: 'lua', aliases: [] },
  { key: 'sql', name: 'SQL', hljs: 'sql', aliases: ['postgres', 'mysql', 'sqlite'] },
  { key: 'bash', name: 'Bash', hljs: 'bash', aliases: ['shell', 'sh', 'zsh', 'terminal'] },
  { key: 'powershell', name: 'PowerShell', hljs: 'powershell', aliases: ['ps', 'ps1'] },
  { key: 'html', name: 'HTML', hljs: 'xml', aliases: ['xml', 'svg'] },
  { key: 'css', name: 'CSS', hljs: 'css', aliases: [] },
  { key: 'scss', name: 'SCSS', hljs: 'scss', aliases: ['sass'] },
  { key: 'json', name: 'JSON', hljs: 'json', aliases: [] },
  { key: 'yaml', name: 'YAML', hljs: 'yaml', aliases: ['yml'] },
  { key: 'toml', name: 'TOML', hljs: 'ini', aliases: ['ini'] },
  { key: 'markdown', name: 'Markdown', hljs: 'markdown', aliases: ['md'] },
  { key: 'dockerfile', name: 'Dockerfile', hljs: 'dockerfile', aliases: ['docker'] },
  { key: 'nginx', name: 'Nginx', hljs: 'nginx', aliases: [] },
  { key: 'diff', name: 'Diff', hljs: 'diff', aliases: ['patch'] },
  { key: 'graphql', name: 'GraphQL', hljs: 'graphql', aliases: ['gql'] },
];

const BY_KEY = new Map(CODE_LANGUAGES.map(language => [language.key, language]));

/** A stored key's language; an unknown one (a newer client's) reads as plain text. */
export function codeLanguage(key: string): CodeLanguage {
  return BY_KEY.get(key) ?? CODE_LANGUAGES[0]!;
}

/** The language a fence names (```ts), or null. */
export function languageFromFence(word: string): string | null {
  const wanted = word.trim().toLowerCase();
  if (!wanted) return null;
  return CODE_LANGUAGES.find(language => language.key === wanted || language.name.toLowerCase() === wanted || language.aliases.includes(wanted))?.key ?? null;
}
