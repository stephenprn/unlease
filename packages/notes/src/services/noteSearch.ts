/** A note as the board's search reads it: its title, then its words, items, links, labels and people, folded. */
import { foldText, type SearchDocument } from '@unlease/core/services/search';
import type { CheckItem, Label, LinkItem, Note } from '../models/entities';
import { bodyText } from './noteBody';
import { peopleNames } from './noteMentions';

export function buildDocument(
  note: Note,
  checks: readonly CheckItem[],
  links: readonly LinkItem[],
  labels: readonly Label[],
): SearchDocument {
  const parts: string[] = [bodyText(note)];
  for (const item of checks) parts.push(item.text);
  for (const link of links) {
    parts.push(link.title, link.summary, link.siteName, link.url, link.comment, ...peopleNames(link.contactIds));
    for (const attribute of link.attributes) parts.push(attribute.value);
  }
  for (const label of labels) parts.push(label.name);
  parts.push(...peopleNames(note.contactIds));
  return {
    noteId: note.id,
    title: foldText(note.title),
    rest: foldText(parts.join('\n')),
    editedAt: note.editedAt,
  };
}
