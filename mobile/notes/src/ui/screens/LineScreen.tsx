/**
 * One collection: its head, a field to add a link to it, the links to do, then the done ones, as
 * rows, a gallery, a mosaic or a table (`LineLayout`, from its glyph in the head's top bar). Over
 * them, the order and the filter this phone keeps for the collection (`lineView`), and « Tout
 * lire » while Claude could read links kept unread here, else « Tout relire » for those
 * read before the last change to its own facts (« Ce que Claude relève »).
 */
import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, LinearTransition, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc, tx } from '@unlease/core/i18n';
import { formatPrice, formatUsd, plural, totalPrice } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { arrangeLine, DEFAULT_LINE_VIEW, LINE_LAYOUT_NAMES } from '@unlease/notes/services/lineView';
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { sortable } from '@unlease/notes/services/sorting';
import { collectionTemplate, linksReadBefore } from '@unlease/notes/services/templates';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID, INBOX_TITLE, shownHint, shownTitle, type LinkItem } from '@unlease/notes/models/entities';
import { useLines } from '@app/hooks/useLines';
import { addLinks, moveLink, readLinks, restoreNotes, setPinned, trashLines, trashNotes } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectLineView, setLineView, useLineViewStore } from '@app/store/lineViewStore';
import { selectModel, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { showSnack } from '@shared/app/store/uiStore';
import { selectSorting, useCaptureStore } from '@app/store/captureStore';
import { readClipboard } from '@shared/platform/clipboard';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, EmptyState, Ground, GroundSlice, Icon, IconButton, Menu, Organic, ScrollEdges, settleIn, TopBar, usePullToSync } from '../components';
import { CollectionHeader } from '../features/lines/CollectionHeader';
import { DeleteLineSheet, type LinksFate } from '../features/lines/DeleteLineSheet';
import { EditLineSheet } from '../features/lines/EditLineSheet';
import { FilteredEmpty, LAYOUT_GLYPHS, LineRefineBar, LineViewSheets, ReadAllBanner, type LineViewSheet } from '../features/lines/LineRefine';
import { ModulesSheet } from '../features/lines/ModulesSheet';
import { readAgainWords } from '../features/templates/templateWords';
import { MoveSheet } from '../features/lines/MoveSheet';
import { ReviewSheet } from '../features/lines/ReviewSheet';
import { sortDeletedLinksOnSlip, sortInboxOnSlip } from '../features/lines/sortingSlips';
import { LinkRow } from '../features/links/LinkRow';
import { LinkMosaic } from '../features/links/LinkMosaic';
import { LinkTable } from '../features/links/LinkTable';
import { LinkTile, TILE_INSET } from '../features/links/LinkTile';
import type { ScreenProps } from '../navigation/types';
import { decelerate, duration, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { variantStyle } from '@shared/ui/theme/typography';

/**
 * `ruled`: a link row with another link under it, so a rule between them (never beside "Déjà faits", the web's).
 * The other layouts: a gallery's line of two tiles, a group's mosaic, the whole table.
 */
type Row =
  | { kind: 'link'; id: string; ruled: boolean }
  | { kind: 'heading'; title: string }
  | { kind: 'pair'; key: string; ids: readonly string[] }
  | { kind: 'mosaic'; key: string; ids: readonly string[] }
  | { kind: 'table'; open: readonly string[]; done: readonly string[] };

/** A gallery's two tiles a line, their pictures 12 apart (each tile's press veil running 6 round them). */
const pairs = (ids: readonly string[]): Row[] => {
  const out: Row[] = [];
  for (let at = 0; at < ids.length; at += 2) out.push({ kind: 'pair', key: `pair-${ids[at]}`, ids: ids.slice(at, at + 2) });
  return out;
};
const MOSAIC_GAP = 8;

const rowKey = (row: Row): string => (row.kind === 'link' ? row.id : row.kind === 'heading' ? 'done-heading' : row.kind === 'table' ? 'table' : row.key);

/** A stamped link files itself under "Déjà faits" (and back) once its stamp has landed; the others close ranks. */
const ROW_MOVE = LinearTransition.duration(duration.medium).easing(standard).delay(duration.short);
/** "Déjà faits" comes in as the first stamped link goes down to it. */
const HEADING_IN = FadeIn.duration(duration.medium).easing(decelerate).delay(duration.short);

type Links = { readonly linksByNote: Readonly<Record<string, readonly string[]>>; readonly links: Readonly<Record<string, LinkItem | undefined>> };
/** The collection's live links, in its own order. */
const linksOf = (s: Links, id: string): LinkItem[] => (s.linksByNote[id] ?? []).flatMap(lid => (s.links[lid] ? [s.links[lid]!] : []));

export function LineScreen({ navigation, route }: ScreenProps<'Line'>) {
  const { id } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // A pull asks for a sync, as on the board.
  const pullToSync = usePullToSync();
  const line = useLibraryStore(s => s.notes[id]);
  const view = useLineViewStore(selectLineView(id));
  const { open, done, total, toDo, all, unread, failed, priceDrop, priced, skipped } = useLibraryStore(
    useShallow(s => {
      const links = linksOf(s, id);
      const shown = arrangeLine(links, view);
      // The head counts what is left to do whatever the filter.
      const left = links.filter(link => !link.done);
      const sum = totalPrice(left);
      return {
        open: shown.open.map(link => link.id).join(','),
        done: shown.done.map(link => link.id).join(','),
        total: sum ? formatPrice(sum.amount, sum.currency) : '',
        toDo: left.length,
        ...shown.counts,
        priced: shown.priced,
        skipped: links.filter(link => link.status === 'skipped').length,
      };
    }),
  );
  const model = useSettingsStore(selectModel);
  // Read before the last change to the collection's own facts (« Ce que Claude relève »): « Tout relire ».
  const readBefore = useLibraryStore(
    useShallow(s => {
      const template = id === INBOX_ID ? null : collectionTemplate(s.linkTemplates, s.notes[id]);
      return template ? linksReadBefore(template, linksOf(s, id), s.notes, s.linkTemplates).map(link => link.id) : [];
    }),
  );
  // What Claude may sort here: in "Non classé", not what the person put there themselves.
  const sortableCount = useLibraryStore(
    s =>
      (s.linksByNote[id] ?? []).filter(lid => {
        const link = s.links[lid];
        return !!link && sortable(link) && (id !== INBOX_ID || link.filedBy !== 'person');
      }).length,
  );
  // Claude's offers (« Tout lire », « Vérifier les liens », « Ranger Non classé », its facts) once the server said it has a key.
  const reading = useServerFeature('claude');
  const sorting = useCaptureStore(selectSorting);
  const otherLines = useLines().some(other => other.id !== id && other.id !== INBOX_ID);
  const [url, setUrl] = useState('');
  // Words with no link are said under the strip, what was typed (or pasted) kept, until it changes.
  const [problem, setProblem] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [refining, setRefining] = useState<LineViewSheet | null>(null);
  const insets = useSafeAreaInsets();
  // The status bar's strip of wall comes in as the head scrolls under it: at rest the ghost emblem runs to the top edge.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  const bandStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 24], [0, 1], 'clamp') }));

  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const { width: screen } = useWindowDimensions();
  const layout = view.layout;
  const rows: Row[] = useMemo(() => {
    const heading: Row[] = doneIds.length > 0 ? [{ kind: 'heading', title: t('Déjà faits · {count}', { count: doneIds.length }) }] : [];
    switch (layout) {
      case 'gallery':
        return [...pairs(openIds), ...heading, ...pairs(doneIds)];
      case 'mosaic':
        return [...(openIds.length > 0 ? [{ kind: 'mosaic' as const, key: 'mosaic-open', ids: openIds }] : []), ...heading, ...(doneIds.length > 0 ? [{ kind: 'mosaic' as const, key: 'mosaic-done', ids: doneIds }] : [])];
      case 'table':
        return openIds.length + doneIds.length > 0 ? [{ kind: 'table', open: openIds, done: doneIds }] : [];
      default:
        return [
          ...openIds.map((lid, index) => ({ kind: 'link' as const, id: lid, ruled: index < openIds.length - 1 })),
          ...heading,
          ...doneIds.map((lid, index) => ({ kind: 'link' as const, id: lid, ruled: index < doneIds.length - 1 })),
        ];
    }
  }, [layout, openIds, doneIds]);
  // The gallery's tile, its picture 12 in from the screen's edge as the add strip is, 12 from its neighbour's.
  const tileWidth = (screen - 2 * TILE_INSET) / 2;

  if (!line || line.deletedAt !== null) {
    // Gone while open (deleted on another device): a way back, never a blank screen.
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Introuvable')} text={t('Cette collection n’existe plus.')} />
      </View>
    );
  }

  const inbox = id === INBOX_ID;
  // Opened from the bin, it reads as it is and takes nothing until it is restored (the note's way).
  const trashed = line.trashedAt !== null;
  const add = (text: string) => {
    const found = extractUrls(text);
    if (found.length === 0) {
      setUrl(text);
      setProblem(t('Aucun lien ici : collez une adresse, comme https://example.org/page.'));
      return;
    }
    const placed = addLinks(found, { noteId: id });
    const message = addedMessage(placed, { into: id, here: true }, useLibraryStore.getState().notes);
    if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    setUrl('');
    setProblem(null);
  };

  // What is left to do. With none, it says nothing: the empty panel, or "Déjà faits · n", says it (never « 0 lien » over them).
  const summary = toDo > 0 ? [plural(toDo, 'lien'), total ? t('total {amount}', { amount: total }) : null].filter(Boolean).join(' · ') : '';
  const canReview = !inbox && reading && sortableCount > 0;
  // Claude could read some links here now: those kept unread while the filter shows them, or those that failed under their own filter.
  const retrying = view.filter === 'failed';
  const toRead = !reading || trashed ? 0 : retrying ? failed : view.filter === 'all' || view.filter === 'unread' ? skipped : 0;
  const readAll = (): void => {
    const links = linksOf(useLibraryStore.getState(), id).filter(link => (retrying ? link.status === 'failed' : link.status === 'skipped'));
    const sent = readLinks(links.map(link => link.id));
    // No « Annuler »: the server starts reading at once, and a reading begun is spent.
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };
  const cost = formatUsd(toRead * CLAUDE_COST_PER_LINK[model]);

  /** Held, a link (a row, a tile, a table's line) moves to another collection. */
  const moveFrom = (lid: string): void => {
    Keyboard.dismiss();
    setMoving(lid);
  };

  /** The collection goes to the bin; its links where the person said. */
  const remove = (fate: LinksFate) => {
    const ids = [...(useLibraryStore.getState().linksByNote[id] ?? [])];
    navigation.goBack();
    if (fate.kind === 'bin') {
      showSnack(t('Collection et liens placés dans la corbeille'), { label: tc('undo', 'Annuler'), run: trashLines([id], null) }, { tone: 'success' });
    } else if (fate.kind === 'move') {
      const undo = trashLines([id], fate.to);
      const name = fate.to === INBOX_ID ? t(INBOX_TITLE) : (useLibraryStore.getState().notes[fate.to]?.title ?? '');
      showSnack(t('Collection supprimée : {links} dans {name}', { links: plural(ids.length, 'lien déplacé', 'liens déplacés'), name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
    } else {
      sortDeletedLinksOnSlip(ids, trashLines([id], INBOX_ID), tx('Collection supprimée'));
    }
  };

  return (
    <View style={styles.screen}>
      <Ground />
      {/* Its edges soften; the top one under the status bar's band, where the head goes as it scrolls away. */}
      <ScrollEdges insetTop={insets.top}>
      <Animated.FlatList
        data={rows}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={rowKey}
        itemLayoutAnimation={ROW_MOVE}
        skipEnteringExitingAnimations
        refreshControl={pullToSync}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <CollectionHeader
              title={shownTitle(line)}
              emblem={collectionEmblem(line.id, line.emblem)}
              color={asLineColor(line.color)}
              id={line.id}
              hint={shownHint(line)}
              meta={summary}
              onBack={() => navigation.goBack()}
              actions={
                trashed ? null : (
                  <>
                  {all > 0 ? (
                    <IconButton
                      icon={LAYOUT_GLYPHS[layout]}
                      label={t('Affichage : {layout}', { layout: LINE_LAYOUT_NAMES[layout] })}
                      onPress={() => {
                        Keyboard.dismiss();
                        setRefining('layout');
                      }}
                    />
                  ) : null}
                  <IconButton
                    icon="more"
                    label={t('Plus d’actions')}
                    onPress={() => {
                      // Its sheets would open under the keyboard of the add field.
                      Keyboard.dismiss();
                      setMenu(true);
                    }}
                  />
                  </>
                )
              }
            />
            {trashed ? (
              <Organic style={styles.trashBanner}>
                <AppText variant="meta" style={styles.trashText}>
                  {t('Une collection dans la corbeille ne peut pas être modifiée.')}
                </AppText>
                <Button kind="tonal" label={t('Restaurer')} icon="restore" onPress={() => restoreNotes([id])} />
              </Organic>
            ) : (
            <>
            <Organic frost style={[styles.add, problem ? styles.addInvalid : null]}>
              <TextInput
                value={url}
                onChangeText={text => {
                  setUrl(text);
                  setProblem(null);
                }}
                onSubmitEditing={() => add(url)}
                placeholder={t('Ajouter un lien à {name}', { name: shownTitle(line) })}
                placeholderTextColor={theme.color.inkFaint}
                selectionColor={theme.color.highlight}
                selectionHandleColor={theme.color.focus}
                cursorColor={theme.color.focus}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                style={[variantStyle(theme, 'body'), styles.input, problem ? styles.inputInvalid : null]}
                accessibilityLabel={[t('Adresse du lien'), problem].filter(Boolean).join(', ')}
              />
              <IconButton
                icon={url ? 'check' : 'copy'}
                label={url ? t('Ajouter') : t('Coller le lien copié')}
                onPress={async () => (url ? add(url) : add(await readClipboard()))}
              />
            </Organic>
            {problem ? (
              <View style={styles.problem} accessibilityLiveRegion="polite">
                <Icon name="error" size={16} color={theme.color.danger} />
                <AppText variant="meta" color={theme.color.danger} style={styles.problemText}>
                  {problem}
                </AppText>
              </View>
            ) : null}
            </>
            )}
            {/* Read again with the collection's own facts as they are now: once nothing is left unread (never both wells). */}
            {toRead < 2 && reading && !trashed && readBefore.length > 0 ? (
              <ReadAllBanner
                text={readAgainWords(readBefore.length, formatUsd(readBefore.length * CLAUDE_COST_PER_LINK[model]))}
                action={readBefore.length === 1 ? t('Relire') : t('Tout relire')}
                onRead={() => {
                  const sent = readLinks(readBefore);
                  if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
                }}
              />
            ) : null}
            {toRead >= 2 ? (
              <ReadAllBanner
                text={
                  retrying
                    ? t('{links} · environ {cost} pour tout relire', { links: plural(toRead, 'lecture impossible', 'lectures impossibles'), cost })
                    : t('{links} · environ {cost} pour tout lire', { links: plural(toRead, 'lien gardé sans lecture', 'liens gardés sans lecture'), cost })
                }
                action={retrying ? t('Tout réessayer') : t('Tout lire')}
                onRead={readAll}
              />
            ) : null}
            {/* Only where there is something to order or pick: never over a single link, unless this phone keeps a view for it. */}
            {all >= 2 || view.filter !== DEFAULT_LINE_VIEW.filter || view.sort !== DEFAULT_LINE_VIEW.sort ? (
              <LineRefineBar
                view={view}
                onOpen={sheet => {
                  // Its sheets would open under the keyboard of the add field.
                  Keyboard.dismiss();
                  setRefining(sheet);
                }}
              />
            ) : null}
            {all > 0 && rows.length === 0 ? <FilteredEmpty filter={view.filter} collection={shownTitle(line)} onClear={() => setLineView(id, { ...view, filter: 'all' })} /> : null}
            {all === 0 ? (
              // The web's dashed panel: what comes here, where the links will be. It settles in, so a collection that fills at once never shows it.
              <Animated.View entering={settleIn}>
                <Organic outline="panel" style={styles.empty}>
                  <AppText variant="body" color={theme.color.inkMuted} style={styles.emptyText}>
                    {inbox
                      ? t('Les liens que Claude ne sait pas où ranger arrivent ici, comme ceux gardés sans lecture.')
                      : t('Aucun lien pour l’instant. Partagez un lien depuis une autre app ou collez-le ici : Claude y rangera aussi ceux qui lui correspondent.')}
                  </AppText>
                </Organic>
              </Animated.View>
            ) : null}
          </View>
        }
        renderItem={({ item, separators }) =>
          item.kind === 'pair' ? (
            <View style={styles.pair}>
              {item.ids.map(lid => (
                <LinkTile key={lid} id={lid} shape="gallery" width={tileWidth - 2 * TILE_INSET} onOpen={open => navigation.navigate('Link', { id: open })} onLongPress={moveFrom} />
              ))}
            </View>
          ) : item.kind === 'mosaic' ? (
            <View style={styles.mosaic}>
              <LinkMosaic ids={item.ids} width={screen - 24} gap={MOSAIC_GAP} onOpen={open => navigation.navigate('Link', { id: open })} onLongPress={moveFrom} />
            </View>
          ) : item.kind === 'table' ? (
            <LinkTable open={item.open} done={item.done} sort={view.sort} priced={priced} onSort={sort => setLineView(id, { ...view, sort })} onOpen={open => navigation.navigate('Link', { id: open })} onLongPress={moveFrom} />
          ) : item.kind === 'heading' ? (
            <Animated.View entering={HEADING_IN}>
              <AppText variant="section" style={styles.heading} accessibilityRole="header">
                {item.title}
              </AppText>
            </Animated.View>
          ) : (
            <LinkRow
              id={item.id}
              onPressIn={separators.highlight}
              onPressOut={separators.unhighlight}
              onOpen={lid => navigation.navigate('Link', { id: lid })}
              onLongPress={moveFrom}
            />
          )
        }
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
      </ScrollEdges>
      {/* The head scrolls away; the status bar keeps a strip of wall to sit on. */}
      <Animated.View pointerEvents="none" style={[styles.statusBand, { height: insets.top }, bandStyle]}>
        <GroundSlice top={0} />
      </Animated.View>
      <Menu
        visible={menu}
        onDismiss={() => setMenu(false)}
        items={[
          { label: t('Modifier la collection'), icon: 'edit', onPress: () => setEditing(true) },
          { label: t('Modules'), icon: 'puzzle', onPress: () => setModulesOpen(true) },
          // What Claude reads on its links: « Non classé » reads each by its kind.
          ...(inbox || !reading ? [] : [{ label: t('Ce que Claude relève'), icon: 'list' as const, onPress: () => navigation.navigate('Template', { collection: id }) }]),
          ...(canReview ? [{ label: t('Vérifier les liens'), icon: 'sparkle' as const, onPress: () => setReviewing(true) }] : []),
          ...(inbox && reading && sortableCount > 0 && otherLines && !sorting ? [{ label: t('Ranger Non classé'), icon: 'sparkle' as const, onPress: sortInboxOnSlip }] : []),
          {
            label: line.pinned ? t('Retirer du tableau') : t('Épingler sur le tableau'),
            icon: line.pinned ? 'pinOff' : 'pin',
            onPress: () => {
              const undo = setPinned(id, !line.pinned);
              showSnack(line.pinned ? t('Retirée du tableau') : t('Épinglée sur le tableau'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
            },
          },
          ...(inbox
            ? []
            : [
                {
                  label: t('Supprimer la collection'),
                  icon: 'trash' as const,
                  danger: true,
                  onPress: () => {
                    if (all > 0) {
                      setDeleting(true);
                      return;
                    }
                    const undo = trashNotes([id]);
                    navigation.goBack();
                    showSnack(t('Collection placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
                  },
                },
              ]),
        ]}
      />
      <EditLineSheet
        id={id}
        visible={editing}
        onDismiss={() => setEditing(false)}
        onSaved={meaning => {
          if (meaning && canReview) showSnack(t('Collection modifiée'), { label: t('Vérifier les liens'), run: () => setReviewing(true) }, { tone: 'success' });
        }}
      />
      <ModulesSheet id={id} visible={modulesOpen} onDismiss={() => setModulesOpen(false)} />
      <LineViewSheets open={refining} view={view} counts={{ all, unread, failed, priceDrop }} priced={priced} onChange={next => setLineView(id, next)} onDismiss={() => setRefining(null)} />
      <ReviewSheet id={id} visible={reviewing} onDismiss={() => setReviewing(false)} />
      <DeleteLineSheet ids={[id]} visible={deleting} onDismiss={() => setDeleting(false)} onChoose={remove} onPickLine={() => setPicking(true)} />
      <MoveSheet visible={picking} currentLineId={null} exclude={[id]} title={t('Déplacer les liens vers')} onDismiss={() => setPicking(false)} onPick={target => remove({ kind: 'move', to: target })} />
      <MoveSheet
        visible={moving !== null}
        currentLineId={id}
        onDismiss={() => setMoving(null)}
        onPick={target => {
          if (!moving) return;
          const undo = moveLink(moving, target);
          const into = useLibraryStore.getState().notes[target];
          showSnack(t('Déplacé dans {name}', { name: into ? shownTitle(into) : '' }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        }}
      />
    </View>
  );
}

/** The rule between two links; it steps aside while the link beside it is pressed, so the press never runs into a line. */
function Separator({ highlighted, leadingItem }: { highlighted?: boolean; leadingItem?: Row }) {
  const styles = useThemedStyles(makeStyles);
  if (leadingItem?.kind !== 'link' || !leadingItem.ruled) return null;
  return <View style={[styles.separator, highlighted ? styles.separatorAside : null]} />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    list: { paddingBottom: 48 },
    statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: theme.ground.top },
    add: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginTop: 14,
      marginBottom: 8,
      paddingLeft: 16,
      paddingRight: 4,
      ...corners(SHAPES.search),
      backgroundColor: theme.color.fieldVeil,
      borderWidth: 1,
      borderColor: theme.color.outline,
    },
    input: { flex: 1, height: 52, paddingVertical: 0, color: theme.color.ink },
    // The edge thickens; the padding and the field's height give back what it takes, so neither the text nor the rows under it move.
    addInvalid: { borderWidth: 2, borderColor: theme.color.danger, paddingLeft: 15, paddingRight: 3 },
    inputInvalid: { height: 50 },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginTop: 6 },
    problemText: { flex: 1 },
    // Dashed in the outline's ink (the web's `.empty`).
    empty: { marginHorizontal: 12, marginTop: 16, paddingHorizontal: 28, paddingVertical: 36, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.color.outline },
    emptyText: { textAlign: 'center' },
    // The note editor's bin banner, in the add field's place (its margins).
    trashBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginTop: 14, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.color.paperHigh, ...corners(SHAPES.panel) },
    trashText: { flex: 1 },
    heading: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
    // A gallery's line: its tiles' veils 6 in from the screen's edge, so their pictures stand at the add strip's 12.
    pair: { flexDirection: 'row', paddingHorizontal: TILE_INSET, marginTop: 10 },
    mosaic: { paddingHorizontal: 12, marginTop: 12 },
    // From the rows' text (6 + 10 + 76 + 14) to the add strip's edge, so the frames read as one column (the web's).
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginLeft: 106, marginRight: 12 },
    separatorAside: { opacity: 0 },
  });
