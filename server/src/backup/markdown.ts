/**
 * What a backup archive holds for eyes, beside `unlease.json` (what restores): each app's Markdown
 * under its own folder (Carnet's: `apps/notes/markdown.ts`), the photos and files under `Fichiers/`,
 * and `LISEZMOI.md`, which says what is where.
 */
import { SUITE_NAME, SUITE_SLUG } from '@unlease/core/apps';

/** Where the archive keeps photos and files. */
export const FILES_DIR = 'Fichiers';

const pad = (value: number): string => String(value).padStart(2, '0');
/** "2026-10-26 14:03", in the server's time zone. */
export function localTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** From a Markdown file at `from` to `to`, both paths in the archive. */
export function relativeLink(from: string, to: string): string {
  return `<${'../'.repeat(from.split('/').length - 1)}${to}>`;
}

export interface MarkdownFile {
  readonly path: string;
  readonly text: string;
}

/** The archive's `LISEZMOI.md`: one line per app (`ServerApp.readme`). */
export function readme(createdAt: number, version: string, withFiles: boolean, apps: readonly string[]): string {
  return `# Sauvegarde du serveur ${SUITE_NAME}

Faite le ${localTime(createdAt)} par le serveur${version ? ` (version ${version})` : ''}.

${apps.map(line => `- ${line}`).join('\n')}
- \`${FILES_DIR}/\` : ${withFiles ? 'les photos et fichiers, rangés comme dans chaque application.' : 'absent ici : une sauvegarde sur S3 envoie chaque photo et fichier une seule fois, dans le dossier `fichiers/` du bucket. L’archive complète, à télécharger depuis l’Administration, les contient.'}
- \`${SUITE_SLUG}.json\` : toutes les données, telles que le serveur les garde. C’est lui qui sert à restaurer.

## Restaurer

Dans une application : Administration, Sauvegarde sur S3, « Restaurer depuis un fichier », puis cette archive (.tar.gz) telle quelle.
`;
}
