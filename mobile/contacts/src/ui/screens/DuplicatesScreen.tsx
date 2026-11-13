/**
 * « Doublons » (Google's « Fusionner et corriger »): the contacts that are surely one person, each
 * group with why (the same e-mail, number or name). « Fusionner » keeps the most complete, gives it
 * what the others held, and puts them in the bin pointing at it, in one batch, undone from the slip;
 * « Ignorer » sets the group aside on this phone; « Tout fusionner », in the bar, does every group (as
 * on the web).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { DuplicateGroup, DuplicateReason } from '@unlease/contacts/services/duplicates';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { useContact, useDuplicates } from '@app/hooks/useContacts';
import { mergeAllDuplicates, mergeDuplicates } from '@app/store/actions';
import { ignoreDuplicates } from '@app/store/contactsUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EdgeFlatList, EmptyState, Ground, IconButton, Organic, Tappable, TopBar } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { listPressDelay } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import type { ScreenProps } from '../navigation/types';

const REASONS: Readonly<Record<DuplicateReason, string>> = {
  email: tx('Same email'),
  phone: tx('Same number'),
  name: tx('Same name'),
};

function Member({ id, kept, onOpen }: { id: string; kept: boolean; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const contact = useContact(id);
  if (!contact) return null;
  const name = contactName(contact);
  const detail = [workLine(contact), contact.phones[0]?.number, contact.emails[0]?.address].filter(Boolean).join(' · ');
  return (
    <Tappable unstable_pressDelay={listPressDelay} onPress={() => onOpen(id)} style={styles.member} accessibilityRole="link" accessibilityLabel={name}>
      <ContactAvatar contact={contact} size={40} />
      <View style={styles.fill}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        {detail ? (
          <AppText variant="meta" numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {kept ? (
        <AppText variant="labelSmall" color={theme.color.action}>
          {t('Kept')}
        </AppText>
      ) : null}
    </Tappable>
  );
}

function Group({ group, onOpen }: { group: DuplicateGroup; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const keep = group.ids[0]!;
  const merge = (): void => {
    const name = contactName(useLibraryStore.getState().contacts[keep]!);
    const undo = mergeDuplicates(keep, group.ids);
    if (undo) showSnack(t('Merged into {name}', { name }), { label: t('Undo'), run: undo }, { tone: 'success' });
  };
  return (
    <Organic outline="card" style={styles.group}>
      <AppText variant="meta" style={styles.reasons}>
        {group.reasons.map(reason => t(REASONS[reason])).join(' · ')}
      </AppText>
      {group.ids.map(id => (
        <Member key={id} id={id} kept={id === keep} onOpen={onOpen} />
      ))}
      <View style={styles.buttons}>
        <Button label={t('Ignore')} kind="text" onPress={() => ignoreDuplicates(group.ids)} />
        <Button label={t('Merge')} icon="people" kind="tonal" onPress={merge} />
      </View>
    </Organic>
  );
}

export function DuplicatesScreen({ navigation }: ScreenProps<'Duplicates'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const groups = useDuplicates();
  const open = (id: string): void => navigation.navigate('Contact', { id });
  // Every group at once, one slip that takes them all back.
  const mergeAll = (): void => {
    const undo = mergeAllDuplicates(groups.map(group => ({ keepId: group.ids[0]!, ids: group.ids })));
    const merged = groups.reduce((sum, group) => sum + group.ids.length - 1, 0);
    if (undo) showSnack(t('{contacts} merged', { contacts: plural(merged, 'contact') }), { label: t('Undo'), run: undo }, { tone: 'success' });
  };
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Duplicates')} onBack={() => navigation.goBack()} actions={groups.length > 1 ? <IconButton icon="people" label={t('Merge all')} onPress={mergeAll} /> : undefined} />
      <EdgeFlatList
        data={groups}
        keyExtractor={group => group.ids.join(',')}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          // Why each group is here is its own first line (« Même e-mail »): the notice says only what merging does.
          groups.length > 0 ? (
            <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
              {t('Merging keeps the first, completes it with what the others have besides, and moves the others to the bin.')}
            </AppText>
          ) : undefined
        }
        renderItem={({ item }) => <Group group={item} onOpen={open} />}
        ListEmptyComponent={
          <EmptyState scene="label" title={t('No duplicates')} text={t('Everyone appears once. After an import, come back here: duplicate contacts gather here.')} />
        }
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 12 },
    notice: { paddingHorizontal: 4, paddingBottom: 4 },
    group: { paddingVertical: 8, backgroundColor: theme.color.paper },
    reasons: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
    member: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 6, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    fill: { flex: 1 },
    // Its end in line with the rows' (« Gardé », 16 in), as far from the card's foot as the reasons from its top.
    // « Fusionner » in the card's corner, as far in from its foot as from its side (16: its 8 and the card's).
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  });
