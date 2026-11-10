/**
 * An event's place and its link, as the event shows them. The place opens in Google Maps or in
 * OpenStreetMap, as the person picks each time (a menu, with « Copier l'adresse »); the link is one
 * quiet row: the site's name, the rest of its address faint, opening in a new tab.
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { safeHref } from '@unlease/core/services/url';
import { linkParts } from '@unlease/calendar/services/links';
import { lineMapsUrl, MAP_APP_NAMES } from '@unlease/contacts/services/addresses';

import { showError, showSnack } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { copyText } from '@shared/ui/dom';
import styles from '../calendar.module.css';

const open = (url: string | null): void => {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

/** The place's words, a button opening its menu: Google Maps, OpenStreetMap, copy. */
export function PlaceButton({ place }: { place: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const items: MenuItem[] = [
    { label: t('Ouvrir dans {app}', { app: MAP_APP_NAMES.google }), icon: 'mapPin', onSelect: () => open(lineMapsUrl(place, 'google')) },
    { label: t('Ouvrir dans {app}', { app: MAP_APP_NAMES.openstreetmap }), icon: 'globe', onSelect: () => open(lineMapsUrl(place, 'openstreetmap')) },
    {
      label: t('Copier l’adresse'),
      icon: 'copy',
      separatorBefore: true,
      onSelect: () => void copyText(place).then(ok => (ok ? showSnack(t('Adresse copiée'), undefined, { tone: 'success' }) : showError(t('Le navigateur refuse de copier')))),
    },
  ];
  return (
    <>
      <button ref={anchor} type="button" className={styles.placeButton} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(true)}>
        <span className="t-body">{place}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <Menu open={menu} anchor={anchor} onDismiss={() => setMenu(false)} items={items} label={t('Ouvrir le lieu')} align="start" />
    </>
  );
}

/** An event's web link, on one quiet row. */
export function LinkRow({ url }: { url: string }) {
  const { host, rest } = linkParts(url);
  return (
    <a className={styles.linkRow} href={safeHref(url)} target="_blank" rel="noopener noreferrer" title={url}>
      <Icon name="link" size={18} />
      <span className={styles.linkHost}>{host}</span>
      {rest ? <span className={styles.linkRest}>{rest}</span> : null}
      <Icon name="external" size={16} />
    </a>
  );
}
