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
        title={t('Battery set to “Restricted”')}
        supporting={
          appRings()
            ? t('Android stops sync and holds back notifications while the app is closed: tap here, then under “Battery”, choose “Optimized” or “Unrestricted”.')
            : t('Android stops sync while the app is closed: tap here, then under “Battery”, choose “Optimized” or “Unrestricted”.')
        }
        onPress={() => fixBackgroundProblem(problem)}
      />
    );
  }
  return (
    <ListRow
      icon="cloudOff"
      title={t('Data Saver')}
      supporting={t('On mobile data, Android stops sync while the app is closed: tap here and allow unrestricted data usage.')}
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
    <Section title={t('Background sync')}>
      {problems.map(problem => (
        <ProblemRow key={problem.kind} problem={problem} />
      ))}
    </Section>
  );
}
