/**
 * The sheets a page opens over itself on the phone (`pageSheets`): what to insert (the web's « / »
 * menu, by section), a block's actions (the web's block menu), the kinds it can turn into, a
 * mention (or a date) or what a bookmark or an embed shows, an icon or an emoji for the words, a
 * move to another page, a code block's language, a callout's colour, words' colour and link, a date.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Keyboard, Share, StyleSheet, View } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tc, tx } from '@unlease/core/i18n';
import { CAPTION_KINDS, RICH_KINDS, UNTITLED_PAGE, type Block, type BlockKind, type BlockTarget, type MediaKind } from '@unlease/pages/models/blocks';
import { isLineColor, LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';
import { pebbleTurn } from '@unlease/design/pebbles';
import { containingPage, isWithin, shownTarget, type TargetDisplay } from '@unlease/pages/services/blocks';
import { CODE_LANGUAGES } from '@unlease/pages/services/code';
import { movePlaces, type MovePlace } from '@unlease/pages/services/recentPages';
import { dateOf } from '@unlease/core/services/dates';
import { deleteRich, insertRich, marksAt, rangeValue, richLength, serializeRich, setValue, type AtomRun } from '@unlease/core/services/richText';
import { plural } from '@unlease/core/services/format';
import { foldText } from '@unlease/core/services/search';
import { extractUrls, normalizeUrl } from '@unlease/core/services/url';
import { mentionLabel } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';
import { createPage, deleteBlocks, duplicateBlocks, insertAfter, insertColumns, insertTable, moveBlocks, movePage, placeBlock, setPageIcon, setShowDone, showTargetAs, targetBlock, trashPage, TURNABLE, turnInto, updateBlock } from '@app/store/pages';
import { requestTitleFocus } from '@app/store/pagesUi';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EmptyLine, FormFoot, Icon, ListRow, Organic, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm } from '@shared/ui/components';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { openDrawing } from '../drawing/openDrawing';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import { openCaption } from './Caption';
import { DateSheetHost, openDateSheet } from './DateSheet';
import { EmojiSheet } from './EmojiSheet';
import { flushAll, focusBlock, richHandle, visibleOutline } from './editorStore';
import { placeAtom, typedEnd } from './inline';
import { pickAndAttach } from './MediaBlock';
import { blocksMarkdown } from './pageExport';
import { closePageSheet, openPageSheet, useSheetOf } from './sheetStore';
import { TargetSheet } from './TargetSheet';
import { openReorder, ReorderHost } from './ReorderBlocks';

const BASIC = tx('Blocs de base');
const INLINE = tx('Dans le texte');
const MEDIA = tx('Médias');
const CARNET = tx('Notes, collections et liens');
const LAYOUT = tx('Mise en page');

interface InsertCommand {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: GlyphName;
  readonly section: string;
}

/** The web's « / » commands (`slashCommands.ts`), in its sections. */
const COMMANDS: readonly InsertCommand[] = [
  { key: 'text', label: tx('Texte'), hint: tx('Un paragraphe'), icon: 'text', section: BASIC },
  { key: 'h1', label: tx('Titre 1'), hint: tx('Le titre d’une grande partie'), icon: 'heading1', section: BASIC },
  { key: 'h2', label: tx('Titre 2'), hint: tx('Le titre d’une partie'), icon: 'heading2', section: BASIC },
  { key: 'h3', label: tx('Titre 3'), hint: tx('Le titre d’une sous-partie'), icon: 'heading3', section: BASIC },
  { key: 'h4', label: tx('Titre 4'), hint: tx('Un petit titre'), icon: 'heading4', section: BASIC },
  { key: 'bullet', label: tx('Liste à puces'), hint: tx('Une liste simple'), icon: 'list', section: BASIC },
  { key: 'numbered', label: tx('Liste numérotée'), hint: tx('Une liste dans l’ordre'), icon: 'numbered', section: BASIC },
  { key: 'todo', label: tx('Liste de tâches'), hint: tx('Des cases à cocher'), icon: 'boxChecked', section: BASIC },
  { key: 'toggle', label: tx('Liste dépliante'), hint: tx('Un contenu à déplier'), icon: 'toggle', section: BASIC },
  { key: 'callout', label: tx('Encadré'), hint: tx('Un texte mis en avant'), icon: 'callout', section: BASIC },
  { key: 'code', label: tx('Code'), hint: tx('Du code, en chasse fixe'), icon: 'codeBlock', section: BASIC },
  { key: 'table', label: tx('Tableau'), hint: tx('Des colonnes typées : nombres, dates, choix…'), icon: 'table', section: BASIC },
  { key: 'page', label: tx('Page'), hint: tx('Une sous-page dans cette page'), icon: 'page', section: BASIC },
  { key: 'date', label: tx('Date'), hint: tx('Aujourd’hui, à changer ensuite'), icon: 'calendar', section: INLINE },
  { key: 'emoji', label: tx('Emoji'), hint: tx('Un emoji dans la phrase'), icon: 'smiley', section: INLINE },
  { key: 'image', label: tx('Image'), hint: tx('Une photo du téléphone, ou une adresse'), icon: 'image', section: MEDIA },
  { key: 'video', label: tx('Vidéo'), hint: tx('Un fichier, ou une vidéo YouTube, Vimeo…'), icon: 'video', section: MEDIA },
  { key: 'pdf', label: tx('PDF'), hint: tx('Un PDF du téléphone, ou une adresse'), icon: 'pdf', section: MEDIA },
  { key: 'file', label: tx('Fichier'), hint: tx('N’importe quel fichier'), icon: 'file', section: MEDIA },
  { key: 'drawing', label: tx('Dessin'), hint: tx('Une zone où dessiner'), icon: 'draw', section: MEDIA },
  { key: 'mention', label: tx('Mention'), hint: tx('Citer une note, une collection, un lien ou une page'), icon: 'mention', section: CARNET },
  { key: 'bookmark', label: tx('Signet'), hint: tx('Une note, une collection, un lien ou une page en carte'), icon: 'bookmark', section: CARNET },
  { key: 'embed', label: tx('Intégration'), hint: tx('Une note, une collection ou un lien en entier'), icon: 'embed', section: CARNET },
  { key: 'columns2', label: tx('2 colonnes'), hint: tx('Des blocs côte à côte sur un ordinateur'), icon: 'columns', section: LAYOUT },
  { key: 'columns3', label: tx('3 colonnes'), hint: tx('Des blocs côte à côte sur un ordinateur'), icon: 'columns', section: LAYOUT },
  { key: 'calendar', label: tx('Agenda'), hint: tx('Vos prochains événements, ceux d’un libellé ou tous'), icon: 'calendar', section: LAYOUT },
  { key: 'toc', label: tx('Table des matières'), hint: tx('Les titres de la page, pour y aller'), icon: 'contents', section: LAYOUT },
];

