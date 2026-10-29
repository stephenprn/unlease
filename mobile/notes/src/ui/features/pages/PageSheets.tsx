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
import { CAPTION_KINDS, RICH_KINDS, UNTITLED_PAGE, type Block, type BlockKind, type BlockTarget, type MediaKind } from '@unlease/notes/models/blocks';
import type { LineColor } from '@unlease/design/colors';
import { isWithin, shownTarget, type TargetDisplay } from '@unlease/notes/services/blocks';
import { CODE_LANGUAGES } from '@unlease/notes/services/code';
import { dateOf } from '@unlease/core/services/dates';
import { deleteRich, insertRich, marksAt, rangeValue, richLength, serializeRich, setValue, type AtomRun } from '@unlease/core/services/richText';
import { foldText } from '@unlease/core/services/search';
import { normalizeUrl } from '@unlease/core/services/url';
import { childPagesOf, mentionLabel } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { createPage, deleteBlocks, duplicateBlocks, insertAfter, insertColumns, insertTable, moveBlocks, movePage, placeBlock, setPageIcon, setShowDone, showTargetAs, targetBlock, trashPage, TURNABLE, turnInto, updateBlock } from '@app/store/pages';
import { requestTitleFocus } from '@app/store/pagesUi';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Icon, ListRow, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { SHAPES } from '@unlease/design/shapes';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { openDrawing } from '../drawing/openDrawing';
import { LineColorPicker } from '../lines/LineColorPicker';
import { openCaption } from './Caption';
import { DateSheetHost, openDateSheet } from './DateSheet';
import { EmojiSheet } from './EmojiSheet';
import { flushAll, focusBlock, richHandle, visibleOutline } from './editorStore';
import { placeAtom, typedEnd } from './inline';
import { pickAndAttach } from './MediaBlock';
import { blocksMarkdown } from './pageExport';
import { closePageSheet, openPageSheet, useSheetOf } from './sheetStore';
import { TargetSheet } from './TargetSheet';

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
  { key: 'video', label: tx('Vidéo'), hint: tx('Une vidéo YouTube, Vimeo…'), icon: 'video', section: MEDIA },
  { key: 'pdf', label: tx('PDF'), hint: tx('Un document par son adresse'), icon: 'pdf', section: MEDIA },
  { key: 'file', label: tx('Fichier'), hint: tx('Un fichier par son adresse'), icon: 'file', section: MEDIA },
  { key: 'drawing', label: tx('Dessin'), hint: tx('Une zone où dessiner'), icon: 'draw', section: MEDIA },
  { key: 'mention', label: tx('Mention'), hint: tx('Citer une note, une collection, un lien ou une page'), icon: 'mention', section: CARNET },
  { key: 'bookmark', label: tx('Signet'), hint: tx('Une note, une collection, un lien ou une page en carte'), icon: 'bookmark', section: CARNET },
  { key: 'embed', label: tx('Intégration'), hint: tx('Une note, une collection ou un lien en entier'), icon: 'embed', section: CARNET },
  { key: 'columns2', label: tx('2 colonnes'), hint: tx('Des blocs côte à côte sur un ordinateur'), icon: 'columns', section: LAYOUT },
  { key: 'columns3', label: tx('3 colonnes'), hint: tx('Des blocs côte à côte sur un ordinateur'), icon: 'columns', section: LAYOUT },
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
const canShow = (target: BlockTarget, display: TargetDisplay): boolean => display !== 'embed' || target.type !== 'page';

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

/** Every page out of the bin, as the tree has them, each with its depth. */
function usePageTree(): readonly { readonly id: string; readonly depth: number }[] {
  const joined = useLibraryStore(s => {
    const out: string[] = [];
    const walk = (parent: string | null, depth: number): void => {
      if (depth > 30) return;
      for (const id of childPagesOf(s, parent)) {
        out.push(`${id}:${depth}`);
        walk(id, depth + 1);
      }
    };
    walk(null, 0);
    return out.join(',');
  });
  return useMemo(
    () =>
      joined
        ? joined.split(',').map(entry => {
            const [id = '', depth = '0'] = entry.split(':');
            return { id, depth: Number(depth) };
          })
        : [],
    [joined],
  );
}

