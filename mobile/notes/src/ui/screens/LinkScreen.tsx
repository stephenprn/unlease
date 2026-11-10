/**
 * A link, read: its pictures, what it is and costs, the facts Claude pulled, and the owner's own
 * note. Two actions stay at hand in a bar at the foot (stamp it, open the page); the collection
 * in the top bar is where the link is moved; the rest waits in the menu. Under the title, the
 * modules its collection picked for such links (`ModuleBar`).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Linking, ScrollView, Share, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { INBOX_ID, LINK_KIND_NAMES, shownTitle, type LinkItem } from '@unlease/notes/models/entities';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { linkTemplateSource, readingSignature } from '@unlease/notes/services/templates';
import { t, tc } from '@unlease/core/i18n';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import { deleteLink, moveLink, reanalyzeLink, saveTypedText, setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { useShallow } from 'zustand/react/shallow';
import { selectCanRead, selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { onBeforePause } from '@shared/app/sync/syncManager';
import { copyText } from '@shared/platform/clipboard';

import { AppText, Button, EmptyState, Ground, Icon, IconButton, Menu, Organic, Stamp, TextField, TopBar, stampWord } from '../components';
import { useKeyboardVisible } from '@shared/ui/components/useKeyboardVisible';
import { MoveSheet } from '../features/lines/MoveSheet';
import { KIND_ICONS } from '../features/links/kindIcon';
import { KitchenTimers } from '../features/links/KitchenTimers';
import { LINK_IMAGE } from '../features/links/LinkRow';
import { ModuleBar, ModuleSheets, type SheetModule } from '../features/links/ModuleBar';
import { PriceWatch } from '../features/links/PriceWatch';
import { PeopleField } from '../features/people/PeopleField';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import type { ScreenProps } from '../navigation/types';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export function LinkScreen({ navigation, route }: ScreenProps<'Link'>) {
  const { id } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const live = useLibraryStore(s => s.links[id]);
  // Deleted from here, the link leaves looking as it was, not as « Ce lien n’existe plus » (the web's).
  const [parting, setParting] = useState<LinkItem | undefined>(undefined);
  const link = parting ?? live;
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const reading = useSettingsStore(selectCanRead);
  // Where its facts are chosen (« Ce que Claude relève »: its collection's page, else its kind's usual facts), and whether it was noted before they changed.
  const fiche = useLibraryStore(
    useShallow(s => {
      const item = s.links[id];
      if (!item) return { collection: null, kind: null, stale: false };
      const source = linkTemplateSource(s.linkTemplates, item, s.notes);
      return {
        collection: item.noteId !== INBOX_ID && s.notes[item.noteId]?.kind === 'links' ? item.noteId : null,
        kind: item.kind,
        // Read before templates existed: read with the presets.
        stale: item.status === 'ready' && (item.readWith ?? 'preset') !== readingSignature(source),
      };
    }),
  );
  const server = useSettingsStore(selectServer);
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [module, setModule] = useState<SheetModule | null>(null);
  const [lostPicture, setLostPicture] = useState<string | null>(null);
  const [comment, setComment] = useState(link?.comment ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commentRef = useRef(comment);
  commentRef.current = comment;
  /** What the comment held when last saved or shown: the base for merging an edit from another device. */
  const since = useRef(link?.comment ?? '');

  const saveComment = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      if (text === since.current) return;
      const stored = saveTypedText('link', id, 'comment', since.current, text);
      since.current = stored;
      if (stored !== text) setComment(stored);
    },
    [id],
  );

  // Show an edit from another device, unless a save is waiting (that save merges it).
  const storedComment = link?.comment;
  useEffect(() => {
    if (storedComment === undefined || timer.current !== undefined || storedComment === since.current) return;
    since.current = storedComment;
    setComment(storedComment);
  }, [storedComment]);

  // What is typed goes on the way out (of the screen or of the app); nothing is written when nothing was typed.
  useEffect(() => {
    const save = () => {
      if (timer.current !== undefined) saveComment(commentRef.current);
    };
    const unsubscribe = onBeforePause(save);
    return () => {
      unsubscribe();
      save();
    };
  }, [saveComment]);

  if (!link || link.deletedAt !== null) {
    // Deleted on another device, or a widget's link gone: the page says so (the web's words).
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Introuvable')} text={t('Ce lien n’existe plus.')} />
      </View>
    );
  }

  const now = Date.now();
  // Named as on its row (the web's too): "Sac cabas" read from the address when nothing was read, the site as "Komono", never "KOMONO" or "fr.eryone3d".
  const { title, source } = linkRowText(link);
  // Under the title: what it is and where from; a plain link nobody read says only where ("Lien" would tell nothing).
  const meta = [link.title || link.kind !== 'other' ? LINK_KIND_NAMES[link.kind] : null, source].filter(Boolean).join(' · ');
  // The kept pictures are the server's copies: without a server the page's own picture stands in, as on the row.
  const kept = server ? link.imageIds : [];
  // A lone picture that would not load at all (its copy nor the page's own) leaves no empty frame: the page goes without.
  const pictures = `${kept.join(',')}|${link.imageUrl ?? ''}`;
  const pictureLost = lostPicture === pictures;
  const pictured = (kept.length > 0 || !!link.imageUrl) && !pictureLost;
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const failed = link.status === 'failed';
  const doneAt = link.done ? link.doneAt : null;
  // Read on a day only when the reading came through; a failed one was tried, not read.
  const added = formatDay(link.createdAt, now);
  const read = link.analyzedAt === null ? '' : formatDay(link.analyzedAt, now);
  const dates =
    link.analyzedAt !== null && link.status === 'ready'
      ? t('Ajouté le {added} · lu le {read}', { added, read })
      : link.analyzedAt !== null && failed
        ? t('Ajouté le {added} · lecture tentée le {read}', { added, read })
        : t('Ajouté le {added}', { added });
  const open = () => Linking.openURL(link.url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));
  // Tall enough to show the thing, low enough that the title and the price stay in the first screen.
  const pictureHeight = Math.round(Math.min(360, width * 0.9));

  const heading = (
    <View style={[styles.heading, pictured ? null : styles.flex]}>
      <View style={styles.titleBlock}>
        <AppText variant="editorTitle" selectable>
          {title}
        </AppText>
        {meta ? (
          <AppText variant="meta" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {link.price !== null || doneAt !== null ? (
        <View style={styles.priceRow}>
          {link.price !== null ? (
            <AppText variant="editorTitle" style={styles.price}>
              {formatPrice(link.price, link.currency)}
            </AppText>
          ) : null}
          {doneAt !== null ? <Stamp kind={link.kind} date={formatDay(doneAt, now)} /> : null}
        </View>
      ) : null}
      {/* « Suivi des prix », under the price, while its collection watches (the web's). */}
      <PriceWatch id={id} underPrice={link.price !== null || doneAt !== null} />
    </View>
  );

  // What became of the reading, and the way on: one panel, its action under the words.
  const action = reading
    ? unread || failed
      ? { label: unread ? t('Lire la page') : t('Réessayer'), run: () => reanalyzeLink(id) }
      : null
    : unread
      ? // With a server, what is missing is the key: straight to that section (the web's).
        { label: t('Administration'), run: () => navigation.navigate('Admin', { section: server ? 'reading' : 'server' }) }
      : null;
  const notice =
    link.status === 'pending' && reading ? (
      <View style={styles.reading}>
        <ReadingTrack width={96} />
        <AppText variant="meta">{t('Lecture de la page par Claude…')}</AppText>
      </View>
    ) : unread || failed ? (
      <Organic outline={NOTICE} style={[styles.notice, action ? styles.noticeWithAction : null]}>
        <View style={styles.noticeIcon}>
          <Icon name={failed ? 'alert' : 'info'} size={20} color={failed ? theme.color.danger : theme.color.inkMuted} />
        </View>
        <View style={styles.noticeBody}>
          <AppText variant="body" color={failed ? theme.color.danger : theme.color.inkMuted}>
            {failed
              ? (link.error ? t(link.error) : t('La page n’a pas pu être lue.'))
              : !server
                ? t('Pas lu : Claude lit les liens depuis votre serveur {app}. Connectez-le dans l’administration.', { app: APP_NAME })
                : !reading
                  ? t('Pas lu : ajoutez une clé API Claude dans l’administration pour que les liens soient lus.')
                  : t('Ce lien a été gardé sans être lu.')}
          </AppText>
          {/* `small` gives the 40 high action its 48 touch (its 8 of slop); the style keeps its size. */}
          {action ? <Button kind="text" small label={action.label} onPress={action.run} style={styles.noticeAction} /> : null}
        </View>
      </Organic>
    ) : null;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={line ? shownTitle(line) : undefined}
        emblem={line ? { emblem: collectionEmblem(line.id, line.emblem), color: asLineColor(line.color) } : undefined}
        onTitlePress={
          line
            ? () => {
                // The keyboard of the note field would cover the collections.
                Keyboard.dismiss();
                setMoving(true);
              }
            : undefined
        }
        titleLabel={line ? t('Collection {name} : changer de collection', { name: shownTitle(line) }) : undefined}
        onBack={() => navigation.goBack()}
        actions={
          <IconButton
            icon="more"
            label={t('Plus d’actions')}
            onPress={() => {
              Keyboard.dismiss();
              setMenu(true);
            }}
          />
        }
      />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {pictureLost ? null : kept.length > 0 ? (
            <Gallery blobIds={kept} fallback={link.imageUrl} width={width} height={pictureHeight} onLost={() => setLostPicture(pictures)} />
          ) : link.imageUrl ? (
            <PictureFrame source={{ uri: link.imageUrl }} width={width} height={pictureHeight} onError={() => setLostPicture(pictures)} />
          ) : null}

          <View style={[styles.body, pictured ? null : styles.bodyBare]}>
            <View style={styles.headGroup}>
              {pictured ? (
                heading
              ) : (
                // No picture: the kind's frame, as in the collection's row, beside the title.
                <View style={styles.headRow}>
                  <Organic outline="frame" style={styles.frame}>
                    <Icon name={KIND_ICONS[link.kind]} size={30} color={theme.color.inkMuted} />
                  </Organic>
                  {heading}
                </View>
              )}
              {/* The modules right under the title and the price (the web's). */}
              <ModuleBar id={id} onOpen={setModule} />
            </View>
            {/* Back from the cook mode, its timers still count down here. */}
            {link.kind === 'recipe' ? <KitchenTimers linkId={id} /> : null}

            {notice}

            {link.summary || link.attributes.length > 0 || fiche.stale ? (
              <View style={styles.about}>
                {link.summary ? (
                  <AppText variant="body" selectable>
                    {link.summary}
                  </AppText>
                ) : null}
                {link.attributes.length > 0 ? (
                  <Organic outline={FACTS} style={styles.facts}>
                    {link.attributes.map((attribute, index) => (
                      <View key={`${attribute.label}-${index}`} style={[styles.fact, index > 0 ? styles.factRule : null]}>
                        <AppText variant="meta" style={styles.factLabel}>
                          {attribute.label}
                        </AppText>
                        <AppText variant="body" style={styles.flex} selectable>
                          {attribute.value}
                        </AppText>
                      </View>
                    ))}
                  </Organic>
                ) : null}
                {/* Its facts changed since it was read: what they say now is one press away. */}
                {fiche.stale ? (
                  <View style={styles.stale}>
                    <AppText variant="meta" style={styles.flex}>
                      {t('Lu avant le dernier changement de ses informations.')}
                    </AppText>
                    {reading ? <Button kind="text" small label={t('Relire')} onPress={() => reanalyzeLink(id)} style={styles.staleAction} /> : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <PeopleField type="link" id={id} ids={link.contactIds} />

            <TextField
              label={t('Votre note')}
              value={comment}
              onChangeText={text => {
                setComment(text);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => saveComment(text), 400);
              }}
              placeholder={t('Pour qui, pourquoi, quand…')}
              multiline
              maxLength={TEXT_LIMITS.link.comment}
              style={styles.comment}
              accessibilityLabel={t('Votre note sur ce lien')}
            />

            <View style={styles.details}>
              {/* The address itself, always: the title above is the page's, or read from the address (the web's). */}
              <AppText variant="meta" selectable numberOfLines={3}>
                {link.url}
              </AppText>
              <AppText variant="meta">{dates}</AppText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* The two things done here, under the thumb; it steps aside while the note is typed. */}
      {keyboard ? null : (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <Button
            kind="tonal"
            label={link.done ? t('Remettre à faire') : stampWord(link.kind)}
            icon={link.done ? 'undo' : 'stamp'}
            onPress={() => {
              const undo = setLinkDone(id, !link.done);
              showSnack(link.done ? t('Remis à faire') : t('Tamponné « {stamp} »', { stamp: stampWord(link.kind) }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
            }}
          />
          <Button label={t('Ouvrir la page')} icon="external" onPress={open} style={styles.primary} />
        </View>
      )}

      <Menu
        visible={menu}
        onDismiss={() => setMenu(false)}
        items={[
          { label: t('Changer de collection'), icon: 'transfer', onPress: () => setMoving(true) },
          {
            label: t('Copier l’adresse'),
            icon: 'copy',
            onPress: () =>
              void copyText(link.url).then(copied =>
                copied ? showSnack(t('Adresse copiée'), undefined, { tone: 'success' }) : showSnack(t('Impossible de copier l’adresse'), undefined, { tone: 'error' }),
              ),
          },
          { label: t('Partager'), icon: 'share', onPress: () => Share.share({ message: link.url, title: link.title || undefined }).catch(() => {}) },
          ...(reading ? [{ label: link.status === 'skipped' ? t('Lire la page') : t('Relire la page'), icon: 'refresh' as const, onPress: () => reanalyzeLink(id) }] : []),
          // Where its facts are chosen: its collection's page, or its kind's usual facts (« Non classé »'s link of no kind has none).
          ...(fiche.collection || (fiche.kind && fiche.kind !== 'other')
            ? [{ label: t('Ce que Claude relève'), icon: 'list' as const, onPress: () => navigation.navigate('Template', fiche.collection ? { collection: fiche.collection } : { kind: fiche.kind! }) }]
            : []),
          {
            label: t('Supprimer'),
            icon: 'trash',
            danger: true,
            onPress: () => {
              setParting(link);
              const undo = deleteLink(id);
              navigation.goBack();
              showSnack(t('Lien supprimé'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
            },
          },
        ]}
      />
      <ModuleSheets id={id} opened={module} onDismiss={() => setModule(null)} />
      <MoveSheet
        visible={moving}
        currentLineId={link.noteId}
        onDismiss={() => setMoving(false)}
        onPick={target => {
          const undo = moveLink(id, target);
          const into = useLibraryStore.getState().notes[target];
          showSnack(t('Déplacé dans {name}', { name: into ? shownTitle(into) : '' }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        }}
      />
    </View>
  );
}

/** The kept pictures, one screen wide each; with more than one, dots say which is shown. */
function Gallery({ blobIds, fallback, width, height, onLost }: { blobIds: readonly string[]; fallback: string | null; width: number; height: number; onLost: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [page, setPage] = useState(0);
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
      >
        {blobIds.map((blobId, index) => (
          <LinkImage key={blobId} blobId={blobId} fallback={index === 0 ? fallback : null} width={width} height={height} onLost={blobIds.length === 1 ? onLost : undefined} />
        ))}
      </ScrollView>
      {blobIds.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={t('Image {index} sur {count}', { index: page + 1, count: blobIds.length })}>
          {blobIds.map((blobId, index) => (
            <View key={blobId} style={[styles.dot, DOT, index === page ? styles.dotOn : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LinkImage({ blobId, fallback, width, height, onLost }: { blobId: string; fallback: string | null; width: number; height: number; onLost?: () => void }) {
  const source = useBlobSource(blobId, 'display');
  // A kept copy out of reach (offline and not cached yet): the first frame shows the page's own picture, as the row does; that one failing too, the picture is lost.
  const [failed, setFailed] = useState(false);
  const shown = failed && fallback ? { uri: fallback } : source;
  return (
    <PictureFrame
      source={shown}
      width={width}
      height={height}
      onError={() => {
        if (!failed && fallback) setFailed(true);
        else onLost?.();
      }}
    />
  );
}

/** A picture's page dot: a circle. */
const DOT = corners(SHAPES.dot);

/** The screen's margin: around a picture's frame, beside the words, at the foot (the top bar's Back, 16 in). */
const PICTURE_MARGIN = 16;

/** The page's two panels, each its own outline. */
const NOTICE = 'panel';
const FACTS = 'panel';

/**
 * A picture in a frame cut to its own proportion (4:5 until it loads), centred in a screen-wide
 * page: it always fills its frame, so no well shows beside a portrait or above a landscape. On
 * cream paper, as in a collection's row: by day a product shot's white becomes the paper.
 */
function PictureFrame({ source, width, height, onError }: { source: ImageSourcePropType | null; width: number; height: number; onError?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // The picture's own proportion, once it has loaded.
  const [ratio, setRatio] = useState<number | null>(null);
  const shape = ratio ?? 0.8;
  const room = width - PICTURE_MARGIN * 2;
  const frameWidth = Math.min(room, Math.round(height * shape));
  const frameHeight = Math.min(height, Math.round(frameWidth / shape));
  return (
    <View style={[styles.picturePage, { width, height }]}>
      <Organic outline="frame" style={[styles.picture, ratio !== null ? styles.pictureLoaded : null, { width: frameWidth, height: frameHeight }]}>
        {source ? (
          <Image
            source={source}
            style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]}
            resizeMode="cover"
            onLoad={event => {
              const { width: w, height: h } = event.nativeEvent.source;
              if (w > 0 && h > 0) setRatio(w / h);
            }}
            onError={onError}
          />
        ) : null}
      </Organic>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.paper },
    fill: { flex: 1 },
    flex: { flex: 1 },
    scroll: { paddingBottom: 32 },
    picturePage: { alignItems: 'center', justifyContent: 'center' },
    picture: { backgroundColor: theme.color.paperHigh, overflow: 'hidden', isolation: 'isolate' },
    pictureLoaded: { backgroundColor: theme.color.paper },
    photoDay: { mixBlendMode: 'multiply' },
    photoNight: { opacity: 0.86 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 12 },
    dot: { width: 7, height: 7, backgroundColor: theme.color.outline },
    dotOn: { backgroundColor: theme.color.ink },
    // On the screen's margin, as the picture's frame, the foot bar and the top bar's Back.
    body: { paddingHorizontal: PICTURE_MARGIN, paddingTop: 20, gap: 24 },
    bodyBare: { paddingTop: 8 },
    headGroup: { gap: 14 },
    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
    frame: {
      width: LINK_IMAGE.width,
      height: LINK_IMAGE.height,
      backgroundColor: theme.color.paperHigh,
      borderWidth: 1,
      borderColor: theme.color.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heading: { gap: 10 },
    titleBlock: { gap: 4 },
    priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8, minHeight: 32 },
    price: { color: theme.color.ink },
    reading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.color.paperHigh },
    // A compact action: its press stays 12 clear of the panel's foot, as the words are of its top.
    noticeWithAction: { paddingBottom: 12 },
    noticeIcon: { paddingTop: 2 },
    noticeBody: { flex: 1, alignItems: 'flex-start' },
    // Its label lines up with the words above.
    noticeAction: { marginLeft: -14, marginTop: 4, minHeight: 40 },
    about: { gap: 16 },
    // A line under the facts, its action at its end (its 48 touch kept by `small`).
    stale: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8 },
    // The text button's own padding reaches the margin, so its label ends on the facts' edge.
    staleAction: { marginRight: -14 },
    facts: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    fact: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    factRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    // On the value's first baseline (the web's): meta's 18 line sits 3.5 higher than body's 23 in Signika.
    factLabel: { width: 110, paddingTop: 3.5 },
    comment: { minHeight: 96, textAlignVertical: 'top' },
    details: { gap: 4 },
    bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: PICTURE_MARGIN, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.color.hairline },
    primary: { flex: 1 },
  });
