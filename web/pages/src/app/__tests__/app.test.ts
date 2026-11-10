import { describe, expect, it } from 'vitest';

import { syncedTypes } from '@shared/app/apps';
import { getDeviceName, getStorageName, setAppStorage, setStorageName } from '@shared/app/env';
import { loadSettings, useSettingsStore } from '@shared/app/store/settings';
import { pathOfRef } from '@shared/modules';
import { ownsPath } from '@shared/ui/router';

/** Pages' web app: its own places, its records and Carnet's (which it shows), Carnet's places in Carnet's web app. */
describe('Pages’ web app', () => {
  it('pulls its records, Carnet’s and Contacts’, which its embeds and mentions show', () => {
    expect(syncedTypes()).toEqual(['attachment', 'block', 'calendarEvent', 'calendarFeed', 'calendarLabel', 'check', 'contact', 'contactLabel', 'label', 'link', 'linkTemplate', 'note']);
  });

  it('keeps its own database and keys, beside the device’s settings every app shares', () => {
    expect(getStorageName()).toBe('pages');
    expect(getDeviceName()).toBe('unlease');
  });

  it('reads the settings Carnet’s web app kept before the suite had its own apps, until the suite’s are written', () => {
    setStorageName('unlease');
    setAppStorage('pages');
    try {
      localStorage.setItem('carnet.settings', JSON.stringify({ onboarded: true, server: { url: 'https://example.org', token: 'jeton' } }));
      loadSettings();
      expect(useSettingsStore.getState().server?.url).toBe('https://example.org');
      expect(useSettingsStore.getState().onboarded).toBe(true);
      localStorage.setItem('unlease.settings', JSON.stringify({ onboarded: false }));
      loadSettings();
      expect(useSettingsStore.getState().server).toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it('owns the places under /pages, and leaves Carnet’s to Carnet’s web app', () => {
    expect(ownsPath('/pages')).toBe(true);
    expect(ownsPath('/pages/0192-page?x=1')).toBe(true);
    expect(ownsPath('/pages/settings')).toBe(true);
    expect(ownsPath('/notes/note/n1')).toBe(false);
    expect(pathOfRef('page', 'p1')).toBe('/pages/p1');
    expect(pathOfRef('note', 'n1')).toBe('/notes/note/n1');
    expect(pathOfRef('link', 'l1')).toBe('/notes/link/l1');
    expect(pathOfRef('contact', 'c1')).toBe('/contacts/contact/c1');
    expect(pathOfRef('event', 'e1')).toBe('/agenda/event/e1');
    expect(pathOfRef('meeting', 'm1')).toBeNull();
  });
});
