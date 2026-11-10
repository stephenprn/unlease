/**
 * Agenda's sections of the Administration, in words both clients share (as Carnet's `seerrLine`,
 * Pages' `pagesAskLine`): each one's line on the Administration's home and its « how it works »:
 * the public holidays, the calendar published at a secret address, the questions to Claude.
 */
import { t, tx } from '@unlease/core/i18n';
import type { StatusLine } from '@unlease/core/services/admin';
import { countryName } from '@unlease/core/services/setup';
import type { ServerSettings } from '@unlease/core/sync/settings';

export const HOLIDAYS_INFO = tx('Le serveur va chercher les jours fériés du pays choisi sur Nager.Date (des données ouvertes, sans compte), pour l’an dernier, cette année et les deux suivantes, et les relit chaque année. Ils apparaissent dans « Autres agendas » sur chaque appareil, où chacun peut les cacher.');

/** « Jours fériés »: the country (and its region) whose days the server fetches, or none. */
export function holidaysLine(settings: ServerSettings): StatusLine {
  const { country, region } = settings.calendar.holidays;
  if (!country) return { tone: 'off', title: t('Aucun jour férié'), meta: t('Choisissez un pays pour voir ses jours fériés dans l’agenda.') };
  return { tone: 'ok', title: region ? `${countryName(country)} · ${region}` : countryName(country), meta: t('Lus sur Nager.Date') };
}

export const PUBLISH_INFO = tx('Votre agenda (sans les agendas abonnés) à une adresse secrète au format iCalendar, en lecture seule : collez-la dans Google Agenda (Autres agendas, « À partir de l’URL »), Apple Calendrier ou Thunderbird pour y voir vos événements. Qui a l’adresse voit vos événements : « Nouvelle adresse » invalide l’ancienne.');

/** « Publication »: one's events at a secret address, or not served at all. */
export function publishLine(settings: ServerSettings): StatusLine {
  return settings.calendar.publishPath ? { tone: 'ok', title: t('Agenda publié'), meta: t('À une adresse secrète, en lecture seule') } : { tone: 'off', title: t('Agenda non publié'), meta: t('Publiez votre agenda pour vous y abonner ailleurs.') };
}

export const ASK_INFO = tx('« Demander à Claude » dans Agenda : vos événements de trois mois en arrière à un an devant, et les anniversaires de vos contacts, sont envoyés à Claude avec la question. Désactivé, rien de votre agenda n’est envoyé.');

/** « Questions sur l'agenda »: on, off, or waiting for Claude's key. */
export function askLine(settings: ServerSettings): StatusLine {
  if (!settings.analysis.enabled) return { tone: 'off', title: t('Sans clé Claude'), meta: t('Ajoutez une clé Claude pour poser des questions sur votre agenda.') };
  return settings.calendar.ask ? { tone: 'ok', title: t('Questions activées'), meta: t('Claude lit vos événements quand vous lui posez une question.') } : { tone: 'off', title: t('Questions désactivées'), meta: t('Rien de votre agenda n’est envoyé à Claude.') };
}
