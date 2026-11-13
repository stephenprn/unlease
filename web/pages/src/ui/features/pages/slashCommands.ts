/**
 * What « / » offers, by section, and what each does to the block it was typed in: in an empty
 * block it becomes the new kind (or makes way for a table, a picture, columns…); in a written one
 * the new block goes after it; a date or an emoji goes in the sentence itself. Searched in French, in
 * the interface's language and by Markdown's signs.
 */
import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import type { BlockKind, MediaKind } from '@unlease/pages/models/blocks';
import { dateOf } from '@unlease/core/services/dates';
import { foldText } from '@unlease/core/services/search';
import { deleteRich, insertRich, richFromPlain, richLength } from '@unlease/core/services/richText';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useBlocksStore } from '../../../app/store/blocks';
import { createPage, deleteBlocks, insertAfter, insertColumns, insertTable, placeBlock, turnInto } from '../../../app/store/pages';
import { requestTitleFocus } from '../../../app/store/pagesUi';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import { openDateEditor } from './DateEditor';
import { focusBlock, setMenu, type RichHandle } from './editorStore';
import { openInlineEmoji } from './InlineEmoji';
import { placeAtom } from './inlineRuns';
import { openDrawingEditor } from './DrawingBlock';
import { pickImmichFor } from './ImmichBlock';
import { pickAndAttach } from './filePick';

export interface SlashCommand {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: GlyphName;
  readonly section: string;
  /** What else finds it, folded. */
  readonly words: string;
}

const BASIC = tx('Basic blocks');
const INLINE = tx('In the text');
const MEDIA = tx('Media');
const CARNET = tx('Notes, collections and links');
const LAYOUT = tx('Layout');

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { key: 'text', label: tx('Text'), hint: tx('A paragraph'), icon: 'text', section: BASIC, words: 'paragraphe text p' },
  { key: 'h1', label: tx('Heading 1'), hint: tx('A main section’s heading'), icon: 'heading1', section: BASIC, words: 'heading h1 #' },
  { key: 'h2', label: tx('Heading 2'), hint: tx('A section’s heading'), icon: 'heading2', section: BASIC, words: 'heading h2 ##' },
  { key: 'h3', label: tx('Heading 3'), hint: tx('A subsection’s heading'), icon: 'heading3', section: BASIC, words: 'heading h3 ###' },
  { key: 'h4', label: tx('Heading 4'), hint: tx('A small heading'), icon: 'heading4', section: BASIC, words: 'heading h4 ####' },
  { key: 'bullet', label: tx('Bulleted list'), hint: tx('A simple list'), icon: 'list', section: BASIC, words: 'puces bullet ul -' },
  { key: 'numbered', label: tx('Numbered list'), hint: tx('A list in order'), icon: 'numbered', section: BASIC, words: 'numerotee ordered ol 1.' },
  { key: 'todo', label: tx('To-do list'), hint: tx('Boxes to tick'), icon: 'boxChecked', section: BASIC, words: 'taches todo checkbox cases cocher []' },
  { key: 'toggle', label: tx('Toggle list'), hint: tx('Content to expand'), icon: 'toggle', section: BASIC, words: 'toggle depliante replier >' },
  { key: 'callout', label: tx('Callout'), hint: tx('Text that stands out'), icon: 'callout', section: BASIC, words: 'callout encadre note info astuce' },
  { key: 'code', label: tx('Code'), hint: tx('Code coloured by its language'), icon: 'codeBlock', section: BASIC, words: 'code snippet ```' },
  { key: 'table', label: tx('Table'), hint: tx('Typed columns: numbers, dates, choices…'), icon: 'table', section: BASIC, words: 'tableau table base donnees database' },
  { key: 'page', label: tx('Page'), hint: tx('A sub-page in this page'), icon: 'page', section: BASIC, words: 'page sous-page subpage document' },
  { key: 'date', label: tx('Date'), hint: tx('Today, to change after'), icon: 'calendar', section: INLINE, words: 'date jour calendrier heure day today time aujourdhui @' },
  { key: 'emoji', label: tx('Emoji'), hint: tx('An emoji in the sentence'), icon: 'smiley', section: INLINE, words: 'emoji emoticone smiley icone :' },
  { key: 'image', label: tx('Image'), hint: tx('Upload or embed an image'), icon: 'image', section: MEDIA, words: 'image photo picture img' },
  { key: 'video', label: tx('Video'), hint: tx('A file, or a YouTube or Vimeo video…'), icon: 'video', section: MEDIA, words: 'video youtube vimeo film' },
  { key: 'pdf', label: tx('PDF'), hint: tx('A document to read in the page'), icon: 'pdf', section: MEDIA, words: 'pdf document' },
  { key: 'file', label: tx('File'), hint: tx('Any file'), icon: 'file', section: MEDIA, words: 'fichier file piece jointe attachment' },
  { key: 'immich', label: tx('Photos from Immich'), hint: tx('An album or photos of your Immich'), icon: 'image', section: MEDIA, words: 'immich photos album galerie gallery souvenirs images' },
  { key: 'drawing', label: tx('Drawing'), hint: tx('A space to draw in'), icon: 'draw', section: MEDIA, words: 'dessin drawing croquis sketch dessiner draw' },
  { key: 'mention', label: tx('Mention [noun]'), hint: tx('Mention a note, a collection, a link or a page'), icon: 'mention', section: CARNET, words: 'mention citer lien @' },
  { key: 'bookmark', label: tx('Bookmark'), hint: tx('A note, a collection, a link or a page as a card'), icon: 'bookmark', section: CARNET, words: 'signet bookmark carte apercu' },
  { key: 'embed', label: tx('Embed [block]'), hint: tx('A whole note, collection or link'), icon: 'embed', section: CARNET, words: 'integrer embed integration' },
  { key: 'columns2', label: tx('2 columns'), hint: tx('Blocks side by side'), icon: 'columns', section: LAYOUT, words: 'colonnes columns cote' },
  { key: 'columns3', label: tx('3 columns'), hint: tx('Blocks side by side'), icon: 'columns', section: LAYOUT, words: 'colonnes columns cote' },
  { key: 'calendar', label: tx('Calendar'), hint: tx('Your next events, a label’s or all of them'), icon: 'calendar', section: LAYOUT, words: 'agenda calendrier calendar evenements events planning rendez-vous' },
  { key: 'toc', label: tx('Table of contents'), hint: tx('The page’s headings, to go to them'), icon: 'contents', section: LAYOUT, words: 'table matieres sommaire contents toc plan' },
];

