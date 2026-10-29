/** One collection: its head, a field to add a link to it, the links to do, then the done ones. */
import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc, tx } from '@unlease/core/i18n';
import { formatPrice, plural, totalPrice } from '@unlease/core/services/format';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { sortable } from '@unlease/notes/services/sorting';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID, INBOX_TITLE, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { useLines } from '@app/hooks/useLines';
import { addLinks, moveLink, restoreNotes, setPinned, trashLines, trashNotes } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, useSettingsStore } from '@app/store/settingsStore';
import { selectSorting, showSnack, useUiStore } from '@app/store/uiStore';
import { readClipboard } from '@platform/intake';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Ground, GroundSlice, IconButton, Menu, Organic, TopBar } from '../components';
import { CollectionHeader } from '../features/lines/CollectionHeader';
import { DeleteLineSheet, type LinksFate } from '../features/lines/DeleteLineSheet';
import { EditLineSheet } from '../features/lines/EditLineSheet';
import { ModulesSheet } from '../features/lines/ModulesSheet';
import { MoveSheet } from '../features/lines/MoveSheet';
import { ReviewSheet } from '../features/lines/ReviewSheet';
import { sortDeletedLinksOnSlip, sortInboxOnSlip } from '../features/lines/sortingSlips';
import { LinkRow } from '../features/links/LinkRow';
import type { ScreenProps } from '../navigation/types';
import { decelerate, duration, standard } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';

type Row = { kind: 'link'; id: string } | { kind: 'heading'; title: string };

/** A stamped link files itself under "Déjà faits" (and back) once its stamp has landed; the others close ranks. */
const ROW_MOVE = LinearTransition.duration(duration.medium).easing(standard).delay(duration.short);
/** "Déjà faits" comes in as the first stamped link goes down to it. */
const HEADING_IN = FadeIn.duration(duration.medium).easing(decelerate).delay(duration.short);

export function LineScreen({ navigation, route }: ScreenProps<'Line'>) {
  const { id } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[id]);
  const { open, done } = useLibraryStore(
    useShallow(s => {
      const ids = s.linksByNote[id] ?? [];
      return {
        open: ids.filter(lid => s.links[lid] && !s.links[lid]!.done).join(','),
        done: ids
          .filter(lid => s.links[lid]?.done)
          .sort((a, b) => (s.links[b]!.doneAt ?? 0) - (s.links[a]!.doneAt ?? 0))
          .join(','),
      };
    }),
  );
  const total = useLibraryStore(s => {
    const ids = (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done);
    const sum = totalPrice(ids.map(lid => ({ price: s.links[lid]!.price, currency: s.links[lid]!.currency })));
    return sum ? formatPrice(sum.amount, sum.currency) : '';
  });
  // What Claude may sort here: in "Non classé", not what the person put there themselves.
  const sortableCount = useLibraryStore(
    s =>
      (s.linksByNote[id] ?? []).filter(lid => {
        const link = s.links[lid];
        return !!link && sortable(link) && (id !== INBOX_ID || link.filedBy !== 'person');
      }).length,
  );
  const reading = useSettingsStore(selectCanRead);
  const sorting = useUiStore(selectSorting);
  const otherLines = useLines().some(other => other.id !== id && other.id !== INBOX_ID);
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const insets = useSafeAreaInsets();
  // The status bar's strip of wall comes in as the head scrolls under it: at rest the ghost emblem runs to the top edge.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  const bandStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 24], [0, 1], 'clamp') }));

  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const rows: Row[] = useMemo(
    () => [
      ...openIds.map(lid => ({ kind: 'link' as const, id: lid })),
      ...(doneIds.length > 0 ? [{ kind: 'heading' as const, title: t('Déjà faits · {count}', { count: doneIds.length }) }] : []),
      ...doneIds.map(lid => ({ kind: 'link' as const, id: lid })),
    ],
    [openIds, doneIds],
  );

  if (!line || line.deletedAt !== null) {
    // Gone while open (deleted on another device): a way back, never a blank screen.
    return (
      <View style={styles.screen}>
        <TopBar onBack={() => navigation.goBack()} />
        <AppText variant="body" style={styles.empty}>
          {t('Cette collection n’existe plus.')}
        </AppText>
      </View>
    );
  }

  const inbox = id === INBOX_ID;
  // Opened from the bin, it reads as it is and takes nothing until it is restored (the note's way).
  const trashed = line.trashedAt !== null;
  const add = (text: string) => {
    const found = extractUrls(text);
    if (found.length === 0) {
      showSnack(t('Ce n’est pas un lien'), undefined, { tone: 'warning' });
      return;
    }
    const message = addedMessage(addLinks(found, { noteId: id }), { into: id, here: true }, useLibraryStore.getState().notes);
    if (message) showSnack(message);
    setUrl('');
  };

  const summary = [plural(openIds.length, 'lien'), total ? t('total {amount}', { amount: total }) : null].filter(Boolean).join(' · ');
  const canReview = !inbox && reading && sortableCount > 0;

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
      <Animated.FlatList
        data={rows}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={row => (row.kind === 'link' ? row.id : 'done-heading')}
        itemLayoutAnimation={ROW_MOVE}
        skipEnteringExitingAnimations
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
                  <IconButton
                    icon="more"
                    label={t('Plus d’actions')}
                    onPress={() => {
                      // Its sheets would open under the keyboard of the add field.
                      Keyboard.dismiss();
                      setMenu(true);
                    }}
                  />
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
            <Organic style={styles.add}>
              <TextInput
                value={url}
                onChangeText={setUrl}
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
                style={[variantStyle(theme, 'body'), styles.input]}
                accessibilityLabel={t('Adresse du lien')}
              />
              <IconButton
                icon={url ? 'check' : 'copy'}
                label={url ? t('Ajouter') : t('Coller le lien copié')}
                onPress={async () => (url ? add(url) : add(await readClipboard()))}
              />
            </Organic>
            )}
            {openIds.length === 0 && doneIds.length === 0 ? (
              <AppText variant="body" style={styles.empty}>
                {inbox
                  ? t('Les liens que Claude ne sait pas où ranger arrivent ici, comme ceux gardés sans lecture.')
                  : t('Aucun lien pour l’instant. Partagez un lien depuis une autre app ou collez-le ici : Claude y rangera aussi ceux qui lui correspondent.')}
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <Animated.View entering={HEADING_IN}>
              <AppText variant="section" style={styles.heading} accessibilityRole="header">
                {item.title}
              </AppText>
            </Animated.View>
          ) : (
            <LinkRow
              id={item.id}
              onOpen={lid => navigation.navigate('Link', { id: lid })}
              onLongPress={lid => {
                Keyboard.dismiss();
                setMoving(lid);
              }}
            />
          )
        }
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
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
                    if (openIds.length + doneIds.length > 0) {
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

function Separator() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.separator} />;
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
      backgroundColor: theme.color.field,
      borderWidth: 1,
      borderColor: theme.color.outline,
    },
    input: { flex: 1, height: 52, paddingVertical: 0, color: theme.color.ink },
    empty: { paddingHorizontal: 24, paddingTop: 24, textAlign: 'center', color: theme.color.inkMuted },
    // The note editor's bin banner, in the add field's place.
    trashBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.color.paperHigh, ...corners(SHAPES.panel) },
    trashText: { flex: 1 },
    heading: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginLeft: 106 },
  });
