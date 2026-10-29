/**
 * An empty view says what goes there and how to put something in it, under a
 * small collage (the phone's EmptyBoard), its copy adjusted for a keyboard and
 * a mouse when the window is wide.
 */
import { memo } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import type { CollageScene } from '@unlease/design/collage';
import { t, tx } from '@unlease/core/i18n';

import type { BoardView } from '../../../app/hooks/useBoard';
import { EmptyState } from '../../components/EmptyState';
import { NARROW, useMedia } from '../../useMedia';

type Kind = 'notes' | 'reminders' | 'archive' | 'trash' | 'label';

const COPY: Record<Kind, { title: string; body: string }> = {
  notes: {
    title: tx('Le tableau est vide'),
    body: tx('Écrivez une note avec la barre du haut, ou appuyez sur C. Pour un lien, collez-le n’importe où sur le tableau : {app} le garde et, avec Claude, le range dans la bonne collection.'),
  },
  reminders: {
    title: tx('Aucun rappel'),
    body: tx('Une note créée ici vous demande aussitôt quand la rappeler. Votre téléphone sonnera à l’heure dite.'),
  },
  archive: { title: tx('Rien aux archives'), body: tx('Archivez une note pour la retirer du tableau sans la supprimer.') },
  trash: {
    title: tx('La corbeille est vide'),
    body: tx('Les notes supprimées y restent sept jours, le temps de changer d’avis.'),
  },
  label: { title: tx('Aucune note avec ce label'), body: tx('Ajoutez ce label à une note depuis l’éditeur, ou créez-en une ici.') },
};

/** On a phone the capture buttons are at the bottom and there is no keyboard: the phone's words. */
const NARROW_COPY: Partial<Record<Kind, { title: string; body: string }>> = {
  notes: {
    title: tx('Le tableau est vide'),
    body: tx('Écrivez une note ou une liste avec la barre du bas. Pour un lien, touchez le lien en bas : {app} le garde et, avec Claude, le range dans la bonne collection.'),
  },
  reminders: { title: tx('Aucun rappel'), body: tx('Le bouton +, en bas, crée une note et vous demande quand la rappeler.') },
};

const SCENE: Record<Kind, CollageScene> = { notes: 'notes', reminders: 'reminders', archive: 'archive', trash: 'trash', label: 'label' };

/** Under a keyboard, the keys that fill the board. */
const NOTE_KEYS = [
  { key: 'C', label: tx('note') },
  { key: 'L', label: tx('liste') },
  { key: 'V', label: tx('coller un lien') },
  { key: '?', label: tx('raccourcis') },
] as const;

function EmptyBoardComponent({ view }: { view: BoardView }) {
  const narrow = useMedia(NARROW);
  const kind: Kind = view.startsWith('label:') ? 'label' : (view as Kind);
  const copy = (narrow ? NARROW_COPY[kind] : undefined) ?? COPY[kind];
  return <EmptyState scene={SCENE[kind]} title={t(copy.title)} text={t(copy.body, { app: APP_NAME })} keys={view === 'notes' && !narrow ? NOTE_KEYS.map(item => ({ ...item, label: t(item.label) })) : undefined} />;
}

export const EmptyBoard = memo(EmptyBoardComponent);
