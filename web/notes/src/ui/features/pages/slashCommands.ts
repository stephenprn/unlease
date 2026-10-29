/**
 * What « / » offers, by section, and what each does to the block it was typed in: in an empty
 * block it becomes the new kind (or makes way for a table, a picture, columns…); in a written one
 * the new block goes after it; a date or an emoji goes in the sentence itself. Searched in French, in
 * the interface's language and by Markdown's signs.
 */
import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import type { BlockKind, MediaKind } from '@unlease/notes/models/blocks';
import { dateOf } from '@unlease/core/services/dates';
import { foldText } from '@unlease/core/services/search';
import { deleteRich, insertRich, richFromPlain, richLength } from '@unlease/core/services/richText';

import { mentionLabel } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { createPage, deleteBlocks, insertAfter, insertColumns, insertTable, placeBlock, turnInto } from '../../../app/store/pages';
import { requestTitleFocus } from '../../../app/store/pagesUi';
import { navigate, paths } from '../../router';
import { openDateEditor } from './DateEditor';
import { focusBlock, setMenu, type RichHandle } from './editorStore';
import { openInlineEmoji } from './InlineEmoji';
import { placeAtom } from './inlineRuns';
import { openDrawingEditor } from '../drawing/DrawingBlock';
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

const BASIC = tx('Blocs de base');
const INLINE = tx('Dans le texte');
const MEDIA = tx('Médias');
const CARNET = tx('Notes, collections et liens');
const LAYOUT = tx('Mise en page');

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { key: 'text', label: tx('Texte'), hint: tx('Un paragraphe'), icon: 'text', section: BASIC, words: 'paragraphe text p' },
  { key: 'h1', label: tx('Titre 1'), hint: tx('Le titre d’une grande partie'), icon: 'heading1', section: BASIC, words: 'heading h1 #' },
  { key: 'h2', label: tx('Titre 2'), hint: tx('Le titre d’une partie'), icon: 'heading2', section: BASIC, words: 'heading h2 ##' },
  { key: 'h3', label: tx('Titre 3'), hint: tx('Le titre d’une sous-partie'), icon: 'heading3', section: BASIC, words: 'heading h3 ###' },
  { key: 'h4', label: tx('Titre 4'), hint: tx('Un petit titre'), icon: 'heading4', section: BASIC, words: 'heading h4 ####' },
  { key: 'bullet', label: tx('Liste à puces'), hint: tx('Une liste simple'), icon: 'list', section: BASIC, words: 'puces bullet ul -' },
  { key: 'numbered', label: tx('Liste numérotée'), hint: tx('Une liste dans l’ordre'), icon: 'numbered', section: BASIC, words: 'numerotee ordered ol 1.' },
  { key: 'todo', label: tx('Liste de tâches'), hint: tx('Des cases à cocher'), icon: 'boxChecked', section: BASIC, words: 'taches todo checkbox cases cocher []' },
  { key: 'toggle', label: tx('Liste dépliante'), hint: tx('Un contenu à déplier'), icon: 'toggle', section: BASIC, words: 'toggle depliante replier >' },
  { key: 'callout', label: tx('Encadré'), hint: tx('Un texte mis en avant'), icon: 'callout', section: BASIC, words: 'callout encadre note info astuce' },
  { key: 'code', label: tx('Code'), hint: tx('Du code coloré selon son langage'), icon: 'codeBlock', section: BASIC, words: 'code snippet ```' },
  { key: 'table', label: tx('Tableau'), hint: tx('Des colonnes typées : nombres, dates, choix…'), icon: 'table', section: BASIC, words: 'tableau table base donnees database' },
  { key: 'page', label: tx('Page'), hint: tx('Une sous-page dans cette page'), icon: 'page', section: BASIC, words: 'page sous-page subpage document' },
  { key: 'date', label: tx('Date'), hint: tx('Aujourd’hui, à changer ensuite'), icon: 'calendar', section: INLINE, words: 'date jour calendrier heure day today time aujourdhui @' },
  { key: 'emoji', label: tx('Emoji'), hint: tx('Un emoji dans la phrase'), icon: 'smiley', section: INLINE, words: 'emoji emoticone smiley icone :' },
  { key: 'image', label: tx('Image'), hint: tx('Téléverser ou intégrer une image'), icon: 'image', section: MEDIA, words: 'image photo picture img' },
  { key: 'video', label: tx('Vidéo'), hint: tx('Un fichier, ou une vidéo YouTube, Vimeo…'), icon: 'video', section: MEDIA, words: 'video youtube vimeo film' },
  { key: 'pdf', label: tx('PDF'), hint: tx('Un document à lire dans la page'), icon: 'pdf', section: MEDIA, words: 'pdf document' },
  { key: 'file', label: tx('Fichier'), hint: tx('N’importe quel fichier'), icon: 'file', section: MEDIA, words: 'fichier file piece jointe attachment' },
  { key: 'drawing', label: tx('Dessin'), hint: tx('Une zone où dessiner'), icon: 'draw', section: MEDIA, words: 'dessin drawing croquis sketch dessiner draw' },
  { key: 'mention', label: tx('Mention'), hint: tx('Citer une note, une collection, un lien ou une page'), icon: 'mention', section: CARNET, words: 'mention citer lien @' },
  { key: 'bookmark', label: tx('Signet'), hint: tx('Une note, une collection, un lien ou une page en carte'), icon: 'bookmark', section: CARNET, words: 'signet bookmark carte apercu' },
  { key: 'embed', label: tx('Intégration'), hint: tx('Une note, une collection ou un lien en entier'), icon: 'embed', section: CARNET, words: 'integrer embed integration' },
  { key: 'columns2', label: tx('2 colonnes'), hint: tx('Des blocs côte à côte'), icon: 'columns', section: LAYOUT, words: 'colonnes columns cote' },
  { key: 'columns3', label: tx('3 colonnes'), hint: tx('Des blocs côte à côte'), icon: 'columns', section: LAYOUT, words: 'colonnes columns cote' },
  { key: 'toc', label: tx('Table des matières'), hint: tx('Les titres de la page, pour y aller'), icon: 'contents', section: LAYOUT, words: 'table matieres sommaire contents toc plan' },
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
    case 'columns3':
      insertColumns(page, blockId, command.key === 'columns2' ? 2 : 3, empty);
      return;
    case 'toc':
      placeBlock(page, blockId, { kind: 'toc' }, empty);
      return;
    case 'drawing': {
      const id = placeBlock(page, blockId, { kind: 'drawing' }, empty);
      if (id) openDrawingEditor(page, id);
      return;
    }
  }
}

/** A sub-page made from « / »: after the block it was typed in (in its place when it was empty), then opened. */
function newSubPage(page: string, blockId: string, empty: boolean): void {
  const id = createPage({ parentId: useLibraryStore.getState().blocks[blockId]?.parentId ?? page, afterId: blockId, history: page });
  if (empty) deleteBlocks(page, [blockId]);
  requestTitleFocus(id);
  navigate(paths.page(id));
}
