import type { AdminStatus } from '../../sync/admin';
import type { ServerSettings } from '../../sync/settings';
import { connectFailureField, connectFailureMessage, setupChecklistShown, setupForward, setupSteps, setupTaskForward, setupTaskLine, setupTasks } from '../setup';

const UNSET: ServerSettings = {
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30 },
  drive: { provider: null, url: '', folder: '/Carnet', library: null, tokenHint: null, leaving: false },
  seerr: { url: '', keyHint: null },
};

const status = (restore: Partial<AdminStatus['restore']> = {}): AdminStatus => ({
  server: { version: '0.1.0', notes: 0, pages: 0, files: 0, fileBytes: 0 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, ...restore },
});

describe('the first run', () => {
  it('is two steps, and three only for the device that sets a new server up', () => {
    expect(setupSteps(false, true)).toEqual(['server', 'appearance']);
    expect(setupSteps(true, false)).toEqual(['server', 'appearance']);
    expect(setupSteps(true, true)).toEqual(['server', 'appearance', 'checklist']);
    // A server that held nothing (or not known yet) is set up here; one already in use is joined.
    expect(setupChecklistShown(true, true)).toBe(true);
    expect(setupChecklistShown(true, null)).toBe(true);
    expect(setupChecklistShown(true, false)).toBe(false);
    expect(setupChecklistShown(false, true)).toBe(false);
  });

  it('skips a step left as it was, goes on once changed, and starts the app on the last step', () => {
    expect(setupForward(false, false)).toBe('Passer');
    expect(setupForward(true, false)).toBe('Continuer');
    expect(setupForward(false, true)).toBe('Commencer');
    expect(setupTaskForward(false)).toBe('Plus tard');
    expect(setupTaskForward(true)).toBe('Continuer');
  });

  it('lists a backup to bring back first, only on a server that held nothing, then Claude, S3, Seafile and Seerr', () => {
    expect(setupTasks(true)).toEqual(['restore', 'reading', 'backup', 'drive', 'seerr']);
    expect(setupTasks(false)).toEqual(['reading', 'backup', 'drive', 'seerr']);
  });

  it('says what each row holds now, or what it would do', () => {
    expect(setupTaskLine('reading', UNSET, null)).toMatchObject({ title: 'Lecture des liens par Claude', tone: 'off' });
    const set: ServerSettings = {
      ...UNSET,
      analysis: { ...UNSET.analysis, enabled: true },
      backup: { ...UNSET.backup, configured: true, bucket: 'sauvegardes', prefix: 'carnet/', recurrence: 'daily' },
      drive: { ...UNSET.drive, provider: 'seafile', library: 'Maison' },
      seerr: { url: 'https://seerr.example.org', keyHint: '…7d1e' },
    };
    expect(setupTaskLine('reading', set, null)).toMatchObject({ tone: 'ok', meta: 'Lus par Claude Opus 5.5' });
    expect(setupTaskLine('backup', set, null)).toMatchObject({ tone: 'ok', meta: 'sauvegardes/carnet · chaque jour' });
    expect(setupTaskLine('drive', set, null)).toMatchObject({ tone: 'ok', meta: 'Seafile « Maison », /Carnet' });
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
});
