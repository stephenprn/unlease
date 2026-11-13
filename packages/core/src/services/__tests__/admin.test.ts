import { afterEach, describe, expect, it } from 'vitest';

import { setLocale } from '../../i18n';
import type { AdminStatus } from '../../sync/admin';
import type { ServerSettings } from '../../sync/settings';
import { appsLine, claudeLine, isSharedAdminSection, serverLine, SHARED_ADMIN_SECTIONS, SHARED_ADMIN_TITLES } from '../admin';

const ANALYSIS: ServerSettings['analysis'] = { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-sonnet-5-5', budgetUsd: 15 };

const STATUS: AdminStatus = {
  server: { version: '0.2.0', notes: 12, pages: 3, contacts: 0, events: 0, files: 2, fileBytes: 2_048 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 2, bytes: 2_048, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false },
};

describe('the Administration’s sections', () => {
  afterEach(() => setLocale('fr'));

  it('are addressed by ids that never change, Claude’s titled with its name in every language', () => {
    expect(SHARED_ADMIN_SECTIONS).toEqual(['apps', 'server', 'reading', 'backup', 'drive', 'immich']);
    expect(isSharedAdminSection('reading')).toBe(true);
    expect(isSharedAdminSection('seerr')).toBe(false);
    setLocale('en');
    expect(SHARED_ADMIN_TITLES.reading).toBe('Claude');
    expect(SHARED_ADMIN_TITLES.backup).toBe('Backup to S3');
  });

  it('say their state in one line', () => {
    expect(appsLine({ apps: { enabled: ['notes', 'pages'] } } as unknown as ServerSettings)).toMatchObject({ tone: 'ok', title: 'Carnet · Pages' });
    expect(appsLine(null).tone).toBe('off');
    expect(serverLine(null, null)).toMatchObject({ tone: 'off', title: 'Aucun serveur relié' });
    expect(serverLine('https://unlease.example.org/', null)).toMatchObject({ tone: 'waiting', title: 'unlease.example.org' });
    expect(serverLine('https://unlease.example.org', STATUS).meta).toMatch(/^Version 0\.2\.0 · 12\snotes/);
    expect(claudeLine({ ...ANALYSIS, enabled: false }).tone).toBe('off');
    expect(claudeLine(ANALYSIS)).toMatchObject({ tone: 'ok', title: 'Clé …k3Xq · Sonnet 5.5' });
    expect(claudeLine(ANALYSIS).meta).toMatch(/^Budget de 15,00\s\$ par mois$/);
  });
});
