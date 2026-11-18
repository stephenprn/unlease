/**
 * Wallet's home: its three places under one bar at the foot (`WalletTabBar`). « Cartes »: the cards,
 * two to a row in the shape of the cards themselves, favourites then the most used lately, the
 * emergency card first; they open without asking (the Keystore keeps their key). « Identité »: the
 * identity papers, by person when they concern several. « Documents »: by type, newest first, then
 * those kept longer than France asks. A locked place shows its lock (`LockPanel`). The search
 * strip looks through what is open, in memory only. The capture pebble adds what the place holds.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import { today as todayOf } from '@unlease/calendar/services/time';
import { contactName } from '@unlease/contacts/services/names';
import { DOCUMENT_TYPES, type DocumentType } from '@unlease/wallet/models/documentTypes';
import { isIdentityKind, type ItemKind, type WalletItem } from '@unlease/wallet/models/item';
import { discardable } from '@unlease/wallet/services/expiry';
import { orderCards, orderDocuments, orderIdentity } from '@unlease/wallet/services/order';
import { searchItems } from '@unlease/wallet/services/search';
import { WALLET_SETTINGS_PLACES } from '@unlease/wallet/services/settingsPlaces';
import { documentTypeName } from '@unlease/wallet/services/words';
import { useLibraryStore } from '@app/store/libraryStore';
import { useVaultStatus, useVaultStore } from '@app/store/vault';
import { liveItems } from '@app/store/walletProjection';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectDrawerOpen, setDrawerOpen, setSnackClearance, useUiStore } from '@shared/app/store/uiStore';
import { AppText, Button, EdgeScrollView, EmptyState, FAB_CLEARANCE, FabMenu, Ground, SearchHeader, SyncLine, Tappable, usePullToSync } from '@shared/ui/components';
import { SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { ItemRow } from '../features/ItemRow';
import { Tile } from '../features/Tiles';
import { LockPanel } from '../features/vault/LockPanel';
import { KitStep, VaultIntro } from '../features/vault/VaultIntro';
import { Drawer, type DrawerPlace } from '../navigation/Drawer';
import type { ScreenProps, WalletPlace } from '../navigation/types';
import { TAB_BAR_HEIGHT, WalletTabBar } from '../navigation/WalletTabBar';

const PLACE_IN = FadeIn.duration(duration.short).easing(decelerate);

/** Tiles two to a row. */
function TileGrid({ items, today, names, onOpen }: { items: readonly WalletItem[]; today: string; names?: Readonly<Record<string, string>>; onOpen: (id: string) => void }) {
  const rows: WalletItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={grid.grid}>
      {rows.map(row => (
        <View key={row[0]!.id} style={grid.row}>
          {row.map(item => (
            <Tile key={item.id} item={item} today={today} person={item.details.personContactId ? (names?.[item.details.personContactId] ?? null) : null} onOpen={onOpen} />
          ))}
          {row.length === 1 ? <View style={grid.spacer} /> : null}
        </View>
      ))}
    </View>
  );
}

const grid = StyleSheet.create({
  grid: { paddingHorizontal: 12, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  spacer: { flex: 1 },
});

function TypeChips({ types, chosen, onChoose }: { types: readonly DocumentType[]; chosen: DocumentType | null; onChoose: (type: DocumentType | null) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <Tappable key={key} outline="row" style={[styles.chip, on ? { backgroundColor: theme.color.actionContainer, borderColor: 'transparent' } : null]} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <AppText variant={on ? 'labelStrong' : 'label'} color={on ? theme.color.onActionContainer : theme.color.ink}>
        {label}
      </AppText>
    </Tappable>
  );
  return (
    <EdgeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chip('all', t('All'), chosen === null, () => onChoose(null))}
      {types.map(type => chip(type, documentTypeName(type), chosen === type, () => onChoose(chosen === type ? null : type)))}
    </EdgeScrollView>
  );
}

