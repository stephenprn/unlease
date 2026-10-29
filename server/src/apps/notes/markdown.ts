/**
 * Carnet in a backup, as people read it: one Markdown file per note, collection and page, under the
 * app's folder, with a front matter (Obsidian and most editors show it as properties) and the photos
 * and files linked where the archive keeps them (`Fichiers/`).
 */
import { UNTITLED_PAGE, type Block, type BlockTarget } from '@unlease/notes/models/blocks';
import { LINK_KIND_NAMES, type LinkItem, type Note } from '@unlease/notes/models/entities';
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { formatPrice } from '@unlease/core/services/format';
import { ROLES, LINES } from '@unlease/design/palette';
import { drawingSvg, isDrawingEmpty } from '@unlease/notes/services/drawing';
import { bodyMarkdown } from '@unlease/notes/services/noteBody';
import { blocksToMarkdown, type BlockDraft } from '@unlease/notes/services/pageText';
import { FILES_DIR, localTime, relativeLink, type MarkdownFile } from '../../backup/markdown';
import { noteName, type Layout, type Library } from './files';

/** A front matter: JSON strings are valid YAML. */
function frontMatter(entries: readonly (readonly [string, unknown])[]): string {
  const lines = entries.filter(([, value]) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

const escapeLabel = (text: string): string => text.replace(/([[\]\\])/g, '\\$1');

/** A drawing's inks as the day paints them: its file reads on white. */
const DAY_INKS = (ink: string): string => (ink === 'ink' ? ROLES.light.ink : (LINES.light[ink as keyof typeof LINES.light]?.fill ?? ROLES.light.ink));

export function libraryMarkdown(library: Library, layout: Layout): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  const labels = new Map(library.labels.map(label => [label.id, label.name]));
  const notes = new Map(library.notes.map(note => [note.id, note]));
  const byNote = <T extends { readonly noteId: string; readonly position: string; readonly id: string }>(items: readonly T[]): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const item of items) out.set(item.noteId, [...(out.get(item.noteId) ?? []), item]);
    for (const list of out.values()) list.sort(comparePositions);
    return out;
  };
  const checks = byNote(library.checks);
  const photos = byNote(library.attachments);
  const links = byNote(library.links);
  const blocks = new Map(library.blocks.map(block => [block.id, block]));
  const children = new Map<string, Block[]>();
  for (const block of library.blocks) if (block.parentId) children.set(block.parentId, [...(children.get(block.parentId) ?? []), block]);
  for (const list of children.values()) list.sort(comparePositions);
  const fileLink = (from: string, id: string): string | null => {
    const path = layout.files.get(id);
    return path ? relativeLink(from, `${FILES_DIR}/${path}`) : null;
  };
  const mention = (target: BlockTarget): string => {
    if (target.type === 'page') return `@${blocks.get(target.id)?.text.trim() || UNTITLED_PAGE}`;
    if (target.type === 'link') {
      const link = library.links.find(item => item.id === target.id);
      return link ? `@${link.title || link.url}` : '@lien supprimé';
    }
    const note = notes.get(target.id);
    return note ? `@${noteName(note, checks.get(note.id) ?? [])}` : '@note supprimée';
  };

  for (const note of library.notes) {
    const path = `${layout.notes.get(note.id)}.md`;
    const head = frontMatter([
      ['titre', note.title || null],
      ['type', note.kind === 'links' ? 'collection' : note.kind === 'checklist' ? 'liste' : note.kind === 'drawing' ? 'dessin' : 'note'],
      ['étiquettes', note.labelIds.map(id => labels.get(id)).filter(Boolean)],
      ['couleur', note.color],
      ['épinglée', note.pinned || null],
      ['archivée', note.archived || null],
      ['corbeille', note.trashedAt ? localTime(note.trashedAt) : null],
      ['rappel', note.reminderAt ? localTime(note.reminderAt) : null],
      ['description', note.kind === 'links' ? note.hint : null],
      ['créée', localTime(note.createdAt)],
      ['id', note.id],
    ]);
    // A drawing goes beside its note as an SVG file, shown in it.
    let drawn: string | null = null;
    if (note.kind === 'drawing' && !isDrawingEmpty(note.drawing)) {
      const svg = `${layout.notes.get(note.id)}.svg`;
      files.push({ path: svg, text: drawingSvg(note.drawing, DAY_INKS) });
      drawn = relativeLink(path, svg);
    }
    const body = note.kind === 'links' ? collectionBody(note, links.get(note.id) ?? [], path, fileLink) : noteBody(note, checks.get(note.id) ?? [], (photos.get(note.id) ?? []).map(photo => fileLink(path, photo.id)), drawn);
    files.push({ path, text: `${head}# ${note.title || noteName(note, checks.get(note.id) ?? [])}\n\n${body}`.trimEnd() + '\n' });
  }

  for (const block of library.blocks) {
    if (block.kind !== 'page') continue;
    const path = `${layout.pages.get(block.id)}.md`;
    let drawings = 0;
    const draft = (child: Block, depth: number): BlockDraft => {
      const extra: Record<string, unknown> = { checked: child.checked, columns: child.columns, cells: child.cells, fileName: child.fileName, caption: child.caption };
      if (child.fileId) extra.url = fileLink(path, child.fileId) ?? child.url ?? '';
      else if (child.url) extra.url = `<${child.url}>`;
      // A page's drawings go beside it as SVG files, shown where they sit.
      if (child.kind === 'drawing' && !isDrawingEmpty(child.drawing)) {
        drawings += 1;
        const svg = `${layout.pages.get(block.id)}.dessin-${drawings}.svg`;
        files.push({ path: svg, text: drawingSvg(child.drawing, DAY_INKS) });
        extra.url = relativeLink(path, svg);
      }
      if (child.target) Object.assign(extra, { targetType: child.target.type, targetId: child.target.id });
      if (child.kind === 'page') {
        const title = child.text.trim() || UNTITLED_PAGE;
        const sub = layout.pages.get(child.id);
        return { kind: 'page', text: sub ? `[${escapeLabel(title)}](${relativeLink(path, `${sub}.md`)})` : title };
      }
      const nested = depth < 100 ? (children.get(child.id) ?? []).map(next => draft(next, depth + 1)) : [];
      return { kind: child.kind, text: child.text, checked: child.checked, language: child.language, extra, ...(nested.length > 0 ? { children: nested } : {}) };
    };
    const content = blocksToMarkdown((children.get(block.id) ?? []).map(child => draft(child, 0)), mention);
    const head = frontMatter([
      ['titre', block.text.trim() || UNTITLED_PAGE],
      ['type', 'page'],
      ['icône', block.icon],
      ['corbeille', block.trashedAt ? localTime(block.trashedAt) : null],
      ['créée', localTime(block.createdAt)],
      ['id', block.id],
    ]);
    files.push({ path, text: `${head}# ${block.text.trim() || UNTITLED_PAGE}\n\n${content}`.trimEnd() + '\n' });
  }
  return files;
}

