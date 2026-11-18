/**
 * An item open. A card opens at the till: its barcode black on white, the number under it in large
 * figures, the screen brightened and kept on while it shows (Réglages: « Éclairer l'écran »), at the top
 * when asked (else under its sides); then what it says, its notes; it counts as used. An identity
 * paper opens on its head, washed in its kind's colour: whose it is, its number large to copy, how
 * long it is valid; then its pictures and the rest. A document: its pictures, what it says (how long
 * to keep it), its notes. Locked meanwhile, the lock.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { t } from '@unlease/core/i18n';
import { formatIsoDay, formatPrice } from '@unlease/core/services/format';
import { today as todayOf } from '@unlease/calendar/services/time';
import { contactName } from '@unlease/contacts/services/names';
import { IDENTITY_KINDS, type WalletItem } from '@unlease/wallet/models/item';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { expiryOf, keepTermOf } from '@unlease/wallet/services/expiry';
import { documentTypeName, expiryWords, itemInk, keepWords, kindName, KIND_GLYPHS, validUntilWords } from '@unlease/wallet/services/words';
import { deleteItem, markUsed, setFavourite } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { usePrefsStore } from '@app/store/prefs';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, EdgeScrollView, Ground, Icon, IconButton, Organic, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { copySecret, tillScreen } from '@app/window';

import { Barcode } from '../features/Barcode';
import { FileView } from '../features/FileView';
import { LockPanel } from '../features/vault/LockPanel';
import type { ScreenProps } from '../navigation/types';

const FACE_LABELS = { front: 'Front [side]', back: 'Back [side]', page: 'Page', photo: 'Photo' } as const;

function Till({ item }: { item: WalletItem }) {
  const styles = useThemedStyles(makeStyles);
  const d = item.details;
  const number = d.number || d.barcode?.value || '';
  if (!number) return null;
  return (
    <Organic outline="panel" style={styles.till}>
      {d.barcode ? <Barcode format={d.barcode.format} value={d.barcode.value} label={t('Barcode of {card}', { card: item.title || kindName(item.kind) })} /> : null}
      <AppText variant="display" color="#1A1817" selectable style={styles.tillNumber} adjustsFontSizeToFit numberOfLines={2}>
        {number}
      </AppText>
    </Organic>
  );
}

/** An identity paper's head: the thing itself, in its kind's wash. */
function PaperHead({ item, name, today, onCopy }: { item: WalletItem; name: string; today: string; onCopy: (number: string) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink = theme.line[itemInk(item)];
  const d = item.details;
  const expiry = expiryOf(item, today);
  const until = d.expiresOn ? [validUntilWords(d.expiresOn), expiry.tone === 'valid' ? null : expiryWords(expiry)].filter(Boolean).join(' · ') : null;
  return (
    <Organic outline="panel" style={[styles.head, { backgroundColor: ink.tint }]}>
      <View style={styles.headTop}>
        <Organic pebble={pebbleTurnOf(item.id)} style={[styles.headStone, { backgroundColor: ink.fill }]}>
          <Icon name={KIND_GLYPHS[item.kind]} size={26} color={ink.on} />
        </Organic>
        <View style={styles.headWords}>
          <AppText variant="labelSmall" color={ink.text}>
            {kindName(item.kind)}
          </AppText>
          <AppText variant="title" selectable numberOfLines={2}>
            {name}
          </AppText>
        </View>
      </View>
      {d.number ? (
        <View style={styles.headNumber}>
          <AppText variant="display" selectable style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
            {d.number}
          </AppText>
          <IconButton icon="copy" label={t('Copy the number')} onPress={() => onCopy(d.number)} />
        </View>
      ) : null}
      {until ? (
        <AppText variant="metaStrong" color={expiry.tone === 'expired' ? theme.color.danger : expiry.tone === 'valid' ? theme.color.inkMuted : theme.color.waiting}>
          {until}
        </AppText>
      ) : null}
    </Organic>
  );
}

function Fact({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.fact}>
      <AppText variant="label" color={undefined} style={styles.factLabel}>
        {label}
      </AppText>
      <View style={styles.factValue}>
        <AppText variant="body" selectable style={styles.factText}>
          {value}
        </AppText>
        {action}
      </View>
    </View>
  );
}