export function HomeScreen({ navigation, route }: ScreenProps<'Home'>) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const place: WalletPlace = route.params?.place ?? 'cards';
  const status = useVaultStatus();
  const pendingKit = useVaultStore(s => s.pendingKit);
  const drawerOpen = useUiStore(selectDrawerOpen);
  const items = useLibraryStore(s => s.items);
  const contacts = useLibraryStore(s => s.contacts);
  const now = useMinute();
  const today = todayOf(now);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<DocumentType | null>(null);
  const searching = query.trim().length > 0;
  const bottom = TAB_BAR_HEIGHT + insets.bottom;
  const pullToSync = usePullToSync();

  const live = useMemo(() => liveItems(items), [items]);
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const contact of Object.values(contacts)) if (contact.deletedAt === null) out[contact.id] = contactName(contact);
    return out;
  }, [contacts]);
  const cards = useMemo(() => {
    const ordered = orderCards(live.filter(item => item.tier === 'cards'), now);
    return [...ordered.filter(item => item.kind === 'emergency'), ...ordered.filter(item => item.kind !== 'emergency')];
  }, [live, now]);
  const papers = useMemo(() => orderIdentity(live.filter(item => isIdentityKind(item.kind))), [live]);
  const documents = useMemo(() => orderDocuments(live.filter(item => item.kind === 'document')), [live]);
  const stale = useMemo(() => new Set(discardable(documents, today).map(item => item.id)), [documents, today]);
  const types = useMemo(() => DOCUMENT_TYPES.filter(each => documents.some(item => (item.details.docType ?? 'other') === each)), [documents]);
  const found = useMemo(() => (searching ? searchItems(live, query) : []), [live, query, searching]);

  const open = useCallback((id: string) => navigation.navigate('Item', { id }), [navigation]);
  const choose = useCallback((next: WalletPlace) => navigation.setParams({ place: next }), [navigation]);
  const add = (kind: ItemKind) => navigation.navigate('Edit', { kind });

  useFocusEffect(
    useCallback(() => {
      if (!searching) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setQuery('');
        return true;
      });
      return () => subscription.remove();
    }, [searching]),
  );

  const locked = (tier: 'cards' | 'papers'): boolean => (tier === 'cards' ? status === 'locked' : status !== 'open');
  const fab =
    pendingKit || status === 'none' || locked(place === 'cards' ? 'cards' : 'papers')
      ? []
      : place === 'cards'
        ? [
            { icon: 'card' as const, label: t('Card'), onPress: () => add('card') },
            { icon: 'gift' as const, label: t('Gift card'), onPress: () => add('giftCard') },
            { icon: 'medical' as const, label: t('Emergency card'), onPress: () => add('emergency') },
          ]
        : place === 'papers'
          ? [
              { icon: 'idCard' as const, label: t('Identity card'), onPress: () => add('idCard') },
              { icon: 'passport' as const, label: t('Passport'), onPress: () => add('passport') },
              { icon: 'car' as const, label: t('Driving licence'), onPress: () => add('drivingLicence') },
              { icon: 'heartPulse' as const, label: t('Health insurance card'), onPress: () => add('healthCard') },
            ]
          : [{ icon: 'plus' as const, label: t('Add a document'), onPress: () => add('document') }];
  const clearance = TAB_BAR_HEIGHT + (fab.length > 0 ? FAB_CLEARANCE : 16);
  useFocusEffect(
    useCallback(() => {
      setSnackClearance(clearance);
      return () => setSnackClearance(null);
    }, [clearance]),
  );
  const goPlace = (target: Exclude<DrawerPlace, null>): void => {
    if (target === 'settings') navigation.navigate('Settings');
    else navigation.navigate('Admin');
  };
  const openSettingsPlace = (found: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(found);
    if (screen === 'Erase') navigation.navigate('Erase');
    else if (screen !== 'Import') navigation.navigate(screen, found.section ? { section: found.section } : undefined);
  };

  let body: React.ReactNode;
  if (pendingKit) body = <KitStep />;
  else if (status === 'none') body = <VaultIntro />;
  else if (searching)
    body = (
      <>
        <SettingsMatches query={query} own={WALLET_SETTINGS_PLACES} style={styles.list} onOpen={openSettingsPlace} />
        {found.length > 0 ? (
          <>
            <AppText variant="meta" style={styles.summary} accessibilityLiveRegion="polite">
              {searchSummary(query, found.length)}
            </AppText>
            <View style={styles.list}>
              {found.map(item => (
                <ItemRow key={item.id} item={item} today={today} onOpen={open} />
              ))}
            </View>
          </>
        ) : (
          <EmptyState scene="search" title={searchSummary(query, 0)} text={APP_WORDS.wallet.searchHint} style={styles.empty} />
        )}
      </>
    );
  else if (place === 'cards')
    body = locked('cards') ? (
      <LockPanel subject="cards" />
    ) : cards.length > 0 ? (
      <TileGrid items={cards} today={today} onOpen={open} />
    ) : (
      <EmptyState scene="cards" title={t('No cards yet')} text={t('Your loyalty cards, gift cards and the card to show in an emergency, ready at the till.')} style={styles.empty}>
        <Button kind="tonal" icon="plus" label={t('Add a card')} onPress={() => add('card')} />
      </EmptyState>
    );
  else if (locked('papers')) body = <LockPanel subject={place === 'papers' ? 'papers' : 'documents'} />;
  else if (place === 'papers') {
    const people = [...new Set(papers.map(item => item.details.personContactId ?? ''))];
    body =
      papers.length === 0 ? (
        <EmptyState scene="papers" title={t('No papers yet')} text={t('Your identity card, passport, driving licence and health insurance card: both sides, their numbers and when they expire.')} style={styles.empty}>
          <Button kind="tonal" icon="plus" label={t('Add a paper')} onPress={() => add('idCard')} />
        </EmptyState>
      ) : (
        people.map(person => (
          <View key={person || 'me'} style={styles.group}>
            {people.length > 1 ? (
              <AppText variant="section" accessibilityRole="header" style={styles.section}>
                {person ? (names[person] ?? t('Someone')) : t('Yours')}
              </AppText>
            ) : null}
            <TileGrid items={papers.filter(item => (item.details.personContactId ?? '') === person)} today={today} names={names} onOpen={open} />
          </View>
        ))
      );
  } else {
    const shown = documents.filter(item => !stale.has(item.id) && (type === null || (item.details.docType ?? 'other') === type));
    const old = documents.filter(item => stale.has(item.id) && (type === null || (item.details.docType ?? 'other') === type));
    body =
      documents.length === 0 ? (
        <EmptyState scene="documents" title={t('No documents yet')} text={t('Tax notices, payslips, leases, insurance certificates, warranties: scanned or added as PDF, filed by type, kept as long as they must be.')} style={styles.empty}>
          <Button kind="tonal" icon="plus" label={t('Add a document')} onPress={() => add('document')} />
        </EmptyState>
      ) : (
        <>
          {types.length > 1 ? <TypeChips types={types} chosen={type} onChoose={setType} /> : null}
          <View style={styles.list}>
            {shown.map(item => (
              <ItemRow key={item.id} item={item} today={today} onOpen={open} />
            ))}
          </View>
          {old.length > 0 ? (
            <>
              <AppText variant="section" accessibilityRole="header" style={styles.section}>
                {t('Kept longer than needed')}
              </AppText>
              <AppText variant="meta" style={styles.summary}>
                {t('France no longer asks you to keep these. Delete them if you have no other use for them.')}
              </AppText>
              <View style={styles.list}>
                {old.map(item => (
                  <ItemRow key={item.id} item={item} today={today} onOpen={open} />
                ))}
              </View>
            </>
          ) : null}
        </>
      );
  }

  return (
    <View style={styles.screen}>
      <Ground />
      <SearchHeader query={query} onQuery={setQuery} onMenu={() => setDrawerOpen(true)} placeholder={APP_WORDS.wallet.search} onServer={() => navigation.navigate('Admin', { section: 'server' })} localText={t('No server: your wallet stays on this phone.')} />
      {/* The vault's passphrase is typed here (made, or asked to open): the keyboard shortens the place above the tab bar, so every field can come up over it. */}
      <KeyboardAvoidingView behavior="padding" style={styles.place}>
        <Animated.View key={place} entering={still ? undefined : PLACE_IN} style={styles.place}>
          <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: (fab.length > 0 ? FAB_CLEARANCE : 24) + bottom }]} keyboardShouldPersistTaps="handled" refreshControl={pullToSync}>
            <SyncLine />
            {body}
          </EdgeScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
      <WalletTabBar tab={place} marks={{ cards: locked('cards') && status !== 'none' ? 'locked' : null, papers: locked('papers') && status !== 'none' ? 'locked' : null, documents: locked('papers') && status !== 'none' ? 'locked' : null }} onTab={choose} />
      <FabMenu actions={fab} visible={fab.length > 0} above={bottom} />
      <Drawer open={drawerOpen} current={null} onClose={() => setDrawerOpen(false)} onPlace={goPlace} />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    place: { flex: 1 },
    content: { paddingTop: 4, gap: 12 },
    list: { paddingHorizontal: 12, gap: 8 },
    group: { gap: 8 },
    section: { marginTop: 12, marginHorizontal: 28 },
    summary: { marginHorizontal: 28 },
    empty: { marginTop: 8 },
    chips: { paddingHorizontal: 12, gap: 8 },
    chip: { height: 40, paddingHorizontal: 14, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline, backgroundColor: theme.color.paper },
  });
}
