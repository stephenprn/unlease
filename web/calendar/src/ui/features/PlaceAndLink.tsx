/**
 * An event's place and its link, as the event shows them. The place opens in Google Maps or in
 * OpenStreetMap, as the person picks each time (a menu, with « Copier l'adresse »), unless it is a web
 * address (a video call), which opens as a link; the link is one quiet row: the site's name, the rest
 * of its address faint, opening in a new tab. A list row's « Y aller » (`DirectionsButton`): the way
 * there, in either, from the same kind of menu.
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { safeHref } from '@unlease/core/services/url';
import { linkParts, placeLink } from '@unlease/calendar/services/links';
import { lineDirectionsUrl, lineMapsUrl, MAP_APP_NAMES, OFFERED_MAP_APPS } from '@unlease/contacts/services/addresses';

import { showError, showSnack } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { copyText } from '@shared/ui/dom';
import styles from '../calendar.module.css';

const open = (url: string | null): void => {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

/** The place's words, a button opening its menu: Google Maps, OpenStreetMap, copy. A place that is a web address (a video call) is that link instead. */
export function PlaceButton({ place }: { place: string }) {
  const address = placeLink(place);
  return address ? <LinkRow url={address} /> : <MapsButton place={place} />;
}

/** « Copier l'adresse », the menus' last row. */
const copyItem = (place: string): MenuItem => ({
  label: t('Copy the address'),
  icon: 'copy',
  separatorBefore: true,
  onSelect: () => void copyText(place).then(ok => (ok ? showSnack(t('Address copied'), undefined, { tone: 'success' }) : showError(t('The browser won’t copy')))),
});

function MapsButton({ place }: { place: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const items: MenuItem[] = [
    { label: t('Open in {app}', { app: MAP_APP_NAMES.google }), icon: 'mapPin', onSelect: () => open(lineMapsUrl(place, 'google')) },
    { label: t('Open in {app}', { app: MAP_APP_NAMES.openstreetmap }), icon: 'globe', onSelect: () => open(lineMapsUrl(place, 'openstreetmap')) },
    copyItem(place),
  ];
  return (
    <>
      <button ref={anchor} type="button" className={styles.placeButton} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(true)}>
        <span className="t-body">{place}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <Menu open={menu} anchor={anchor} onDismiss={() => setMenu(false)} items={items} label={t('Open the place')} align="start" />
    </>
  );
}

/**
 * « Y aller » at a list row's end (`directionsTo`'s place): the `directions` glyph in the second ink on
 * its pebble, chosen while its menu is open: the way there in Google Maps or OpenStreetMap, or the
 * address copied.
 */
export function DirectionsButton({ place, compact = false, className }: { place: string; compact?: boolean; className?: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const label = t('Directions to {name}', { name: place });
  const items: MenuItem[] = [...OFFERED_MAP_APPS.map((app): MenuItem => ({ label: t('Directions in {maps}', { maps: MAP_APP_NAMES[app] }), icon: 'external', onSelect: () => open(lineDirectionsUrl(place, app)) })), copyItem(place)];
  return (
    <>
      <IconButton ref={anchor} icon="directions" label={label} compact={compact} shape={2} className={className} hasPopup="menu" expanded={menu} selected={menu} onClick={() => setMenu(true)} />
      <Menu open={menu} anchor={anchor} onDismiss={() => setMenu(false)} items={items} label={label} />
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