function Opened({ item, onEdit, onGone }: { item: WalletItem; onEdit: () => void; onGone: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const contacts = useLibraryStore(s => s.contacts);
  const top = usePrefsStore(s => s.barcodeTop);
  const brighten = usePrefsStore(s => s.brighten);
  const today = todayOf(useMinute());
  const d = item.details;
  const counted = useRef(false);
  const card = item.tier === 'cards';

  useEffect(() => {
    if (!card || counted.current) return;
    counted.current = true;
    markUsed(item);
  }, [card, item]);
  // At the till: the screen brightened and kept on while the card shows.
  useFocusEffect(
    useCallback(() => {
      if (!card || !brighten) return undefined;
      tillScreen(true);
      return () => tillScreen(false);
    }, [card, brighten]),
  );

  const copy = (text: string): void => {
    if (copySecret(text)) showSnack(t('Number copied: it leaves the clipboard in a minute'), undefined, { tone: 'success' });
  };
  const remove = (): void => {
    const undo = deleteItem(item.id);
    onGone();
    showSnack(t('{name} deleted', { name: item.title || kindName(item.kind) }), { label: t('Undo'), run: undo });
  };
  const expiry = expiryOf(item, today);
  const person = d.personContactId ? contacts[d.personContactId] : undefined;
  const keep = item.kind === 'document' ? keepWords(keepTermOf(item)) : null;
  // An identity paper shows whose it is, its number and its term in its head.
  const identity = (IDENTITY_KINDS as readonly string[]).includes(item.kind);
  const owner = person && person.deletedAt === null ? contactName(person) : null;

  const facts: { label: string; value: string; action?: React.ReactNode }[] = [];
  if (item.kind === 'document' && d.docType) facts.push({ label: t('Type'), value: documentTypeName(d.docType) });
  if (d.issuer) facts.push({ label: card ? t('Shop') : t('Issued by'), value: d.issuer });
  if (owner && !identity) facts.push({ label: t('For'), value: owner });
  if (d.holder && !(identity && !owner)) facts.push({ label: t('Name on it'), value: d.holder });
  if (d.number && !card && !identity) facts.push({ label: t('Number [paper]'), value: d.number, action: <IconButton icon="copy" size={20} label={t('Copy the number')} onPress={() => copy(d.number)} /> });
  if (d.birthDate) facts.push({ label: t('Born on'), value: formatIsoDay(d.birthDate) });
  if (d.nationality) facts.push({ label: t('Nationality'), value: d.nationality });
  if (d.docDate) facts.push({ label: t('Date'), value: formatIsoDay(d.docDate) });
  if (d.issuedOn) facts.push({ label: t('Issued on'), value: formatIsoDay(d.issuedOn) });
  if (d.expiresOn && !identity) facts.push({ label: item.kind === 'document' ? t('Ends on') : t('Valid until'), value: `${formatIsoDay(d.expiresOn)} · ${expiryWords(expiry) ?? ''}` });
  if (d.balance) facts.push({ label: t('Balance'), value: formatPrice(d.balance.amount, d.balance.currency) });
  if (keep) facts.push({ label: t('Keep'), value: keep });
  if (d.labels.length > 0) facts.push({ label: t('Labels'), value: d.labels.join(', ') });

  return (
    <>
      <TopBar
        title={item.title || kindName(item.kind)}
        onBack={onGone}
        actions={
          <>
            {card ? <IconButton icon="star" selected={item.favourite} label={item.favourite ? t('Remove from favourites') : t('Add to favourites')} onPress={() => setFavourite(item, !item.favourite)} /> : null}
            <IconButton icon="edit" label={t('Edit')} onPress={onEdit} />
          </>
        }
      />
      <EdgeScrollView contentContainerStyle={styles.content}>
        {card && top ? <Till item={item} /> : null}
        {identity ? <PaperHead item={item} name={owner ?? (d.holder || item.title || kindName(item.kind))} today={today} onCopy={copy} /> : null}
        {d.files.map((file, index) => (
          <View key={file.id} style={styles.face}>
            <FileView itemId={item.id} file={file} label={`${t(FACE_LABELS[file.role])} ${index + 1}`} />
            {file.role !== 'page' ? <AppText variant="meta">{t(FACE_LABELS[file.role])}</AppText> : null}
          </View>
        ))}
        {card && !top ? <Till item={item} /> : null}
        {facts.length > 0 ? (
          <Organic outline="panel" style={styles.facts}>
            {facts.map(fact => (
              <Fact key={fact.label} {...fact} />
            ))}
          </Organic>
        ) : null}
        {item.notes.trim() ? (
          <AppText variant="body" selectable style={styles.notes}>
            {item.notes}
          </AppText>
        ) : null}
        <Button kind="dangerText" icon="trash" label={t('Delete')} onPress={remove} style={styles.delete} />
      </EdgeScrollView>
    </>
  );
}

export function ItemScreen({ navigation, route }: ScreenProps<'Item'>) {
  const styles = useThemedStyles(makeStyles);
  const item = useLibraryStore(s => s.items[route.params.id]);
  const back = (): void => navigation.goBack();
  let body: React.ReactNode;
  if (!item || item.deletedAt !== null)
    body = (
      <>
        <TopBar title={t('Not found')} onBack={back} />
        <AppText variant="body" style={styles.gone}>
          {t('This card or paper is no longer in your wallet.')}
        </AppText>
      </>
    );
  else if (item.locked)
    body = (
      <>
        <TopBar title={t('Locked')} onBack={back} />
        <LockPanel subject="paper" />
      </>
    );
  else body = <Opened item={item} onEdit={() => navigation.navigate('Edit', { id: item.id })} onGone={back} />;
  return (
    <View style={styles.screen}>
      <Ground />
      {body}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 32, gap: 14 },
    till: { alignItems: 'center', gap: 14, paddingVertical: 24, paddingHorizontal: 18, backgroundColor: '#FFFFFF' },
    tillNumber: { textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: 2, fontSize: 26, lineHeight: 34 },
    face: { gap: 6 },
    head: { padding: 18, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    headTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    headStone: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center' },
    headWords: { flex: 1, gap: 2 },
    headNumber: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    number: { flex: 1, fontVariant: ['tabular-nums'], letterSpacing: 1.5, fontSize: 26, lineHeight: 34 },
    facts: { padding: 16, gap: 12, backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    fact: { gap: 2 },
    factLabel: { color: theme.color.inkMuted },
    factValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    factText: { flex: 1 },
    notes: { marginHorizontal: 8 },
    delete: { alignSelf: 'flex-start', marginTop: 8 },
    gone: { margin: 24 },
  });
}
