/**
 * The contacts in the bin, as Carnet's and the web's: each with when it went there, « Restaurer »
 * (undone from the slip) and « Supprimer définitivement » (asked first); the bar's broom empties them
 * all (asked first). The server empties the bin itself after its retention.
 */
import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { t, tc } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { useContact, useTrashedContacts } from '@app/hooks/useContacts';
import { deleteContactsForever, emptyContactsBin, restoreContacts } from '@app/store/actions';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Dialog, EmptyState, Ground, IconButton, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import type { ScreenProps } from '../navigation/types';

function TrashedRow({ id, now, onDelete }: { id: string; now: number; onDelete: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const contact = useContact(id);
  if (!contact) return null;
  const name = contactName(contact);
  return (
    <View style={styles.row}>
      <ContactAvatar contact={contact} size={40} />
      <View style={styles.text}>
        <AppText variant="body" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {t('Mis à la corbeille {when}', { when: formatRelative(contact.trashedAt ?? now, now) })}
        </AppText>
      </View>
      <IconButton
        icon="restore"
        label={t('Restaurer {name}', { name })}
        onPress={() => showSnack(t('Contact restauré'), { label: tc('undo', 'Annuler'), run: restoreContacts([id]) }, { tone: 'success' })}
      />
      <IconButton icon="trash" label={t('Supprimer définitivement {name}', { name })} onPress={() => onDelete(id)} />
    </View>
  );
}

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ids = useTrashedContacts();
  const now = useMinute();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Corbeille')} onBack={() => navigation.goBack()} actions={ids.length > 0 ? <IconButton icon="broom" label={t('Vider la corbeille')} onPress={() => setConfirmEmpty(true)} /> : undefined} />
      <FlatList
        data={ids}
        keyExtractor={id => id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          ids.length > 0 ? (
            <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
              {t('Les contacts de la corbeille sont supprimés au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState scene="trash" title={t('La corbeille est vide')} text={t('Les contacts supprimés y restent {days} jours, le temps de changer d’avis.', { days: TRASH_RETENTION_DAYS })} />
        }
        renderItem={({ item }) => <TrashedRow id={item} now={now} onDelete={setToDelete} />}
      />
      <Dialog
        visible={toDelete !== null}
        title={t('Supprimer définitivement ?')}
        message={t('Ce contact disparaîtra de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteContactsForever([toDelete]);
            showSnack(t('Contact supprimé définitivement'), undefined, { tone: 'success' });
          }
          setToDelete(null);
        }}
      />
      <Dialog
        visible={confirmEmpty}
        title={t('Vider la corbeille ?')}
        message={t('Tous les contacts de la corbeille seront supprimés définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const gone = emptyContactsBin();
          showSnack(t('{deleted} définitivement', { deleted: plural(gone, 'contact supprimé', 'contacts supprimés') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48 },
    // On the faces' column, as the list's heads.
    notice: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    // As the list's rows (the face 20 in, the name at 76, 60 apart); its two buttons under the bar's broom.
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingLeft: 20, paddingRight: 4, paddingVertical: 4, marginVertical: GEOMETRY.rowGap / 2 },
    text: { flex: 1, gap: 1 },
  });
