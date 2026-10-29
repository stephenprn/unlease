/**
 * One page of the knowledge base on the phone, written in place as on the web: the pages above it
 * on one line, its icon and title, then its blocks. While a block holds the caret, a bar rides on
 * the keyboard with its actions; the top bar undoes and redoes, and its menu adds a sub-page,
 * moves, copies, shares or bins the page. The title joins the top bar once it has scrolled up
 * under it. A page in the bin reads as it is and takes nothing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, StackActions } from '@react-navigation/native';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/notes/models/blocks';
import { ancestorPages, isInBin } from '@unlease/notes/services/blocks';
import { isPrivatePage } from '@unlease/notes/services/pagesAsk';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { closePagesAsk, openPagesAsk, usePagesAskSettings } from '@app/pagesAsk';
import { useLibraryStore } from '@app/store/libraryStore';
import { canRedo, canUndo, redoPage, undoPage } from '@app/store/pageHistory';
import { createPage, duplicateBlocks, insertBlock, renamePage, restorePage, setPagePrivate, splitTitle, trashPage } from '@app/store/pages';
import { expandAll, rememberPage, requestTitleFocus, takeTitleFocus } from '@app/store/pagesUi';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Ground, Icon, IconButton, Menu, Tappable } from '../components';
import { useKeyboardTop } from '../components/useKeyboardVisible';
import { BlockBar } from '../features/pages/BlockBar';
import { blockTop, drawnBlock, flashBlock, openTogglesAbove } from '../features/pages/blockJump';
import { BlockList } from '../features/pages/BlockView';
import { flushAll, focusBlock, resyncFields, useEditorStore } from '../features/pages/editorStore';
import { MediaHost } from '../features/pages/MediaBlock';
import { PageAskSheet } from '../features/pages/PageAskSheet';
import { PageContext, type PageContextValue } from '../features/pages/PageContext';
import { pageMarkdown } from '../features/pages/pageExport';
import { openPageSheet } from '../features/pages/sheetStore';
import { PageSheets } from '../features/pages/PageSheets';
import { TableSheetHost } from '../features/pages/TableSheets';
import type { ScreenProps } from '../navigation/types';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { fontFamily } from '../theme/typography';

const SAVE_AFTER_MS = 350;

/** The pages above this one, on one line: the first, then the parent; what does not fit folds into « … ». */
function Breadcrumb({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const joined = useLibraryStore(s => ancestorPages(s.blocks, id).map(page => page.id).join(','));
  const ids = joined ? joined.split(',') : [];
  const blocks = useLibraryStore(s => s.blocks);
  if (ids.length === 0) return null;
  const shown = ids.length > 2 ? [ids[0]!, null, ids[ids.length - 1]!] : ids;
  return (
    <View style={styles.crumbs} accessibilityRole="toolbar" accessibilityLabel={t('Pages au-dessus')}>
      {shown.map((crumb, index) => (
        <React.Fragment key={crumb ?? 'fold'}>
          {index > 0 ? <Icon name="chevronRight" size={14} color={theme.color.inkMuted} /> : null}
          {crumb ? (
            <Tappable onPress={() => onOpen(crumb)} hitSlop={{ top: 6, bottom: 6 }} style={styles.crumb} accessibilityRole="link">
              {blocks[crumb]?.icon ? <AppText variant="meta">{blocks[crumb]!.icon}</AppText> : null}
              <AppText variant="metaStrong" numberOfLines={1} style={styles.crumbText}>
                {blocks[crumb]?.text.trim() || t(UNTITLED_PAGE)}
              </AppText>
            </Tappable>
          ) : (
            <AppText variant="metaStrong" style={styles.fold}>
              …
            </AppText>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

/** The page's title, typed in place: Enter takes what follows the caret into the first paragraph. */
function TitleField({ id, readOnly, onFocusChange }: { id: string; readOnly: boolean; onFocusChange: (focused: boolean) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const stored = useLibraryStore(s => s.blocks[id]?.text ?? '');
  const [draft, setDraft] = useState(stored);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saved = useRef(stored);
  const [focused, setFocused] = useState(false);
  const selection = useRef({ start: 0, end: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoFocus] = useState(() => takeTitleFocus(id));

  useEffect(() => {
    if (focused || stored === saved.current) return;
    saved.current = stored;
    setDraft(stored);
  }, [stored, focused]);

  const epoch = useEditorStore(s => s.epoch);
  useEffect(() => {
    if (epoch === 0) return;
    const current = useLibraryStore.getState().blocks[id]?.text ?? '';
    saved.current = current;
    setDraft(current);
  }, [epoch, id]);

  const save = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (text === saved.current) return;
      saved.current = renamePage(id, saved.current, text);
      if (saved.current !== text) setDraft(saved.current);
    },
    [id],
  );
  useEffect(() => () => save(draftRef.current), [save]);

  return (
    <TextInput
      value={draft}
      editable={!readOnly}
      autoFocus={autoFocus && !readOnly}
      multiline
      scrollEnabled={false}
      submitBehavior="submit"
      onSubmitEditing={() => {
        const text = draftRef.current;
        const caret = Math.min(selection.current.start, text.length);
        save(text);
        setDraft(text.slice(0, caret));
        saved.current = text.slice(0, caret);
        focusBlock(splitTitle(id, text.slice(0, caret), text.slice(caret)), 'start');
      }}
      onChangeText={text => {
        const clean = text.replace(/\n/g, ' ');
        setDraft(clean);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save(draftRef.current), SAVE_AFTER_MS);
      }}
      onSelectionChange={event => {
        selection.current = event.nativeEvent.selection;
      }}
      onFocus={() => {
        setFocused(true);
        onFocusChange(true);
      }}
      onBlur={() => {
        save(draftRef.current);
        setFocused(false);
        onFocusChange(false);
      }}
      placeholder={t(UNTITLED_PAGE)}
      placeholderTextColor={theme.color.inkFaint}
      selectionColor={theme.color.highlight}
      selectionHandleColor={theme.color.focus}
      cursorColor={theme.color.focus}
      maxLength={TEXT_LIMITS.block.text}
      style={[styles.title, { fontFamily: fontFamily(theme, 'Bold') }]}
      accessibilityLabel={t('Titre de la page')}
    />
  );
}

export function PageScreen({ navigation, route }: ScreenProps<'Page'>) {
  const id = route.params.id;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const exists = useLibraryStore(s => s.blocks[id]?.kind === 'page' && s.blocks[id]?.deletedAt === null);
  const title = useLibraryStore(s => s.blocks[id]?.text.trim() || t(UNTITLED_PAGE));
  const icon = useLibraryStore(s => s.blocks[id]?.icon ?? null);
  const binned = useLibraryStore(s => isInBin(s.blocks, id));
  const empty = useLibraryStore(s => (s.blocksByParent[id]?.length ?? 0) === 0);
  // Read again with every change, so the arrows know whether there is a step to take.
  useLibraryStore(s => s.revision);
  const [menu, setMenu] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [titleUnder, setTitleUnder] = useState(false);
  const titleBottom = useRef(0);
  const editing = useEditorStore(s => s.focused !== null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ask = usePagesAskSettings() !== null;
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, id));
  // The keyboard's overlap, known even when it was up before this page opened (a sub-page made while typing).
  const keyboardTop = useKeyboardTop();
  const frame = useRef<React.ComponentRef<typeof View>>(null);
  const [frameBottom, setFrameBottom] = useState<number | null>(null);
  const keyboardPad = keyboardTop !== null && frameBottom !== null ? Math.max(0, frameBottom - keyboardTop) : 0;

  useEffect(() => {
    if (!exists) return;
    rememberPage(id);
    expandAll(ancestorPages(useLibraryStore.getState().blocks, id).map(page => page.id));
  }, [id, exists]);

  // Opened at a block (a source Claude cited): the toggles above it opened, scrolled to, lit a moment.
  const target = route.params.block;
  useEffect(() => {
    if (!target || !exists) return;
    const shown = drawnBlock(target);
    openTogglesAbove(shown, id);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const done = (): void => navigation.setParams({ block: undefined });
    const find = (): void => {
      const content = scroll.current?.getInnerViewRef();
      if (!content) return done();
      void blockTop(shown, content).then(top => {
        if (stopped) return;
        if (top === null) {
          tries += 1;
          // Drawn a moment later (a toggle just opened); not drawn in two seconds, it is not here.
          if (tries < 40) timer = setTimeout(find, 50);
          else done();
          return;
        }
        scroll.current?.scrollTo({ y: Math.max(0, top - 96), animated: true });
        flashBlock(shown);
        done();
      });
    };
    timer = setTimeout(find, 80);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [target, exists, id, navigation]);

  /** A source Claude cited: its page, at its block, this one scrolled, another opened (or gone back to). */
  const openAt = useCallback(
    (pageId: string, blockId: string | null) => {
      closePagesAsk();
      flushAll();
      if (pageId === id) {
        if (blockId) navigation.setParams({ block: blockId });
        return;
      }
      const routes = navigation.getState().routes;
      const at = routes.findIndex(route => route.name === 'Page' && (route.params as { id?: string } | undefined)?.id === pageId);
      if (at < 0) {
        navigation.push('Page', { id: pageId, ...(blockId ? { block: blockId } : {}) });
        return;
      }
      navigation.pop(routes.length - 1 - at);
      if (blockId) navigation.dispatch({ ...CommonActions.setParams({ block: blockId }), source: routes[at]!.key });
    },
    [navigation, id],
  );

  // A page already open further down (the breadcrumb's parent) is gone back to, never opened twice: two editors of one page share its fields' handles.
  const showPage = useCallback(
    (pageId: string) => {
      const routes = navigation.getState().routes;
      const at = routes.findIndex(route => route.name === 'Page' && (route.params as { id?: string } | undefined)?.id === pageId);
      if (at >= 0) navigation.pop(routes.length - 1 - at);
      else navigation.push('Page', { id: pageId });
    },
    [navigation],
  );

  const openPage = useCallback(
    (pageId: string) => {
      flushAll();
      if (pageId !== id) showPage(pageId);
    },
    [showPage, id],
  );

  const openTarget = useCallback(
    (target: BlockTarget) => {
      flushAll();
      if (target.type === 'page') {
        if (target.id !== id) showPage(target.id);
        return;
      }
      if (target.type === 'link') {
        navigation.navigate('Link', { id: target.id });
        return;
      }
      const note = useLibraryStore.getState().notes[target.id];
      if (!note || note.deletedAt !== null) return;
      if (note.kind === 'links') navigation.navigate('Line', { id: target.id });
      else navigation.navigate('Note', { id: target.id });
    },
    [navigation, showPage, id],
  );

  // A heading picked in a table of contents: the page goes to it as to a block Claude cited.
  const jumpTo = useCallback(
    (blockId: string) => {
      flushAll();
      navigation.setParams({ block: blockId });
    },
    [navigation],
  );

  const context = useMemo<PageContextValue>(() => ({ page: id, readOnly: binned, openTarget, jumpTo }), [id, binned, openTarget, jumpTo]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const under = event.nativeEvent.contentOffset.y > titleBottom.current;
    if (under !== titleUnder) setTitleUnder(under);
  };

  const step = (direction: 'undo' | 'redo'): void => {
    flushAll();
    const caret = direction === 'undo' ? undoPage(id) : redoPage(id);
    resyncFields();
    if (caret) focusBlock(caret.block, caret.offset);
  };

  /** A press under the last block: into its words when it is an empty paragraph, else a new one. */
  const writeAtEnd = (): void => {
    if (binned) return;
    flushAll();
    const { blocks, blocksByParent } = useLibraryStore.getState();
    const children = blocksByParent[id] ?? [];
    const last = blocks[children[children.length - 1] ?? ''];
    if (last && last.kind === 'text' && last.text === '') {
      focusBlock(last.id, 'start');
      return;
    }
    focusBlock(insertBlock(id, id, children.length, { kind: 'text', text: '' }), 'start');
  };

  if (!exists) {
    return (
      <View style={styles.screen}>
        <Ground />
        <View style={{ paddingTop: insets.top }}>
          <IconButton icon="back" label={t('Retour')} onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.gone}>
          <AppText variant="body">{t('Cette page n’existe plus.')}</AppText>
        </View>
      </View>
    );
  }

  const ownKept = useLibraryStore.getState().blocks[id]?.private === true;
  const menuItems = [
    ...(ask && !kept ? [{ label: t('Demander à Claude'), icon: 'sparkle' as const, onPress: () => openPagesAsk(id) }] : []),
    {
      label: t('Ajouter une sous-page'),
      icon: 'pagePlus' as const,
      onPress: () => {
        flushAll();
        const child = createPage({ parentId: id });
        requestTitleFocus(child);
        openPage(child);
      },
    },
    { label: t('Déplacer vers…'), icon: 'transfer' as const, onPress: () => openPageSheet({ kind: 'movePage', page: id }) },
    {
      label: t('Dupliquer'),
      icon: 'copy' as const,
      onPress: () => {
        flushAll();
        const [copy] = duplicateBlocks(null, [id]);
        if (copy) navigation.dispatch(StackActions.replace('Page', { id: copy }));
      },
    },
    {
      label: t('Partager en Markdown'),
      icon: 'share' as const,
      onPress: () => {
        flushAll();
        Share.share({ message: pageMarkdown(id), title }).catch(() => {});
      },
    },
    ...(ask && (ownKept || !kept)
      ? [
          ownKept
            ? { label: t('Montrer à Claude'), icon: 'eye' as const, onPress: () => setPagePrivate(id, false) }
            : {
                label: t('Garder hors de Claude'),
                icon: 'eyeOff' as const,
                onPress: () => {
                  setPagePrivate(id, true);
                  showSnack(t('Cette page et ses sous-pages ne seront plus envoyées à Claude'), undefined, { tone: 'success' });
                },
              },
        ]
      : []),
    {
      label: t('Mettre à la corbeille'),
      icon: 'trash' as const,
      danger: true,
      onPress: () => {
        flushAll();
        const undo = trashPage(id);
        navigation.goBack();
        showSnack(t('Page placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
      },
    },
  ];

  return (
    <View style={styles.screen}>
      <Ground />
      <PageContext.Provider value={context}>
        <View style={{ paddingTop: insets.top }}>
          <View style={styles.bar}>
            <IconButton icon="back" label={t('Retour')} onPress={() => navigation.goBack()} />
            <AppText variant="title" numberOfLines={1} style={[styles.barTitle, { opacity: titleUnder ? 1 : 0 }]} accessibilityElementsHidden={!titleUnder}>
              {icon ? `${icon} ${title}` : title}
            </AppText>
            {binned ? null : (
              <>
                <IconButton icon="undo" label={tc('undo', 'Annuler')} shape={1} disabled={!canUndo(id)} onPress={() => step('undo')} />
                <IconButton icon="undo" label={t('Rétablir')} shape={2} disabled={!canRedo(id)} onPress={() => step('redo')} style={styles.mirrored} />
                {ask && !kept ? (
                  <IconButton
                    icon="sparkle"
                    label={t('Demander à Claude')}
                    shape={3}
                    onPress={() => {
                      flushAll();
                      openPagesAsk(id);
                    }}
                  />
                ) : null}
                <IconButton icon="more" label={t('Plus d’actions')} shape={0} onPress={() => setMenu(true)} />
              </>
            )}
          </View>
        </View>
        {binned ? (
          <View style={styles.binBanner}>
            <AppText variant="meta" style={styles.binText}>
              {t('Cette page est dans la corbeille : elle se lit, mais ne se modifie pas.')}
            </AppText>
            <Button kind="tonal" label={t('Restaurer')} icon="restore" onPress={() => restorePage(id)} />
          </View>
        ) : null}
        <View
          ref={frame}
          onLayout={() => frame.current?.measureInWindow((_x, y, _width, height) => setFrameBottom(y + height))}
          style={[styles.fill, { paddingBottom: keyboardPad }]}
        >
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
            <Breadcrumb id={id} onOpen={openPage} />
            {icon ? (
              <Tappable accessibilityLabel={t('Changer l’icône')} disabled={binned} ownDisabled onPress={() => openPageSheet({ kind: 'emoji', block: id, allowNone: true })} pebble={1} style={styles.icon}>
                <AppText style={styles.iconGlyph}>{icon}</AppText>
              </Tappable>
            ) : binned ? null : (
              <Tappable onPress={() => openPageSheet({ kind: 'emoji', block: id, allowNone: true })} hitSlop={{ top: 4, bottom: 4 }} style={styles.addIcon} accessibilityRole="button">
                <Icon name="smiley" size={18} color={theme.color.inkMuted} />
                <AppText variant="label" color={theme.color.inkMuted}>
                  {t('Ajouter une icône')}
                </AppText>
              </Tappable>
            )}
            <View
              onLayout={event => {
                titleBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height - 8;
              }}
            >
              <TitleField id={id} readOnly={binned} onFocusChange={setTitleFocused} />
            </View>
            <View style={styles.blocks}>
              <LayoutAnimationConfig skipEntering>
                <BlockList parentId={id} depth={0} />
              </LayoutAnimationConfig>
            </View>
            <Tappable noTint disabled={binned} ownDisabled onPress={writeAtEnd} style={[styles.end, empty ? styles.endEmpty : null]} accessibilityLabel={t('Écrire à la fin de la page')}>
              {empty && !binned ? (
                <AppText variant="body" color={theme.color.inkFaint}>
                  {titleFocused ? t('Entrée pour écrire la page') : t('Touchez ici pour écrire. Le + de la barre ajoute un titre, une liste, un tableau, une image…')}
                </AppText>
              ) : null}
            </Tappable>
          </ScrollView>
          {editing ? <BlockBar /> : null}
        </View>
        <PageSheets page={id} openPage={openPage} />
        <TableSheetHost />
        <MediaHost />
      </PageContext.Provider>
      <Menu visible={menu} items={menuItems} onDismiss={() => setMenu(false)} />
      <PageAskSheet pageId={id} onCite={openAt} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
    barTitle: { flex: 1, marginLeft: 4 },
    mirrored: { transform: [{ scaleX: -1 }] },
    gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    binBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingLeft: 16, paddingRight: 8, backgroundColor: theme.color.paperHigh, ...corners(SHAPES.panel) },
    binText: { flex: 1, color: theme.color.ink },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    crumbs: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -8, marginBottom: 4, minHeight: 36, overflow: 'hidden' },
    crumb: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 8, flexShrink: 1, ...corners(SHAPES.chip) },
    crumbText: { flexShrink: 1 },
    fold: { paddingHorizontal: 6 },
    icon: { width: 64, height: 60, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
    iconGlyph: { fontSize: 44, lineHeight: 54 },
    addIcon: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 40, marginLeft: -8, paddingHorizontal: 8, ...corners(SHAPES.chip) },
    title: { fontSize: 30, lineHeight: 37, letterSpacing: -0.5, color: theme.color.ink, padding: 0, marginTop: 4, marginBottom: 12, includeFontPadding: false },
    blocks: { gap: 0 },
    end: { minHeight: 160 },
    endEmpty: { paddingTop: 4 },
  });
