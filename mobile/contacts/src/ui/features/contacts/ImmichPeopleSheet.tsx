/**
 * « Depuis Immich »: a contact's photo taken from the faces Immich recognised, the ones named like the
 * contact first, searchable by name (`orderImmichPeople`). The face chosen is kept by the server as one
 * of its own pictures (`POST /api/immich/people/:id/photo`): the contact wears it already uploaded, as
 * any photo, whatever becomes of Immich. The web's `ImmichPeopleDialog`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { t } from '@unlease/core/i18n';
import { orderImmichPeople, type ImmichPerson, type ImmichPhotoResponse } from '@unlease/core/sync/immich';
import { fetchImmichPeople, takeImmichFace } from '@shared/app/immich';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, EmptyLine, Sheet, SheetScroll, Tappable, TextField } from '@shared/ui/components';
import { ImmichPhoto } from '@shared/ui/features/immich/ImmichPhoto';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

type People = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly people: readonly ImmichPerson[] };

const GAP = 8;
const COLUMNS = 4;

export function ImmichPeopleSheet({ visible, name, onDismiss, onChosen }: { visible: boolean; name: string; onDismiss: () => void; onChosen: (photo: ImmichPhotoResponse) => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Photo from Immich')} tall keepsKeyboard>
      {visible ? <People name={name} onChosen={onChosen} /> : null}
    </Sheet>
  );
}

function People({ name, onChosen }: { name: string; onChosen: (photo: ImmichPhotoResponse) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const server = useSettingsStore(selectServer);
  const [people, setPeople] = useState<People>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [taking, setTaking] = useState<string | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    fetchImmichPeople(server, controller.signal).then(
      found => setPeople({ status: 'ready', people: found }),
      error => !controller.signal.aborted && setPeople({ status: 'failed', message: error instanceof Error ? error.message : t('Immich unreachable') }),
    );
    return () => controller.abort();
  }, [server]);
  const shown = useMemo(() => (people.status === 'ready' ? orderImmichPeople(people.people, query, name) : []), [people, query, name]);
  const tile = room > 0 ? Math.floor((room - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  const take = async (person: ImmichPerson): Promise<void> => {
    if (!server || taking) return;
    setTaking(person.id);
    try {
      onChosen(await takeImmichFace(server, person.id));
    } catch (error) {
      showSnack(error instanceof Error ? error.message : t('Immich unreachable'), undefined, { tone: 'error' });
    } finally {
      setTaking(null);
    }
  };

  return (
    <SheetScroll contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <TextField label={t('Search a name')} value={query} onChangeText={setQuery} returnKeyType="search" />
      <View onLayout={(event: LayoutChangeEvent) => setRoom(Math.round(event.nativeEvent.layout.width))}>
        {!server ? (
          <EmptyLine text={t('Connect a server first')} />
        ) : people.status === 'loading' ? (
          <AppText variant="meta">{t('Reading Immich…')}</AppText>
        ) : people.status === 'failed' ? (
          <EmptyLine text={people.message} glyph="alert" />
        ) : shown.length === 0 ? (
          <EmptyLine text={query.trim() ? t('Nobody named “{query}” in Immich.', { query: query.trim() }) : t('Immich hasn’t recognised anyone yet.')} glyph="people" />
        ) : tile === 0 ? null : (
          <View style={styles.grid}>
            {shown.map(person => (
              <Tappable
                key={person.id}
                onPress={() => void take(person)}
                disabled={taking !== null}
                style={[styles.person, { width: tile }]}
                accessibilityRole="button"
                accessibilityLabel={person.name || t('Someone without a name')}
              >
                <View>
                  <ImmichPhoto kind="person" id={person.id} size="thumbnail" width={tile} height={tile} label={person.name || t('Someone without a name')} round />
                  {taking === person.id ? <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.color.ink} /> : null}
                </View>
                <AppText variant="meta" numberOfLines={1}>
                  {person.name || t('No name')}
                </AppText>
              </Tappable>
            ))}
          </View>
        )}
      </View>
    </SheetScroll>
  );
}

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    list: { gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    person: { alignItems: 'center', gap: 4 },
  });
