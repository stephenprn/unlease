/**
 * The app's brand and the suite's launcher. The brand: its mark (Carnet's card and leaf, Pages'
 * sheet and writing, `BrandMark`) and its name, a link to its home, at the header's start and at the
 * drawer's top. The launcher (as Google's): at the header's end (in the drawer on a phone-sized
 * window), a grid of the apps the server runs, each a web app of its own opened at its home, and the
 * announced ones greyed under « Bientôt disponible ». The Administration is at
 * the navigation's foot, under the Réglages. An announced app has no mark yet: its glyph on a grey
 * pebble (`SoonMark`).
 */
import { memo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import { APP_IDS, APPS, isReadyApp, READY_APPS, SUITE_NAME, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';
import type { GlyphName } from '@unlease/design/glyphs';

import { selectServerApps, useSettingsStore } from '../../app/store/settings';
import { appHome } from '../../app/suitePlaces';
import { theApp } from '../../modules';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { Popover } from '../components/Popover';
import { browserPath, isPlainClick, navigate } from '../router';
import styles from './apps.module.css';

/** The glyphs of the apps only announced. */
const SOON_GLYPHS: Readonly<Partial<Record<AppId, GlyphName>>> = { calendar: 'calendar' };

/** An announced app's mark: its glyph on a grey pebble. */
export const SoonMark = memo(function SoonMark({ app, size = 32 }: { app: AppId; size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true">
      <span className={styles.markStone} data-pebble={pebbleTurn(APP_IDS.indexOf(app))} data-still />
      <Icon name={SOON_GLYPHS[app] ?? 'grid'} size={Math.round(size * 0.6)} />
    </span>
  );
});

/** Any app's mark: its own when it has one, else the announced one's. */
export function AppMark({ app, size = 32 }: { app: AppId; size?: number }) {
  return APPS[app].status === 'ready' ? <BrandMark app={app} size={size} /> : <SoonMark app={app} size={size} />;
}

/** A link that goes through the router: this app's place in place, another app's page loaded whole. */
function follow(event: MouseEvent<HTMLAnchorElement>, to: string, onChosen: () => void): void {
  if (!isPlainClick(event)) return;
  event.preventDefault();
  onChosen();
  navigate(to);
}

/** The app's mark and its name, a link to its home. */
export function AppBrand({ size = 34, large = false }: { size?: number; large?: boolean }) {
  const app = theApp();
  const name = APPS[app.id].name;
  return (
    <a href={browserPath(app.home)} className={styles.brand} data-large={large || undefined} aria-label={t('{app}, accueil', { app: name })} onClick={event => follow(event, app.home, () => undefined)}>
      <BrandMark app={app.id} size={size} />
      <span className={large ? 't-display' : undefined}>{name}</span>
    </a>
  );
}

/** The apps the server runs, as last heard; every ready one until it says (or without a server). */
function useAppsOn(): readonly AppId[] {
  const on = useSettingsStore(selectServerApps);
  return on ? READY_APPS.filter(id => on.includes(id)) : READY_APPS;
}

/** One tile of the launcher: what it opens, its mark over its name. */
function Tile({ to, name, current, onChosen, children }: { to: string; name: string; current: boolean; onChosen: () => void; children: ReactNode }) {
  return (
    <a href={browserPath(to)} className={styles.tile} aria-current={current ? 'true' : undefined} onClick={event => follow(event, to, onChosen)}>
      {children}
      <span className={styles.tileName}>{name}</span>
    </a>
  );
}

/** The launcher: the apps the server runs as a grid of tiles, each opening its own web app at its home; the announced ones greyed. */
export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const on = useAppsOn();
  const app = theApp().id;
  const soon = APP_IDS.filter((id): boolean => !isReadyApp(id));
  const label = t('Applications {suite}', { suite: SUITE_NAME });
  const close = (): void => setOpen(false);
  // As many columns as the longer row has tiles, up to three: no empty column at its end.
  const columns = { '--columns': Math.min(3, Math.max(on.length, soon.length)) } as CSSProperties;
  return (
    <>
      <IconButton ref={anchor} icon="apps" label={label} hasPopup="dialog" expanded={open} onClick={() => setOpen(true)} />
      <Popover open={open} anchor={anchor} onDismiss={close} label={label} align="end" className={styles.launcher}>
        <ul className={styles.tiles} style={columns} aria-label={t('Applications')}>
          {on.map(id => (
            <li key={id}>
              <Tile to={appHome(id)} name={APPS[id].name} current={id === app} onChosen={close}>
                <BrandMark app={id} size={44} />
              </Tile>
            </li>
          ))}
        </ul>
        {soon.length > 0 ? (
          <>
            <p className={`${styles.soonHead} t-meta-strong`}>{t('Bientôt disponible')}</p>
            <ul className={styles.tiles} style={columns} aria-label={t('Bientôt disponible')}>
              {soon.map(id => (
                <li key={id} className={styles.tile} aria-disabled="true">
                  <SoonMark app={id} size={44} />
                  <span className={styles.tileName}>{APPS[id].name}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Popover>
    </>
  );
}