export function findCommands(query: string): SlashCommand[] {
  const wanted = foldText(query.trim());
  if (!wanted) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(command => foldText(`${t(command.label)} ${command.label} ${command.words}`).includes(wanted));
}

const TURNS: Readonly<Record<string, BlockKind>> = { text: 'text', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', bullet: 'bullet', numbered: 'numbered', todo: 'todo', toggle: 'toggle', callout: 'callout', code: 'code' };

/** Runs a command picked in the block where « /query » was typed (from `start`). */
export function runCommand(command: SlashCommand, page: string, blockId: string, handle: RichHandle, start: number, query: string): void {
  setMenu(null);
  const runs = deleteRich(handle.runs(), start, start + 1 + query.length);
  const empty = richLength(runs) === 0;
  const turn = TURNS[command.key];
  if (turn) {
    if (empty) {
      handle.write(runs, null);
      turnInto(page, [blockId], turn, { label: mentionLabel, ...(turn === 'code' ? { language: 'plain' } : {}) });
      focusBlock(blockId, 'start');
    } else {
      handle.write(runs, { start });
      const id = insertAfter(page, blockId, { kind: turn, text: '', ...(turn === 'todo' ? { checked: false } : {}), ...(turn === 'code' ? { language: 'plain' } : {}) });
      if (id) focusBlock(id, 'start');
    }
    return;
  }
  // In the sentence: today in place of « /date », its editor open to change it; an emoji picked where « /emoji » was.
  if (command.key === 'date') {
    const placed = placeAtom(runs, start, start, dateOf(Date.now()));
    handle.write(placed.runs, { start: placed.caret });
    openDateEditor(blockId, start, placed.caret);
    return;
  }
  if (command.key === 'emoji') {
    handle.write(runs, { start });
    openInlineEmoji(blockId, start);
    return;
  }
  handle.write(runs, empty ? null : { start });
  switch (command.key) {
    case 'table': {
      insertTable(page, { afterId: blockId });
      if (empty) deleteBlocks(page, [blockId]);
      return;
    }
    case 'page':
      newSubPage(page, blockId, empty);
      return;
    case 'image':
    case 'video':
    case 'pdf':
    case 'file': {
      const id = placeBlock(page, blockId, { kind: command.key as MediaKind }, empty);
      if (id) pickAndAttach(page, id, command.key as MediaKind);
      return;
    }
    case 'mention': {
      handle.write(insertRich(runs, start, richFromPlain('@')), { start: start + 1 });
      setMenu({ kind: 'mention', block: blockId, start, query: '' });
      return;
    }
    case 'bookmark':
    case 'embed':
      setMenu({ kind: 'target', block: blockId, display: command.key, replace: empty });
      return;
    case 'columns2':
    case 'columns3': {
      // The caret goes in the first column, ready to write (empty, the columns would show nothing).
      const first = insertColumns(page, blockId, command.key === 'columns2' ? 2 : 3, empty);
      if (first) focusBlock(first, 'start');
      return;
    }
    case 'toc':
      placeBlock(page, blockId, { kind: 'toc' }, empty);
      return;
    case 'calendar':
      placeBlock(page, blockId, { kind: 'calendar', calendarDays: 14 }, empty);
      return;
    case 'immich': {
      const id = placeBlock(page, blockId, { kind: 'immich' }, empty);
      if (id) pickImmichFor(id);
      return;
    }
    case 'drawing': {
      const id = placeBlock(page, blockId, { kind: 'drawing' }, empty);
      if (id) openDrawingEditor(page, id);
      return;
    }
  }
}

/** A sub-page made from « / »: after the block it was typed in (in its place when it was empty), then opened. */
function newSubPage(page: string, blockId: string, empty: boolean): void {
  const id = createPage({ parentId: useBlocksStore.getState().blocks[blockId]?.parentId ?? page, afterId: blockId, history: page });
  if (empty) deleteBlocks(page, [blockId]);
  requestTitleFocus(id);
  navigate(paths.page(id));
}
