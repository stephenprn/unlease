/** An empty view says what goes there and how to put something in it, under a small collage (the suite's `EmptyState`). */
import React, { memo } from 'react';
import type { RefreshControlProps } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import type { CollageScene } from '@unlease/design/collage';
import { t, tx } from '@unlease/core/i18n';
import type { BoardView } from '@app/hooks/useBoard';

import { EdgeScrollView, EmptyState } from '../../components';

type Kind = 'notes' | 'reminders' | 'archive' | 'trash' | 'label';

const COPY: Record<Kind, { title: string; body: string }> = {
  notes: {
    title: tx('Le tableau est vide'),
    body: tx('Le bouton +, en bas, crée une note, une liste ou un dessin. Pour un lien, partagez-le depuis n’importe quelle app : {app} le garde et, avec Claude, le range dans la bonne collection.'),
  },
  reminders: { title: tx('Aucun rappel'), body: tx('Le bouton +, en bas, crée une note et vous demande quand la rappeler.') },
  archive: { title: tx('Rien aux archives'), body: tx('Archivez une note pour la retirer du tableau sans la supprimer.') },
  trash: { title: tx('La corbeille est vide'), body: tx('Les notes supprimées y restent {days} jours, le temps de changer d’avis.') },
  label: { title: tx('Aucune note avec ce label'), body: tx('Ajoutez ce label à une note depuis son étiquette, en bas de la note, ou créez-en une ici.') },
};

const SCENE: Record<Kind, CollageScene> = { notes: 'notes', reminders: 'reminders', archive: 'archive', trash: 'trash', label: 'label' };

/** `refreshControl`: the wall's pull to sync (`usePullToSync`), here too. */
function EmptyBoardComponent({ view, header, bottomSpace, refreshControl }: { view: BoardView; header?: React.ReactNode; bottomSpace: number; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  const kind: Kind = view.startsWith('label:') ? 'label' : (view as Kind);
  const copy = COPY[kind];
  return (
    <EdgeScrollView
      contentContainerStyle={{ paddingBottom: bottomSpace + 24 }}
      refreshControl={refreshControl}
    >
      {header}
      <EmptyState scene={SCENE[kind]} title={t(copy.title)} text={t(copy.body, { app: APP_NAME, days: TRASH_RETENTION_DAYS })} />
    </EdgeScrollView>
  );
}

export const EmptyBoard = memo(EmptyBoardComponent);
