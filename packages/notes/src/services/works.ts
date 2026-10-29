/**
 * What the films, series, books and games modules show: a rating's value, a title's state in Seerr,
 * where a recap stops.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import type { SeerrStatus } from '../sync/seerr';
import type { Rating } from '../sync/works';
import { formatNumber } from '@unlease/core/services/format';

/** « 7,6 / 10 », « 88 / 100 ». */
export const ratingValue = (rating: Pick<Rating, 'value' | 'scale'>): string => `${formatNumber(rating.value, 1)} / ${formatNumber(rating.scale, 0)}`;

/** How full a rating's meter is, from 0 to 1. */
export const ratingShare = (rating: Pick<Rating, 'value' | 'scale'>): number => Math.min(1, Math.max(0, rating.value / rating.scale));

/** A rating's site and which of its scores: « Rotten Tomatoes · Critiques ». */
export const ratingSource = (rating: Pick<Rating, 'source' | 'label'>): string => (rating.label ? `${rating.source} · ${rating.label}` : rating.source);

/** A title's state in Seerr, in a word or two. */
export const SEERR_STATUS_WORDS: Readonly<Record<SeerrStatus, string>> = localized({
  available: tx('Disponible'),
  partial: tx('En partie disponible'),
  processing: tx('En cours d’ajout'),
  requested: tx('Demandé'),
  missing: tx('À demander'),
});

/** Where the recap stops, for the question and its wait: « l’épisode 5 de la saison 2 », « la saison 2 ». */
export function recapStopWords(season: number, episode: number | null): string {
  return episode === null ? t('la saison {season}', { season }) : t('l’épisode {episode} de la saison {season}', { episode, season });
}

/** As many seasons and episodes as the pickers offer. */
export const RECAP_LIMITS = { seasons: 40, episodes: 60 } as const;
