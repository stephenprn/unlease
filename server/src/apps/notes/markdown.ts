/**
 * Carnet in a backup, as people read it: one Markdown file per note and collection, under the
 * app's folder, with a front matter (Obsidian and most editors show it as properties) and the photos
 * and files linked where the archive keeps them (`Fichiers/`).
 */
import { LINK_KIND_NAMES, type LinkItem, type Note } from '@unlease/notes/models/entities';
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { formatPrice } from '@unlease/core/services/format';
import { drawingSvg, isDrawingEmpty } from '@unlease/notes/services/drawing';
import { bodyMarkdown } from '@unlease/notes/services/noteBody';
import { mentionName } from '@unlease/notes/services/noteMentions';
import { DAY_INKS, escapeLabel, FILES_DIR, frontMatter, localTime, relativeLink, type MarkdownFile } from '../../backup/markdown';
import { noteName, type Layout, type Library } from './files';

export function libraryMarkdown(library: Library, layout: Layout): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  const labels = new Map(library.labels.map(label => [label.id, label.name]));
  const byNote = <T extends { readonly noteId: string; readonly position: string; readonly id: string }>(items: readonly T[]): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const item of items) out.set(item.noteId, [...(out.get(item.noteId) ?? []), item]);
    for (const list of out.values()) list.sort(comparePositions);
    return out;
  };
  const checks = byNote(library.checks);
  const photos = byNote(library.attachments);
  const links = byNote(library.links);
  const fileLink = (from: string, id: string): string | null => {
    const path = layout.files.get(id);
    return path ? relativeLink(from, `${FILES_DIR}/${path}`) : null;
  };

  for (const note of library.notes) {
    const path = `${layout.notes.get(note.id)}.md`;
    const head = frontMatter([
      ['titre', note.title || null],
      ['type', note.kind === 'links' ? 'collection' : note.kind === 'checklist' ? 'liste' : note.kind === 'drawing' ? 'dessin' : 'note'],
      ['étiquettes', note.labelIds.map(id => labels.get(id)).filter(Boolean)],
      ['personnes', note.contactIds.length > 0 ? peopleNames(note.contactIds) : null],
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

  return files;
}

/** The people a note or a link names, as Contacts names them while the backup is written. */
function peopleNames(ids: readonly string[]): string[] {
  return ids.map(id => mentionName({ type: 'contact', id }));
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
    if (link.contactIds.length > 0) lines.push(`  Pour : ${peopleNames(link.contactIds).join(', ')}`);
    if (link.comment.trim()) lines.push(`  Note : ${link.comment.trim().replace(/\n/g, ' ')}`);
    const picture = link.imageIds[0] ? fileLink(path, link.imageIds[0]) : null;
    if (picture) lines.push(`  ![](${picture})`);
    return lines.join('\n');
  });
  if (rows.length > 0) parts.push(rows.join('\n'));
  else parts.push('Aucun lien.');
  return parts.join('\n\n');
}