function PageChoice({ id, depth, onPick }: { id: string; depth: number; onPick: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const page = useLibraryStore(s => s.blocks[id]);
  if (!page) return null;
  return (
    <Tappable onPress={() => onPick(id)} style={[styles.choice, { paddingLeft: 16 + depth * 18 }]} accessibilityLabel={page.text.trim() || t(UNTITLED_PAGE)}>
      <View style={styles.choiceIcon}>{page.icon ? <AppText style={styles.choiceEmoji}>{page.icon}</AppText> : <Icon name="page" size={22} color={theme.color.ink} />}</View>
      <AppText variant="body" numberOfLines={1} style={styles.choiceTitle}>
        {page.text.trim() || t(UNTITLED_PAGE)}
      </AppText>
    </Tappable>
  );
}

/** Where blocks or a page go: any page out of the bin but those they would land inside; a page may also go to the top level. */
function MoveHost({ page, openPage }: { page: string; openPage: (id: string) => void }) {
  const blocksSheet = useSheetOf('move');
  const pageSheet = useSheetOf('movePage');
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const visible = blocksSheet.visible || pageSheet.visible;
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const tree = usePageTree();
  const moving = pageSheet.visible ? (pageSheet.sheet ? [pageSheet.sheet.page] : []) : (blocksSheet.sheet?.blocks ?? []);
  const blocks = useLibraryStore(s => s.blocks);
  const wanted = foldText(query.trim());
  const choices = tree.filter(({ id }) => !moving.some(subject => isWithin(blocks, id, subject)) && (!wanted || foldText(blocks[id]?.text ?? '').includes(wanted)));
  const pick = (target: string | null): void => {
    closePageSheet();
    flushAll();
    const title = target ? blocks[target]?.text.trim() || t(UNTITLED_PAGE) : '';
    if (pageSheet.visible && pageSheet.sheet) {
      if (movePage(pageSheet.sheet.page, { into: target })) showSnack(target ? t('Page déplacée vers {title}', { title }) : t('Page déplacée au premier niveau'), undefined, { tone: 'success' });
      return;
    }
    if (!target) return;
    const ids = blocksSheet.sheet?.blocks ?? [];
    const last = (useLibraryStore.getState().blocksByParent[target] ?? []).filter(id => !ids.includes(id)).pop() ?? null;
    if (moveBlocks(page, ids, { parentId: target, afterId: last }, visibleOutline(page))) {
      showSnack(ids.length > 1 ? t('{count} blocs déplacés vers {title}', { count: ids.length, title }) : t('Bloc déplacé vers {title}', { title }), { label: t('Ouvrir'), run: () => openPage(target) }, { tone: 'success' });
    }
  };
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Déplacer vers')} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Rechercher une page')} accessibilityLabel={t('Rechercher une page')} />
      </View>
      <SheetScroll contentContainerStyle={styles.list}>
        {pageSheet.visible ? <ListRow icon="arrowUp" title={t('Au premier niveau')} supporting={t('Une page à part, dans « Toutes les pages »')} onPress={() => pick(null)} /> : null}
        {choices.map(choice => (
          <PageChoice key={choice.id} id={choice.id} depth={wanted ? 0 : choice.depth} onPick={pick} />
        ))}
        {choices.length === 0 ? (
          <AppText variant="meta" style={styles.empty}>
            {t('Aucune page ne correspond.')}
          </AppText>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

function LanguageSheet({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('language');
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const current = useLibraryStore(s => (sheet ? s.blocks[sheet.block]?.language : undefined));
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Langage')} tall>
      <SheetScroll contentContainerStyle={styles.list}>
        {CODE_LANGUAGES.map(language => (
          <ListRow
            key={language.key}
            title={t(language.name)}
            trailing={language.key === (current || 'plain') ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
            onPress={() => {
              if (!sheet) return;
              closePageSheet();
              updateBlock(page, sheet.block, { language: language.key });
            }}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

function CalloutColorSheet({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('calloutColor');
  const styles = useThemedStyles(makeStyles);
  const color = useLibraryStore(s => (sheet ? (s.blocks[sheet.block]?.color ?? null) : null));
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Couleur de l’encadré')}>
      <View style={styles.pad}>
        <LineColorPicker allowNone value={color} onChange={next => sheet && updateBlock(page, sheet.block, { color: next })} />
      </View>
    </Sheet>
  );
}

/** Words' colour and highlight, each a pigment or none; the sheet stays for the other. */
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
    <Sheet visible={visible} onDismiss={closePageSheet} title={t('Couleur du texte')}>
      <SheetScroll contentContainerStyle={styles.pad}>
        <AppText variant="metaStrong" style={styles.label}>
          {t('Texte')}
        </AppText>
        <LineColorPicker allowNone value={value('fg')} onChange={color => apply('fg', color)} />
        <AppText variant="metaStrong" style={[styles.label, styles.labelGap]}>
          {t('Surlignage')}
        </AppText>
        <LineColorPicker allowNone value={value('bg')} onChange={color => apply('bg', color)} />
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
  useEffect(() => {
    if (visible) setAddress(current ?? '');
    // Read once as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const write = (value: string | null): void => {
    closePageSheet();
    if (!sheet || !handle) return;
    handle.write(setValue(handle.runs(), sheet.start, sheet.end, 'a', value), { start: sheet.end });
    focusBlock(sheet.block, sheet.end);
  };
  const trimmed = address.trim();
  return (
    <Sheet visible={visible} onDismiss={closePageSheet} title={current ? t('Modifier le lien') : t('Ajouter un lien')}>
      <View style={styles.pad}>
        <TextField label={t('Adresse')} value={address} onChangeText={setAddress} autoFocus autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" onSubmitEditing={() => trimmed && write(normalizeUrl(trimmed))} />
        <View style={styles.actions}>
          {current ? <Button kind="text" label={t('Retirer le lien')} onPress={() => write(null)} /> : <View />}
          <Button kind="filled" label={t('Enregistrer')} disabled={!trimmed} onPress={() => write(normalizeUrl(trimmed))} />
        </View>
      </View>
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
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { paddingBottom: 16 },
    section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    pad: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    label: { paddingTop: 4 },
    labelGap: { paddingTop: 16 },
    actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
    search: { paddingHorizontal: 16, paddingBottom: 8 },
    choice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 6, paddingRight: 12, ...corners(SHAPES.tab) },
    choiceIcon: { width: 26, alignItems: 'center' },
    choiceEmoji: { fontSize: 20, lineHeight: 26 },
    choiceTitle: { flex: 1 },
    empty: { padding: 16, color: theme.color.inkMuted },
  });

export const PageSheets = memo(PageSheetsComponent);
