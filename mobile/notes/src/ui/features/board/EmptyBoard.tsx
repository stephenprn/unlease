/** An empty view says what goes there and how to put something in it, under a small collage. */
import React, { memo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import type { CollageScene } from '@unlease/design/collage';
import { t, tx } from '@unlease/core/i18n';
import type { BoardView } from '@app/hooks/useBoard';

import { AppText, Collage } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

type Kind = 'notes' | 'reminders' | 'archive' | 'trash' | 'label';

const COPY: Record<Kind, { title: string; body: string }> = {
  notes: {
    title: tx('Le tableau est vide'),
    body: tx('Écrivez une note ou une liste avec la barre du bas. Pour un lien, partagez-le depuis n’importe quelle app : {app} le garde et, avec Claude, le range dans la bonne collection.'),
  },
  reminders: { title: tx('Aucun rappel'), body: tx('Le bouton +, en bas, crée une note et vous demande quand la rappeler.') },
  archive: { title: tx('Rien aux archives'), body: tx('Archivez une note pour la retirer du tableau sans la supprimer.') },
  trash: { title: tx('La corbeille est vide'), body: tx('Les notes supprimées y restent sept jours, le temps de changer d’avis.') },
  label: { title: tx('Aucune note avec ce label'), body: tx('Ajoutez ce label à une note depuis son étiquette, en bas de la note, ou créez-en une ici.') },
};

const SCENE: Record<Kind, CollageScene> = { notes: 'notes', reminders: 'reminders', archive: 'archive', trash: 'trash', label: 'label' };

/** `onRefresh`: the wall's pull to sync, here too. */
function EmptyBoardComponent({ view, header, bottomSpace, refreshing = false, onRefresh }: { view: BoardView; header?: React.ReactNode; bottomSpace: number; refreshing?: boolean; onRefresh?: () => void }) {
  const theme = useTheme();
  const kind: Kind = view.startsWith('label:') ? 'label' : (view as Kind);
  const copy = COPY[kind];
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomSpace + 24 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.color.focus]} progressBackgroundColor={theme.color.paper} /> : undefined}
    >
      {header}
      <View style={styles.body}>
        {/* Keyed by the view, so another empty view lays its own collage down afresh. */}
        <Collage key={kind} scene={SCENE[kind]} width={252} />
        <AppText variant="title" style={styles.title}>
          {t(copy.title)}
        </AppText>
        <AppText variant="body" style={styles.text}>
          {t(copy.body, { app: APP_NAME })}
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, gap: 10 },
  title: { textAlign: 'center', marginTop: 18 },
  text: { textAlign: 'center', maxWidth: 360 },
});

export const EmptyBoard = memo(EmptyBoardComponent);
