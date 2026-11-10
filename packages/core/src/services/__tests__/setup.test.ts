import type { AdminStatus } from '../../sync/admin';
import type { ServerSettings } from '../../sync/settings';
import { appOffWords, connectFailureField, connectFailureMessage, serviceRefusalField, setupAppChoices, setupForward, setupServerShown, setupSteps, setupTaskForward, setupTaskLine, setupTasks, setupTaskWords, toggleSetupApp } from '../setup';

const UNSET: ServerSettings = {
  apps: { enabled: ['notes', 'pages'] },
  setup: { done: false },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' },
  drive: { provider: null, url: '', folder: '/Unlease', library: null, tokenHint: null, leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
};

const status = (restore: Partial<AdminStatus['restore']> = {}): AdminStatus => ({
  server: { version: '0.1.0', notes: 0, pages: 0, contacts: 0, events: 0, files: 0, fileBytes: 0 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false, ...restore },
});

describe('the first run', () => {
  it('stops calling the server empty once a backup came back', () => {
    expect(setupTaskWords('restore', status()).lead).toMatch(/^Votre serveur est vide/);
    const restored = status({ finishedAt: 2, report: { mode: 'merge', source: 'unlease-2026-11-03T16-19-58Z.tar.gz', records: 506, files: 16, missingFiles: 0, needDrive: 5, coldFiles: 0 } });
    expect(setupTaskWords('restore', restored).lead).toBe('Les données de la sauvegarde sont revenues sur ce serveur. Vous pouvez en restaurer une autre, ou continuer.');
    expect(setupTaskWords('drive', restored).lead).toMatch(/^Facultatif/);
  });


  it('is two steps, and four only for the device that sets the server up', () => {
    expect(setupSteps(false, true)).toEqual(['server', 'appearance']);
    expect(setupSteps(true, false)).toEqual(['server', 'appearance']);
    expect(setupSteps(true, true)).toEqual(['server', 'apps', 'checklist', 'appearance']);
    // A server not set up yet (or not known yet) is set up here, once; one already set up is joined.
    expect(setupServerShown(true, false)).toBe(true);
    expect(setupServerShown(true, null)).toBe(true);
    expect(setupServerShown(true, true)).toBe(false);
    expect(setupServerShown(false, false)).toBe(false);
  });

  it('offers every app of the suite, the announced ones not tickable, the device’s own locked on', () => {
    const choices = setupAppChoices(['notes', 'pages'], 'pages');
    expect(choices.map(choice => [choice.id, choice.checked, choice.soon, choice.locked])).toEqual([
      ['notes', true, false, false],
      ['pages', true, false, true],
      ['calendar', false, false, false],
      ['contacts', false, false, false],
    ]);
    expect(toggleSetupApp(['notes', 'pages'], 'notes', 'pages')).toEqual(['pages']);
    expect(toggleSetupApp(['pages'], 'notes', 'pages')).toEqual(['notes', 'pages']);
    // Never the device's own, never none.
    expect(toggleSetupApp(['notes', 'pages'], 'pages', 'pages')).toEqual(['notes', 'pages']);
    expect(toggleSetupApp(['notes'], 'calendar', null)).toEqual(['notes', 'calendar']);
    expect(toggleSetupApp(['notes'], 'notes', null)).toEqual(['notes']);
    expect(appOffWords('notes').action).toBe('Activer Carnet');
  });

  it('keeps the appearance left as it came, goes on once changed, and starts the app on the last step', () => {
    // Nothing is skipped on the appearance step: left as it came, it is kept.
    expect(setupForward('appearance', false, false)).toBe('Garder l’apparence d’origine');
    expect(setupForward('appearance', true, false)).toBe('Continuer');
    expect(setupForward('appearance', false, true)).toBe('Commencer');
    expect(setupForward('checklist', true, true)).toBe('Commencer');
    expect(setupTaskForward(false)).toBe('Plus tard');
    expect(setupTaskForward(true)).toBe('Continuer');
  });

  it('lists a backup to bring back first, only on a server that held nothing, then what the apps on use', () => {
    expect(setupTasks(true, ['notes', 'pages'])).toEqual(['restore', 'reading', 'backup', 'drive', 'seerr']);
    expect(setupTasks(false, ['notes'])).toEqual(['reading', 'backup', 'drive', 'seerr']);
    // Seerr serves Carnet's films and series only.
    expect(setupTasks(false, ['pages'])).toEqual(['reading', 'backup', 'drive']);
  });

  it('says what each row holds now, or what it would do', () => {
    expect(setupTaskLine('reading', UNSET, null)).toMatchObject({ title: 'Claude', tone: 'off' });
    const set: ServerSettings = {
      ...UNSET,
      analysis: { ...UNSET.analysis, enabled: true },
      backup: { ...UNSET.backup, configured: true, bucket: 'sauvegardes', prefix: 'unlease/', recurrence: 'daily' },
      drive: { ...UNSET.drive, provider: 'seafile', library: 'Maison' },
      seerr: { url: 'https://seerr.example.org', keyHint: '…7d1e' },
    };
    expect(setupTaskLine('reading', set, null)).toMatchObject({ tone: 'ok', meta: 'Claude Opus 5.5, pour toutes les applications' });
    expect(setupTaskLine('backup', set, null)).toMatchObject({ tone: 'ok', meta: 'sauvegardes/unlease · chaque jour' });
    expect(setupTaskLine('drive', set, null)).toMatchObject({ tone: 'ok', meta: 'Seafile « Maison », /Unlease' });
    expect(setupTaskLine('seerr', set, null)).toMatchObject({ tone: 'ok', meta: 'seerr.example.org' });
    expect(setupTaskLine('restore', UNSET, status({ running: true }))).toMatchObject({ tone: 'waiting', meta: 'Restauration en cours…' });
    expect(setupTaskLine('restore', UNSET, status())).toMatchObject({ tone: 'off' });
  });

  it('points a failed connection at the field to fix, with what to check when nothing answered', () => {
    expect(connectFailureField('unauthorized', 401)).toBe('token');
    expect(connectFailureField('http', 429)).toBe('token');
    expect(connectFailureField('network', null)).toBe('address');
    expect(connectFailureField('protocol', null)).toBe('address');
    expect(connectFailureMessage('network', 'Serveur injoignable')).toBe('Serveur injoignable : vérifiez l’adresse, et que le serveur est en marche.');
    expect(connectFailureMessage('unauthorized', 'Jeton refusé par le serveur')).toBe('Jeton refusé par le serveur');
  });

  it('puts a service’s refusal under the field it concerns, else on the whole form', () => {
    expect(serviceRefusalField('Seerr injoignable')).toBe('address');
    expect(serviceRefusalField('Cette adresse ne répond pas comme un serveur Seafile')).toBe('address');
    expect(serviceRefusalField('Bucket introuvable')).toBe('bucket');
    expect(serviceRefusalField('Mauvaise région pour ce bucket')).toBe('region');
    expect(serviceRefusalField('Jeton refusé par Seafile')).toBe('key');
    expect(serviceRefusalField('Clé API refusée par Seerr')).toBe('key');
    // Either S3 key may be the wrong one: the form says it.
    expect(serviceRefusalField('Clés refusées par S3')).toBeNull();
    expect(serviceRefusalField('S3 a répondu 500')).toBeNull();
  });
});
