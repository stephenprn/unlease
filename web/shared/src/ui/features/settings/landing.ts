/**
 * Réglages opened at one of its sections (`#import`, `#ground` from a search or the spotlight): the
 * section lands in view, from the page itself too (the spotlight over Réglages). An address of a
 * section that has moved to another page of Réglages (`/notes/settings#colors`, from before the look
 * had a page of its own) goes on to that page, at that section.
 */
import { useEffect } from 'react';

import { settingsPageOf, type SettingsPage } from '@unlease/core/services/settingsSearch';

import { decodePart, navigate, settingsPath, useLocation } from '../../router';

/** On one page of Réglages (`page`: null for the overview), the section the address names. */
export function useSectionLanding(page: SettingsPage | null): void {
  const { hash } = useLocation();
  const section = hash ? decodePart(hash.slice(1)) : null;
  const elsewhere = section !== null && settingsPageOf(section) !== page;
  useEffect(() => {
    if (section === null) return;
    if (elsewhere) navigate(settingsPath(section), { replace: true });
    else document.getElementById(section)?.scrollIntoView?.({ block: 'start' });
  }, [section, elsewhere]);
}
