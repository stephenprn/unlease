/**
 * Pages in a backup, as people read it: one Markdown file per page under the app's folder, its
 * sub-pages in a folder named after it, with a front matter and its files linked where the archive
 * keeps them (`Fichiers/`). A mention of Carnet's notes and links, of a contact or of an event, reads
 * as their names; a calendar block as the events it listed when the backup was made; an Immich block
 * as a link to its album or its photos in Immich (its address as the Administration linked it).
 */
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { contactNamer } from '../contacts/names';
import { calendarNamer } from '../calendar/names';
import { eventFromRecord, feedFromRecord, labelFromRecord } from '@unlease/calendar/sync/entities';
import type { CalendarEvent, CalendarFeed, CalendarLabel } from '@unlease/calendar/models/events';
import { calendarBlockLines, type CalendarBlockSource } from '@unlease/pages/services/calendarBlock';
import { immichBlockMarkdown } from '@unlease/pages/services/immichBlock';
import { richFromPlain, serializeRich } from '@unlease/core/services/richText';
import { drawingSvg, isDrawingEmpty } from '@unlease/notes/services/drawing';
import { linkFromRecord, noteFromRecord, checkFromRecord } from '@unlease/notes/sync/entities';
import { UNTITLED_PAGE, type Block, type BlockTarget } from '@unlease/pages/models/blocks';
import { blocksToMarkdown, type BlockDraft } from '@unlease/pages/services/pageText';
import { DAY_INKS, escapeLabel, FILES_DIR, frontMatter, localTime, relativeLink, type MarkdownFile } from '../../backup/markdown';
import type { StoredRecord } from '../../sync/records';
import { noteName } from '../notes/files';
import type { PagesLayout } from './files';

/** What a mention of another app's record reads as: Carnet's notes, collections and links, and contacts, by their names. */
function mentionsOf(all: readonly StoredRecord[]): (target: BlockTarget) => string | null {
  const notes = new Map<string, StoredRecord>();
  const links = new Map<string, StoredRecord>();
  const checks = new Map<string, StoredRecord[]>();
  const contact = contactNamer(all);
  const event = calendarNamer(all);
  for (const record of all) {
    if (record.type === 'note') notes.set(record.id, record);
    else if (record.type === 'link') links.set(record.id, record);
    else if (record.type === 'check' && typeof record.fields.noteId === 'string') checks.set(record.fields.noteId, [...(checks.get(record.fields.noteId) ?? []), record]);
  }
  return target => {
    if (target.type === 'contact') {
      const name = contact(target);
      return name !== null ? `@${name}` : '@contact supprimé';
    }
    if (target.type === 'event') {
      const name = event(target);
      return name !== null ? `@${name}` : '@événement supprimé';
    }
    if (target.type === 'link') {
      const record = links.get(target.id);
      const link = record ? linkFromRecord(record) : null;
      return link && link.deletedAt === null ? `@${link.title || link.url}` : '@lien supprimé';
    }
    if (target.type === 'note') {
      const record = notes.get(target.id);
      const note = record ? noteFromRecord(record) : null;
      return note && note.deletedAt === null ? `@${noteName(note, (checks.get(note.id) ?? []).map(checkFromRecord))}` : '@note supprimée';
    }
    return null;
  };
}

/** Agenda's events, labels and calendars, for the calendar blocks. */
function calendarSource(all: readonly StoredRecord[]): CalendarBlockSource {
  const events: Record<string, CalendarEvent> = {};
  const labels: Record<string, CalendarLabel> = {};
  const feeds: Record<string, CalendarFeed> = {};
  for (const record of all) {
    if (record.type === 'calendarEvent') events[record.id] = eventFromRecord(record);
    else if (record.type === 'calendarLabel') labels[record.id] = labelFromRecord(record);
    else if (record.type === 'calendarFeed') feeds[record.id] = feedFromRecord(record);
  }
  return { events, labels, feeds };
}

export function pagesMarkdown(blocks: readonly Block[], all: readonly StoredRecord[], layout: PagesLayout, now: number = Date.now(), immichBase: string | null = null): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  let calendar: CalendarBlockSource | null = null;
  const byId = new Map(blocks.map(block => [block.id, block]));
  const children = new Map<string, Block[]>();
  for (const block of blocks) if (block.parentId) children.set(block.parentId, [...(children.get(block.parentId) ?? []), block]);
  for (const list of children.values()) list.sort(comparePositions);
  const fileLink = (from: string, id: string): string | null => {
    const path = layout.files.get(id);
    return path ? relativeLink(from, `${FILES_DIR}/${path}`) : null;
  };
  const elsewhere = mentionsOf(all);
  const mention = (target: BlockTarget): string => {
    if (target.type === 'page') return `@${byId.get(target.id)?.text.trim() || UNTITLED_PAGE}`;
    return elsewhere(target) ?? '@indisponible';
  };

  for (const block of blocks) {
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
      if (child.kind === 'calendar') {
        calendar ??= calendarSource(all);
        const lines = calendarBlockLines(calendar, child, now);
        const items = (lines.length > 0 ? lines : ['Rien de prévu']).map((line): BlockDraft => ({ kind: 'bullet', text: serializeRich(richFromPlain(line)) }));
        return { kind: 'text', text: serializeRich(richFromPlain(`Agenda, les ${child.calendarDays} prochains jours :`)), children: items };
      }
      if (child.kind === 'immich') {
        const caption = child.caption.trim();
        return { kind: 'text', text: serializeRich(richFromPlain(immichBlockMarkdown(child, immichBase))), ...(caption ? { children: [{ kind: 'text', text: serializeRich(richFromPlain(caption)) }] } : {}) };
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
