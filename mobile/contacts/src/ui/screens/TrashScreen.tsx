/**
 * The contacts in the bin, as every app's (Carnet's, the web's): a card each (`BinRow`) with when it
 * went there, opening the contact, « Restaurer » (undone from the slip) and « Supprimer
 * définitivement » (asked first); the bar's broom empties them all (asked first). The server empties
 * the bin itself after its retention.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { useContact, useTrashedContacts } from '@app/hooks/useContacts';
import { deleteContactsForever, emptyContactsBin, restoreContacts } from '@app/store/actions';
import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/uiStore';

import { BinList, BinRow, Dialog, Ground, IconButton, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import type { ScreenProps } from '../navigation/types';

function TrashedRow({ id, now, onOpen, onDelete }: { id: string; now: number; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const contact = useContact(id);
  if (!contact) return null;
  return (
    <BinRow
      title={contactName(contact)}
      meta={t('Moved to the bin {when}', { when: formatRelative(contact.trashedAt ?? now, now) })}
      leading={<ContactAvatar contact={contact} size={40} />}
      onOpen={() => onOpen(id)}
      onRestore={() => showSnack(t('Contact restored'), { label: t('Undo'), run: restoreContacts([id]) }, { tone: 'success' })}
      onDelete={() => onDelete(id)}
    />
  );
}

export function TrashScreen({ navigation }: ScreenProps<'Trash'>) {
  const styles = useThemedStyles(makeStyles);
  const ids = useTrashedContacts();
  const now = useMinute();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const open = (id: string) => navigation.navigate('Contact', { id });

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Bin')} onBack={() => navigation.goBack()} actions={ids.length > 0 ? <IconButton icon="broom" label={t('Empty the bin')} onPress={() => setConfirmEmpty(true)} /> : undefined} />
      <BinList
        ids={ids}
        retention={t('Contacts in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}
        emptyText={t('Deleted contacts stay there for {days} days, time enough to change your mind.', { days: TRASH_RETENTION_DAYS })}
        renderRow={id => <TrashedRow id={id} now={now} onOpen={open} onDelete={setToDelete} />}
      />
      <Dialog
        visible={toDelete !== null}
        title={t('Delete forever?')}
        message={t('This contact will disappear from all your devices. This cannot be undone.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteContactsForever([toDelete]);
            showSnack(t('Contact deleted forever'), undefined, { tone: 'success' });
          }
          setToDelete(null);
        }}
      />
      <Dialog
        visible={confirmEmpty}
        title={t('Empty the bin?')}
        message={t('Every contact in the bin will be deleted forever, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          const gone = emptyContactsBin();
          showSnack(t('{deleted} forever', { deleted: plural(gone, 'contact deleted', 'contacts deleted') }), undefined, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
  });