/** « Tableau » is also the board's name in the settings: the block's has its own English. */
const commandLabel = (command: InsertCommand): string => (command.key === 'table' ? tc('block', 'Tableau') : t(command.label));

const TURNS: Readonly<Record<string, BlockKind>> = { text: 'text', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', bullet: 'bullet', numbered: 'numbered', todo: 'todo', toggle: 'toggle', callout: 'callout', code: 'code' };

export const KIND_CHOICES: readonly { readonly kind: BlockKind; readonly label: string; readonly icon: GlyphName }[] = [
  { kind: 'text', label: tx('Texte'), icon: 'text' },
  { kind: 'h1', label: tx('Titre 1'), icon: 'heading1' },
  { kind: 'h2', label: tx('Titre 2'), icon: 'heading2' },
  { kind: 'h3', label: tx('Titre 3'), icon: 'heading3' },
  { kind: 'h4', label: tx('Titre 4'), icon: 'heading4' },
  { kind: 'bullet', label: tx('Liste à puces'), icon: 'list' },
  { kind: 'numbered', label: tx('Liste numérotée'), icon: 'numbered' },
  { kind: 'todo', label: tx('Liste de tâches'), icon: 'boxChecked' },
  { kind: 'toggle', label: tx('Liste dépliante'), icon: 'toggle' },
  { kind: 'callout', label: tx('Encadré'), icon: 'callout' },
  { kind: 'code', label: tx('Code'), icon: 'codeBlock' },
  { kind: 'page', label: tx('Page'), icon: 'page' },
];

const DISPLAYS: readonly { readonly display: TargetDisplay; readonly label: string; readonly icon: GlyphName }[] = [
  { display: 'mention', label: tx('Afficher en mention'), icon: 'mention' },
  { display: 'bookmark', label: tx('Afficher en signet'), icon: 'bookmark' },
  { display: 'embed', label: tx('Afficher en intégration'), icon: 'embed' },
];

const blockOf = (id: string): Block | undefined => useLibraryStore.getState().blocks[id];

/** The emoji sheet for a block's words, at `at`, in the keyboard's place. */
function openEmojiInsert(block: string, at: number): void {
  flushAll();
  Keyboard.dismiss();
  openPageSheet({ kind: 'insertEmoji', block, at });
}

/** Runs a picked command for the block it was asked from: in an empty one it becomes the new kind (or makes way); after a written one, a new block. */
function runCommand(command: InsertCommand, page: string, blockId: string, slashAt: number | undefined, openPage: (id: string) => void): void {
  const block = blockOf(blockId);
  if (!block) return;
  const handle = RICH_KINDS.has(block.kind) ? richHandle(blockId) : undefined;
  let runs = handle?.runs() ?? [];
  if (handle && slashAt !== undefined) {
    runs = deleteRich(runs, slashAt, slashAt + 1);
    handle.write(runs, { start: slashAt });
  }
  const empty = !!handle && richLength(runs) === 0;
  const turn = TURNS[command.key];
  if (turn) {
    if (empty) {
      turnInto(page, [blockId], turn, { label: mentionLabel, ...(turn === 'code' ? { language: 'plain' } : {}) });
      focusBlock(blockId, 'start');
    } else {
      const id = insertAfter(page, blockId, { kind: turn, text: '', ...(turn === 'todo' ? { checked: false } : {}), ...(turn === 'code' ? { language: 'plain' } : {}) });
      if (id) focusBlock(id, 'start');
    }
    return;
  }
  switch (command.key) {
    case 'table':
      insertTable(page, { afterId: blockId });
      if (empty) deleteBlocks(page, [blockId]);
      return;
    case 'page': {
      const id = createPage({ parentId: block.parentId ?? page, afterId: blockId, history: page });
      if (empty) deleteBlocks(page, [blockId]);
      requestTitleFocus(id);
      openPage(id);
      return;
    }
    case 'image':
    case 'video':
    case 'pdf':
    case 'file': {
      const id = placeBlock(page, blockId, { kind: command.key as MediaKind }, empty);
      if (id) pickAndAttach(page, id, command.key as MediaKind);
      return;
    }
    case 'mention': {
      const at = slashAt ?? handle?.selection().start ?? richLength(runs);
      openPageSheet({ kind: 'target', purpose: 'mention', block: blockId, at });
      return;
    }
    case 'date': {
      // Today at the caret, then the sheet to change it; a block without words (code) takes it in a paragraph after it.
      const today = dateOf(Date.now());
      if (handle) {
        const at = slashAt ?? handle.selection().start;
        const placed = placeAtom(runs, at, at, today);
        handle.write(placed.runs, null);
        openDateSheet(blockId, at, placed.caret);
        return;
      }
      const id = insertAfter(page, blockId, { kind: 'text', text: serializeRich([today, { kind: 'text', text: ' ', marks: {} }]) });
      if (id) openDateSheet(id, 0, 2);
      return;
    }
    case 'emoji': {
      // A code block takes an emoji as it is.
      const at = slashAt ?? richHandle(blockId)?.selection().start ?? 0;
      openEmojiInsert(blockId, at);
      return;
    }
    case 'bookmark':
    case 'embed':
      openPageSheet({ kind: 'target', purpose: command.key, block: blockId, replace: empty });
      return;
    case 'columns2':
    case 'columns3': {
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
    case 'drawing': {
      const id = placeBlock(page, blockId, { kind: 'drawing' }, empty);
      if (id) openDrawing({ kind: 'block', page, block: id });
      return;
    }
  }
}

function InsertSheet({ page, openPage }: { page: string; openPage: (id: string) => void }) {
  const { visible, sheet } = useSheetOf('insert');
  const styles = useThemedStyles(makeStyles);
  const sections = useMemo(() => [...new Set(COMMANDS.map(command => command.section))], []);
  // A list to pick from, not a field: the keyboard steps aside so every block shows (a pick gives it back to the block).
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Ajouter un bloc')} tall>
      <SheetScroll contentContainerStyle={styles.list}>
        {sections.map(section => (
          <View key={section}>
            <AppText variant="section" style={styles.section}>
              {t(section)}
            </AppText>
            {COMMANDS.filter(command => command.section === section).map(command => (
              <ListRow
                key={command.key}
                icon={command.icon}
                title={commandLabel(command)}
                supporting={t(command.hint)}
                onPress={() => {
                  if (!sheet) return;
                  closePageSheet();
                  runCommand(command, page, sheet.block, sheet.slashAt, openPage);
                }}
              />
            ))}
          </View>
        ))}
      </SheetScroll>
    </Sheet>
  );
}

function TurnSheet({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('turn');
  const styles = useThemedStyles(makeStyles);
  const kind = useLibraryStore(s => (sheet ? s.blocks[sheet.block]?.kind : undefined));
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Transformer en')} tall>
      <SheetScroll contentContainerStyle={styles.list}>
        {KIND_CHOICES.filter(choice => choice.kind !== kind).map(choice => (
          <ListRow
            key={choice.kind}
            icon={choice.icon}
            title={t(choice.label)}
            onPress={() => {
              if (!sheet) return;
              closePageSheet();
              flushAll();
              turnInto(page, [sheet.block], choice.kind, { label: mentionLabel, ...(choice.kind === 'code' ? { language: 'plain' } : {}) });
              if (choice.kind !== 'page') focusBlock(sheet.block, 'end');
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

/** A page is better opened than embedded. */
/** A page is never embedded; a person is only mentioned. */
const canShow = (target: BlockTarget, display: TargetDisplay): boolean => (target.type === 'contact' || target.type === 'event' ? display === 'mention' : display !== 'embed' || target.type !== 'page');

function BlockActionsSheet({ page, openPage }: { page: string; openPage: (id: string) => void }) {
  const { visible, sheet } = useSheetOf('block');
  const styles = useThemedStyles(makeStyles);
  const block = useLibraryStore(s => (sheet ? s.blocks[sheet.block] : undefined));
  const embedsCollection = useLibraryStore(s => !!block && block.kind === 'embed' && block.target?.type === 'note' && s.notes[block.target.id]?.kind === 'links');
  const rows: { readonly label: string; readonly icon: GlyphName; readonly run: () => void; readonly danger?: boolean; readonly opensSheet?: boolean }[] = [];
  if (block) {
    const id = block.id;
    if (block.kind === 'page') rows.push({ label: t('Ouvrir'), icon: 'page', run: () => openPage(id) });
    if (TURNABLE.has(block.kind) && block.kind !== 'page') rows.push({ label: t('Transformer en…'), icon: 'refresh', run: () => openPageSheet({ kind: 'turn', block: id }), opensSheet: true });
    const shown = shownTarget(block);
    if (shown) {
      for (const { display, label, icon } of DISPLAYS) {
        if (display === shown.display || !canShow(shown.target, display)) continue;
        rows.push({ label: t(label), icon, run: () => showTargetAs(page, [id], display) });
      }
    }
    if (embedsCollection) rows.push(block.showDone ? { label: t('Masquer les déjà faits'), icon: 'eyeOff', run: () => setShowDone(page, id, false) } : { label: t('Afficher les déjà faits'), icon: 'eye', run: () => setShowDone(page, id, true) });
    if (block.kind === 'callout') rows.push({ label: t('Couleur…'), icon: 'palette', run: () => openPageSheet({ kind: 'calloutColor', block: id }), opensSheet: true });
    if (CAPTION_KINDS.has(block.kind)) rows.push(block.caption ? { label: t('Retirer la légende'), icon: 'close', run: () => updateBlock(page, id, { caption: '' }) } : { label: t('Ajouter une légende'), icon: 'textAlign', run: () => openCaption(id) });
    rows.push(
      {
        label: t('Dupliquer'),
        icon: 'copy',
        run: () => {
          const [copy] = duplicateBlocks(page, [id], visibleOutline(page));
          if (copy && RICH_KINDS.has(block.kind)) focusBlock(copy, 'end');
        },
      },
      { label: t('Déplacer vers…'), icon: 'transfer', run: () => openPageSheet({ kind: 'move', blocks: [id] }), opensSheet: true },
      // The page's blocks as rows to drag into place, this one chosen.
      { label: t('Réorganiser les blocs'), icon: 'grip', run: () => openReorder(page, id) },
    );
    if (RICH_KINDS.has(block.kind) || block.kind === 'code' || block.kind === 'table') rows.push({ label: t('Partager le texte'), icon: 'share', run: () => { Share.share({ message: blocksMarkdown([id]) }).catch(() => {}); } });
    rows.push(
      block.kind === 'page'
        ? {
            label: t('Mettre à la corbeille'),
            icon: 'trash',
            danger: true,
            run: () => {
              const undo = trashPage(id);
              showSnack(t('Page placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
            },
          }
        : { label: t('Supprimer'), icon: 'trash', danger: true, run: () => deleteBlocks(page, [id]) },
    );
  }
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Actions du bloc')}>
      <SheetScroll contentContainerStyle={styles.list}>
        {rows.map(row => (
          <ListRow
            key={row.label}
            icon={row.icon}
            title={row.label}
            danger={row.danger}
            onPress={() => {
              // A row opening another sheet hands over to it; any other closes this one first.
              if (!row.opensSheet) closePageSheet();
              flushAll();
              row.run();
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

function TargetHost({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('target');
  /** A mention or a date in place of what was typed to ask for it; a block without words (code) takes it in a paragraph after it. */
  const place = (atom: AtomRun): void => {
    if (!sheet) return;
    closePageSheet();
    const block = blockOf(sheet.block);
    const handle = block && RICH_KINDS.has(block.kind) ? richHandle(sheet.block) : undefined;
    if (!handle) {
      const id = insertAfter(page, sheet.block, { kind: 'text', text: serializeRich([atom, { kind: 'text', text: ' ', marks: {} }]) });
      if (id) focusBlock(id, 2);
      return;
    }
    const runs = handle.runs();
    const at = Math.min(sheet.at ?? handle.selection().start, richLength(runs));
    const placed = placeAtom(runs, at, sheet.typed ? typedEnd(runs, at, sheet.typed) : at, atom);
    handle.write(placed.runs, null);
    focusBlock(sheet.block, placed.caret);
  };
  return (
    <TargetSheet
      visible={visible}
      purpose={sheet?.purpose ?? 'mention'}
      pagesOnly={sheet?.typed === '[['}
      onDismiss={() => {
        closePageSheet();
        if (sheet?.purpose === 'mention' && sheet.at !== undefined) focusBlock(sheet.block, sheet.at + (sheet.typed?.length ?? 0));
      }}
      onPick={target => {
        if (!sheet) return;
        if (sheet.purpose === 'mention') {
          place({ kind: 'mention', target });
          return;
        }
        closePageSheet();
        placeBlock(page, sheet.block, targetBlock(sheet.purpose, target), sheet.replace ?? false);
      }}
      onPickDate={place}
    />
  );
}

function IconHost({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('emoji');
  const value = useLibraryStore(s => (sheet ? (s.blocks[sheet.block]?.icon ?? null) : null));
  return (
    <EmojiSheet
      visible={visible}
      allowNone={sheet?.allowNone ?? false}
      value={value}
      onDismiss={closePageSheet}
      onPick={emoji => {
        if (!sheet) return;
        closePageSheet();
        const block = blockOf(sheet.block);
        if (block?.kind === 'page') setPageIcon(block.id, emoji);
        else if (block && emoji) updateBlock(page, block.id, { icon: emoji });
      }}
    />
  );
}

/** An emoji for a block's words, at the caret it was asked from. */
function EmojiInsertHost() {
  const { visible, sheet } = useSheetOf('insertEmoji');
  return (
    <EmojiSheet
      visible={visible}
      allowNone={false}
      title={t('Insérer un emoji')}
      onDismiss={() => {
        closePageSheet();
        if (sheet) focusBlock(sheet.block, sheet.at);
      }}
      onPick={emoji => {
        if (!sheet || !emoji) return;
        closePageSheet();
        const handle = richHandle(sheet.block);
        if (!handle) return;
        const runs = handle.runs();
        const at = Math.min(sheet.at, richLength(runs));
        handle.write(insertRich(runs, at, [{ kind: 'text', text: emoji, marks: marksAt(runs, at) }]), null);
        focusBlock(sheet.block, at + emoji.length);
      }}
    />
  );
}

/** A page offered as where to go (« Déplacer vers », the import's « Importer dans »): its icon, its title, the pages above it; the one it is in now on the wash, ticked. */
export function PageChoice({ title, icon, path, here, onPress }: { title: string; icon: string | null; path: string; here: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = here ? theme.color.onActionContainer : theme.color.ink;
  return (
    <Tappable onPress={onPress} style={[styles.choice, here ? styles.choiceHere : null]} accessibilityRole="radio" accessibilityState={{ checked: here }} accessibilityLabel={path ? `${title}, ${path}` : title}>
      <Organic pebble={here ? 1 : null} style={[styles.choiceIcon, here ? styles.choiceIconHere : null]}>
        {icon ? <AppText style={styles.choiceEmoji}>{icon}</AppText> : <Icon name="page" size={24} color={ink} />}
      </Organic>
      <View style={styles.choiceText}>
        <AppText variant="bodyStrong" numberOfLines={1} color={ink}>
          {title}
        </AppText>
        {path ? (
          <AppText variant="meta" numberOfLines={1} color={here ? theme.color.onActionContainer : undefined}>
            {path}
          </AppText>
        ) : null}
      </View>
      {here ? <Icon name="check" size={20} color={theme.color.focus} /> : null}
    </Tappable>
  );
}

const NO_PAGES: Pick<LibraryState, 'blocks' | 'blocksByParent'> = { blocks: {}, blocksByParent: {} };

/**
 * « Déplacer vers », as the web's: every page out of the bin by its icon and title, the pages above
 * it under its title, sorted by where it sits; the one the blocks (or the page) are in ticked; a field
 * to find one among many. While nothing is typed, the pages changed last come first under
 * « Récentes » (the home's own), then every page under « Toutes les pages » (`movePlaces`). Never a
 * page they would land inside; a page may also go to the top level.
 */
function MoveHost({ page, openPage }: { page: string; openPage: (id: string) => void }) {
  const blocksSheet = useSheetOf('move');
  const pageSheet = useSheetOf('movePage');
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const visible = blocksSheet.visible || pageSheet.visible;
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const moving = pageSheet.visible ? (pageSheet.sheet ? [pageSheet.sheet.page] : []) : (blocksSheet.sheet?.blocks ?? []);
  const blocks = useLibraryStore(s => (visible ? s.blocks : null));
  const children = useLibraryStore(s => (visible ? s.blocksByParent : null));
  const [kept, setKept] = useState(blocks && children ? { blocks, blocksByParent: children } : null);
  if (blocks && children && (blocks !== kept?.blocks || children !== kept.blocksByParent)) setKept({ blocks, blocksByParent: children });
  const shown = blocks && children ? { blocks, blocksByParent: children } : (kept ?? NO_PAGES);
  // Where they are now: the page the blocks are in, or the page's own parent (null: the top level).
  const current = pageSheet.visible && pageSheet.sheet ? containingPage(shown.blocks, pageSheet.sheet.page) : page;
  const movingKey = moving.join(',');
  const { recent, all } = useMemo(() => {
    const subjects = movingKey ? movingKey.split(',') : [];
    return movePlaces(shown.blocks, shown.blocksByParent, { query, exclude: id => subjects.some(subject => isWithin(shown.blocks, id, subject)), current, untitled: t(UNTITLED_PAGE) });
  }, [shown.blocks, shown.blocksByParent, query, movingKey, current]);
  const headed = recent.length > 0;
  const choice = ({ page: target, path }: MovePlace, key: string) => (
    <PageChoice key={key} title={target.text.trim() || t(UNTITLED_PAGE)} icon={target.icon} path={path} here={target.id === current} onPress={() => pick(target.id)} />
  );
  const pick = (target: string | null): void => {
    closePageSheet();
    if (target === current) return;
    flushAll();
    const title = target ? useLibraryStore.getState().blocks[target]?.text.trim() || t(UNTITLED_PAGE) : '';
    if (pageSheet.visible && pageSheet.sheet) {
      if (movePage(pageSheet.sheet.page, { into: target })) showSnack(target ? t('Page déplacée vers {page}', { page: title }) : t('Page déplacée au premier niveau'), undefined, { tone: 'success' });
      return;
    }
    if (!target) return;
    const ids = blocksSheet.sheet?.blocks ?? [];
    const last = (useLibraryStore.getState().blocksByParent[target] ?? []).filter(id => !ids.includes(id)).pop() ?? null;
    if (moveBlocks(page, ids, { parentId: target, afterId: last }, visibleOutline(page))) {
      showSnack(ids.length > 1 ? t('{blocks} déplacés vers {page}', { blocks: plural(ids.length, 'bloc'), page: title }) : t('Bloc déplacé vers {page}', { page: title }), { label: t('Ouvrir'), run: () => openPage(target) }, { tone: 'success' });
    }
  };
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Déplacer vers')} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Chercher une page')} accessibilityLabel={t('Chercher une page')} />
      </View>
      <SheetScroll top={false} contentContainerStyle={styles.list}>
        {headed ? (
          <>
            <AppText variant="section" style={styles.section} accessibilityRole="header">
              {t('Récentes')}
            </AppText>
            {recent.map(place => choice(place, `recent-${place.page.id}`))}
            <AppText variant="section" style={styles.section} accessibilityRole="header">
              {t('Toutes les pages')}
            </AppText>
          </>
        ) : null}
        {pageSheet.visible && !query.trim() ? <PageChoice title={t('Au premier niveau')} icon={null} path={t('Avec les pages de l’accueil')} here={current === null} onPress={() => pick(null)} /> : null}
        {all.map(place => choice(place, place.page.id))}
        {all.length === 0 ? <EmptyLine text={t('Aucune page ne correspond.')} style={styles.empty} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

/** A code block's language, as the web's picker: a field finds it by name or alias, the one it is in ticked. */
function LanguageSheet({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('language');
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const current = useLibraryStore(s => (sheet ? s.blocks[sheet.block]?.language : undefined));
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const found = useMemo(() => {
    const wanted = foldText(query.trim());
    return CODE_LANGUAGES.filter(language => !wanted || foldText(`${language.name} ${language.key} ${language.aliases.join(' ')}`).includes(wanted));
  }, [query]);
  const pick = (key: string): void => {
    if (!sheet) return;
    closePageSheet();
    updateBlock(page, sheet.block, { language: key });
  };
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Langage')} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Chercher un langage')} accessibilityLabel={t('Chercher un langage')} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => (found[0] ? pick(found[0].key) : undefined)} />
      </View>
      <SheetScroll top={false} contentContainerStyle={styles.list}>
        {found.map(language => (
          <ListRow
            key={language.key}
            title={t(language.name)}
            trailing={language.key === (current || 'plain') ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
            onPress={() => pick(language.key)}
          />
        ))}
        {found.length === 0 ? <EmptyLine text={t('Aucun langage ne correspond.')} style={styles.empty} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

/** A callout's pigment (its block's colour is a drawing's background on a drawing). */
const asLineColorOf = (color: string | null | undefined): LineColor | null => (isLineColor(color) ? color : null);

function CalloutColorSheet({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('calloutColor');
  const styles = useThemedStyles(makeStyles);
  const color = useLibraryStore(s => (sheet ? asLineColorOf(s.blocks[sheet.block]?.color) : null));
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Couleur de l’encadré')}>
      <View style={styles.pad}>
        <LineColorPicker allowNone value={color} onChange={next => sheet && updateBlock(page, sheet.block, { color: next })} />
      </View>
    </Sheet>
  );
}

/** The default and the fourteen pigments in full rows of five: the first in line with its label, the last on the sheet's other edge. */
const SWATCHES_A_ROW = 5;
const SWATCHES = [null, ...LINE_COLORS] as const;
const SWATCH_ROWS = Array.from({ length: Math.ceil(SWATCHES.length / SWATCHES_A_ROW) }, (_, row) => SWATCHES.slice(row * SWATCHES_A_ROW, (row + 1) * SWATCHES_A_ROW).map((color, offset) => ({ color, index: row * SWATCHES_A_ROW + offset })));

/** Words' colour and highlight, each a pigment or none; the sheet stays for the other. */
/**
 * Colours for words, as the web's: a paper pebble with the letter in that ink (the text), or a pebble
 * of the highlight's wash; the default first; the chosen one ringed in the focus ink.
 */
const TextSwatches = memo(function TextSwatches({ kind, value, onPick }: { kind: 'fg' | 'bg'; value: LineColor | null; onPick: (color: LineColor | null) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={kind === 'fg' ? t('Couleur du texte') : t('Surlignage')}>
      {SWATCH_ROWS.map((row, at) => (
        <View key={at} style={styles.swatchRow}>
          {row.map(({ color, index }) => {
            const chosen = color === value;
            return (
              <Tappable
                key={color ?? 'none'}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={color ? LINE_COLOR_NAMES[color] : kind === 'fg' ? t('Couleur par défaut') : t('Sans surlignage')}
                onPress={() => onPick(color)}
                hitSlop={4}
                pebble={pebbleTurn(index)}
                style={[styles.textSwatch, { backgroundColor: kind === 'bg' && color ? theme.line[color].tint : theme.color.paper, borderColor: chosen ? theme.color.focus : theme.color.hairline, borderWidth: chosen ? 2 : 1 }]}
              >
                {kind === 'fg' ? (
                  <AppText variant="bodyStrong" color={color ? theme.line[color].text : theme.color.ink}>
                    A
                  </AppText>
                ) : null}
              </Tappable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

function TextColorSheet() {
  const { visible, sheet } = useSheetOf('textColor');
  const styles = useThemedStyles(makeStyles);
  const [, refresh] = useState(0);
  const handle = sheet ? richHandle(sheet.block) : undefined;
  const runs = handle?.runs() ?? [];
  const value = (key: 'fg' | 'bg'): LineColor | null => (sheet ? (rangeValue(runs, sheet.start, sheet.end, key) as LineColor | null) : null);
  const apply = (key: 'fg' | 'bg', color: LineColor | null): void => {
    if (!sheet || !handle) return;
    handle.write(setValue(handle.runs(), sheet.start, sheet.end, key, color), { start: sheet.start, end: sheet.end });
    refresh(n => n + 1);
  };
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Couleur et surlignage')}>
      <SheetScroll contentContainerStyle={styles.pad}>
        <AppText variant="metaStrong" style={styles.label}>
          {t('Couleur du texte')}
        </AppText>
        <TextSwatches kind="fg" value={value('fg')} onPick={color => apply('fg', color)} />
        <AppText variant="metaStrong" style={[styles.label, styles.labelGap]}>
          {t('Surlignage')}
        </AppText>
        <TextSwatches kind="bg" value={value('bg')} onPick={color => apply('bg', color)} />
      </SheetScroll>
    </Sheet>
  );
}

function LinkSheet() {
  const { visible, sheet } = useSheetOf('link');
  const styles = useThemedStyles(makeStyles);
  const [address, setAddress] = useState('');
  const handle = sheet ? richHandle(sheet.block) : undefined;
  const current = sheet && handle ? rangeValue(handle.runs(), sheet.start, sheet.end, 'a') : null;
  const write = (value: string | null): void => {
    closePageSheet();
    if (!sheet || !handle) return;
    handle.write(setValue(handle.runs(), sheet.start, sheet.end, 'a', value), { start: sheet.end });
    focusBlock(sheet.block, sheet.end);
  };
  const trimmed = address.trim();
  // An address as the web reads one: mail and telephone as they are, anything else a web address found in it.
  const link = /^(mailto:|tel:)/i.test(trimmed) ? trimmed : (extractUrls(trimmed)[0] ?? null);
  const save = () => {
    if (link) write(normalizeUrl(link));
  };
  // Words that hold no address are said under the field, what was typed kept; the keyboard's « OK » saves.
  const form = useForm({ address: trimmed && !link ? t('Ce n’est pas une adresse : tapez par exemple example.org ou https://example.org/page.') : null }, { order: ['address'], sendOnDone: save });
  useEffect(() => {
    if (!visible) return;
    setAddress(current ?? '');
    form.reset();
    // Read once as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={current ? t('Modifier le lien') : t('Ajouter un lien')}>
      <View style={styles.pad}>
        <TextField label={t('Adresse')} kind="url" field={form.field('address')} value={address} onChangeText={setAddress} autoFocus placeholder="https://…" />
      </View>
      <FormFoot message={form.message}>
        {current ? <Button kind="dangerText" label={t('Retirer le lien')} onPress={() => write(null)} /> : null}
        <Button kind="filled" label={t('Enregistrer')} disabled={!trimmed} onPress={() => void form.submit(save)} />
      </FormFoot>
    </Sheet>
  );
}

/** Every sheet a page opens, mounted once beside it. */
function PageSheetsComponent({ page, openPage }: { page: string; openPage: (id: string) => void }) {
  return (
    <>
      <InsertSheet page={page} openPage={openPage} />
      <TurnSheet page={page} />
      <BlockActionsSheet page={page} openPage={openPage} />
      <TargetHost page={page} />
      <DateSheetHost page={page} />
      <IconHost page={page} />
      <EmojiInsertHost />
      <MoveHost page={page} openPage={openPage} />
      <LanguageSheet page={page} />
      <CalloutColorSheet page={page} />
      <TextColorSheet />
      <LinkSheet />
      {/* « Réorganiser », over the page and its sheets. */}
      <ReorderHost page={page} />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { paddingBottom: 16 },
    // On the rows' glyphs and the sheet's title: its column.
    section: { paddingHorizontal: SHEET_INSET, paddingTop: 14, paddingBottom: 4 },
    // What a sheet holds besides its rows lies on its column, with its title.
    pad: { paddingHorizontal: SHEET_INSET, paddingBottom: 16, gap: 8 },
    label: { paddingTop: 4 },
    labelGap: { paddingTop: 16 },
    // Full rows across the sheet (eight to a row overflowed a phone's width, leaving one alone on a third row).
    swatches: { gap: 8 },
    swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
    textSwatch: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    search: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    // A list row's geometry: 56 high, the mark on the sheet's column (24 from its edge), the words at 64, the one it is in on the wash with the focus edge.
    choice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    choiceHere: { backgroundColor: theme.color.actionContainer, borderWidth: 1.5, borderColor: theme.color.focus },
    // A little wider than the 24 slot it takes, so the paper pebble under the mark clears it.
    choiceIcon: { width: 28, height: 28, marginHorizontal: -2, alignItems: 'center', justifyContent: 'center' },
    // On the wash, the mark lies on a paper pebble.
    choiceIconHere: { backgroundColor: theme.color.paper },
    choiceEmoji: { fontSize: 20, lineHeight: 26 },
    choiceText: { flex: 1, gap: 2 },
    empty: { padding: 16 },
  });

export const PageSheets = memo(PageSheetsComponent);
