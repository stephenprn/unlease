/**
 * "Vérifier les liens": Claude lists the links that no longer belong in a collection, each with
 * where it would go; the person unticks what they disagree with, and the rest moves as one batch.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, INBOX_TITLE, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { displayHost } from '@unlease/core/services/url';
import type { SortMove } from '@unlease/notes/sync/sorting';
import { applyReview, reviewLine } from '@app/sorting';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Emblem, Icon, Sheet, SheetScroll, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { ReadingTrack } from '../links/ReadingTrack';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly moves: readonly SortMove[]; readonly incomplete: string | null };

export function ReviewSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Vérifier les liens')} tall>
      <ReviewBody id={id} onDismiss={onDismiss} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: it asks Claude then (and on "Réessayer"), and drops the question when the sheet goes. */
function ReviewBody({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[id]);
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).length);
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    reviewLine(id, controller.signal).then(
      ({ moves, incomplete }) => {
        if (controller.signal.aborted) return;
        setKept(new Set(moves.map(move => move.link)));
        setPhase({ kind: 'ready', moves, incomplete });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('erreur inconnue') });
      },
    );
    return () => controller.abort();
  }, [id, attempt]);

  if (!line) return null;

  const retry = () => {
    setPhase({ kind: 'asking' });
    setAttempt(value => value + 1);
  };
  const toggle = (linkId: string) =>
    setKept(current => {
      const next = new Set(current);
      if (!next.delete(linkId)) next.add(linkId);
      return next;
    });
  const apply = () => {
    if (phase.kind !== 'ready') return;
    const { moved, undo } = applyReview(id, phase.moves.filter(move => kept.has(move.link)));
    onDismiss();
    if (moved.length > 0) showSnack(plural(moved.length, 'lien déplacé', 'liens déplacés'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting}>
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Claude relit {links} de {collection}…', { links: plural(count, 'lien'), collection: shownTitle(line) })}
        </AppText>
      </View>
    );
  }
  // Nothing to move but part of it unread is no all-clear: it says so, as a failure does.
  const failure = phase.kind === 'failed' ? phase.reason : phase.moves.length === 0 ? phase.incomplete : null;
  if (failure !== null) {
    return (
      <View style={styles.body}>
        <AppText variant="body" color={theme.color.danger}>
          {t('Claude n’a pas pu relire la collection : {reason}', { reason: t(failure) })}
        </AppText>
        <Button kind="text" label={t('Réessayer')} onPress={retry} style={styles.end} />
      </View>
    );
  }
  if (phase.kind !== 'ready') return null;
  if (phase.moves.length === 0) {
    return (
      <View style={styles.body}>
        <AppText variant="body">{t('Tous les liens ont leur place dans {collection}.', { collection: shownTitle(line) })}</AppText>
        <Button kind="text" label={t('Fermer')} onPress={onDismiss} style={styles.end} />
      </View>
    );
  }
  return (
    <SheetScroll contentContainerStyle={styles.body}>
      <AppText variant="body" color={theme.color.inkMuted}>
        {t('Claude propose d’en sortir {links} de {collection}. Décochez ceux qui y restent.', { links: plural(phase.moves.length, 'lien'), collection: shownTitle(line) })}
      </AppText>
      {phase.incomplete ? (
        <AppText variant="meta" color={theme.color.danger}>
          {t('Une partie n’a pas pu être relue : {reason}', { reason: t(phase.incomplete) })}
        </AppText>
      ) : null}
      <View>
        {phase.moves.map(move => (
          <MoveRow key={move.link} move={move} kept={kept.has(move.link)} onToggle={() => toggle(move.link)} />
        ))}
      </View>
      <Button label={kept.size > 0 ? t('Déplacer {links}', { links: plural(kept.size, 'lien') }) : t('Déplacer')} disabled={kept.size === 0} onPress={apply} style={styles.end} />
    </SheetScroll>
  );
}

/** The row is the checkbox: the link, where it would go, and that collection's cut-out. */
function MoveRow({ move, kept, onToggle }: { move: SortMove; kept: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[move.link]);
  const target = useLibraryStore(s => s.notes[move.to]);
  if (!link) return null;
  const title = link.title || displayHost(link.url);
  const destination = move.to === INBOX_ID ? t(INBOX_TITLE) : (target?.title ?? '');
  return (
    <Tappable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: kept }} accessibilityLabel={t('{link}, vers {collection}', { link: title, collection: destination })} style={styles.row}>
      <Icon name={kept ? 'boxChecked' : 'box'} size={22} color={kept ? theme.color.inkMuted : theme.color.ink} />
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {t('Vers {collection}', { collection: destination })}
        </AppText>
      </View>
      <Emblem emblem={collectionEmblem(move.to, target?.emblem ?? null)} color={asLineColor(target?.color ?? null)} size={28} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
  waiting: { gap: 16, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  rowText: { flex: 1, gap: 2 },
});