function noteBody(note: Note, items: readonly { readonly text: string; readonly checked: boolean; readonly indent: number }[], pictures: readonly (string | null)[], drawing: string | null): string {
  const parts: string[] = [];
  if (drawing) parts.push(`![](${drawing})`);
  const text = bodyMarkdown(note);
  if (text.trim()) parts.push(text.trimEnd());
  if (items.length > 0) parts.push(items.map(item => `${item.indent > 0 ? '  ' : ''}- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n'));
  const shown = pictures.filter((link): link is string => link !== null);
  if (shown.length > 0) parts.push(shown.map(link => `![](${link})`).join('\n\n'));
  return parts.join('\n\n');
}

function collectionBody(note: Note, links: readonly LinkItem[], path: string, fileLink: (from: string, id: string) => string | null): string {
  const parts: string[] = [];
  if (note.hint.trim()) parts.push(`> ${note.hint.trim()}`);
  const rows = links.map(link => {
    const facts = [link.siteName, link.kind !== 'other' ? LINK_KIND_NAMES[link.kind] : null, link.price !== null ? formatPrice(link.price, link.currency) : null, link.done ? 'fait' : null].filter(Boolean);
    const lines = [`- [${escapeLabel(link.title || link.url)}](<${link.url}>)${facts.length > 0 ? ` · ${facts.join(' · ')}` : ''}`];
    if (link.summary) lines.push(`  ${link.summary}`);
    if (link.attributes.length > 0) lines.push(`  ${link.attributes.map(fact => `${fact.label} : ${fact.value}`).join(' ; ')}`);
    if (link.comment.trim()) lines.push(`  Note : ${link.comment.trim().replace(/\n/g, ' ')}`);
    const picture = link.imageIds[0] ? fileLink(path, link.imageIds[0]) : null;
    if (picture) lines.push(`  ![](${picture})`);
    return lines.join('\n');
  });
  if (rows.length > 0) parts.push(rows.join('\n'));
  else parts.push('Aucun lien.');
  return parts.join('\n\n');
}
