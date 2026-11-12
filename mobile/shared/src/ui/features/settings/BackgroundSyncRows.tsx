/**
 * What Android holds back of the sync with the app closed, each row opening the page that fixes it
 * (`useBackgroundHealth`): in Réglages as « Synchronisation en arrière-plan », and in the
 * Administration's « Serveur » under the sync's state. Nothing while nothing holds it back, or
 * without a server. In an app that rings, the battery's row says the notifications are held too
 * (« Notifications à l’heure » then leaves it out).
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { backgroundProblems, fixBackgroundProblem, useBackgroundHealth, type BackgroundProblem } from '@shared/app/hooks/useBackgroundHealth';
import { appRings } from '@shared/platform/reminders';

import { ListRow } from '../../components';
import { Section } from './Section';

function ProblemRow({ problem }: { readonly problem: BackgroundProblem }) {
  if (problem.kind === 'restricted') {
    return (
      <ListRow
        icon="alert"
        title={t('Batterie « Restreinte »')}
        supporting={
          appRings()
            ? t('Android empêche la synchronisation et retient les notifications tant que l’application est fermée : touchez ici, puis dans « Batterie », choisissez « Optimisée » ou « Sans restriction ».')
            : t('Android empêche la synchronisation tant que l’application est fermée : touchez ici, puis dans « Batterie », choisissez « Optimisée » ou « Sans restriction ».')
        }
        onPress={() => fixBackgroundProblem(problem)}
      />
    );
  }
  return (
    <ListRow
      icon="cloudOff"
      title={t('Économiseur de données')}
      supporting={t('Sur les données mobiles, Android empêche la synchronisation tant que l’application est fermée : touchez ici et autorisez l’utilisation des données sans restriction.')}
      onPress={() => fixBackgroundProblem(problem)}
    />
  );
}

/** The rows alone, for a section that has its own head (the Administration's « Serveur »). */
export function BackgroundSyncRows(): React.ReactElement | null {
  const problems = backgroundProblems(useBackgroundHealth());
  if (problems.length === 0) return null;
  return (
    <>
      {problems.map(problem => (
        <ProblemRow key={problem.kind} problem={problem} />
      ))}
    </>
  );
}

/** Réglages' « Synchronisation en arrière-plan », shown only while something holds it back. */
export function BackgroundSyncSection(): React.ReactElement | null {
  const problems = backgroundProblems(useBackgroundHealth());
  if (problems.length === 0) return null;
  return (
    <Section title={t('Synchronisation en arrière-plan')}>
      {problems.map(problem => (
        <ProblemRow key={problem.kind} problem={problem} />
      ))}
    </Section>
  );
}
