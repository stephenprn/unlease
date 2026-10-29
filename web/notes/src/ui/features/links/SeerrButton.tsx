/** "Seerr": the film or series in the server's Seerr, its state in a word once known; until then (or if Seerr does not answer) Seerr's own search. */
import { useEffect, useState } from 'react';

import { MODULE_ICONS, MODULE_NAMES } from '@unlease/notes/models/modules';
import type { LinkItem } from '@unlease/notes/models/entities';
import { seerrSearchUrl } from '@unlease/notes/services/modules';
import { SEERR_STATUS_WORDS } from '@unlease/notes/services/works';
import type { SeerrResponse } from '@unlease/notes/sync/seerr';

import { lookUpSeerr } from '../../../app/modules';
import { selectSeerrUrl, useSettingsStore } from '../../../app/store/settings';
import { Button } from '../../components/Button';

export function SeerrButton({ link }: { link: LinkItem }) {
  const base = useSettingsStore(selectSeerrUrl);
  // An answer is the search's that made it: once a reading renames the title, the old one no longer shows.
  const asked = `${link.id}\n${link.title}`;
  const [answered, setAnswered] = useState<{ readonly asked: string; readonly answer: SeerrResponse } | null>(null);
  const found = answered?.asked === asked ? answered.answer : null;
  useEffect(() => {
    let live = true;
    lookUpSeerr(link.id).then(
      answer => {
        if (live) setAnswered({ asked, answer });
      },
      () => {
        // Seerr unreachable from the server: its search still opens.
      },
    );
    return () => {
      live = false;
    };
  }, [link.id, asked]);
  const url = found?.url ?? seerrSearchUrl(base, link);
  if (!url) return null;
  return (
    <Button kind="tonal" small icon={MODULE_ICONS.seerr} href={url}>
      {found?.status ? `${MODULE_NAMES.seerr} · ${SEERR_STATUS_WORDS[found.status]}` : MODULE_NAMES.seerr}
    </Button>
  );
}
