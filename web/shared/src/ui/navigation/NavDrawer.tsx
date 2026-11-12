/**
 * The app's places (Carnet's notes, reminders, collections and labels; Pages' home and tree), and
 * at the foot its archive and bin, then the shell's Réglages and Administration. In the
 * Administration, its sections instead (`AdminNav`).
 *
 * Docked on the wall beside the page on wide screens; a paper sheet drawn from the menu button on
 * narrower ones, its brand the app's (its mark and its name, a link to its home), the launcher beside it.
 */
import { t } from '@unlease/core/i18n';

import { useAppOff } from '../../app/apps';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '../../app/store/ui';
import { theApp } from '../../modules';
import { Layer } from '../components/Layer';
import { useScrollEdges } from '../components/scrollEdges';
import { ADMIN_GLYPH, paths, type Route } from '../router';
import { AdminNav } from '../features/admin/AdminNav';
import { AppBrand, AppLauncher } from './AppBrand';
import { NavGlyph, NavRow } from './NavParts';
import styles from './nav.module.css';

export interface NavListProps {
  readonly route: Route;
  /** A row was chosen: the drawer closes. */
  readonly onNavigate?: () => void;
}

export function NavList({ route, onNavigate }: NavListProps) {
  const module = theApp();
  const go = (): void => {
    module.onPageChange?.();
    onNavigate?.();
  };
  // The Administration draws its own sections; an app the server turned off has no places to offer.
  const admin = route.name === 'admin';
  const off = useAppOff();
  const Nav = off ? undefined : module.Nav;
  const Foot = admin || off ? undefined : module.NavFoot;
  // Its rows fade and blur under the header (or the drawer's brand) and the foot, as the page's content does.
  const edges = useScrollEdges({ top: true });
  // A page of Réglages the app's own row marks (Agenda's import): one row chosen, never two.
  const settings = route.name === 'settings' && !(Foot && route.page !== null && module.navMarks?.includes(route.page));
  return (
    <nav className={styles.nav} aria-label={t('Navigation')}>
      <div key={admin ? 'admin' : 'app'} ref={edges} className={styles.navMain}>
        {admin ? <AdminNav route={route} onNavigate={go} /> : Nav ? <Nav route={route} onNavigate={go} /> : null}
      </div>
      <div className={styles.navFoot}>
        {Foot ? <Foot route={route} onNavigate={go} /> : null}
        <NavRow to={paths.settings} label={t('Réglages')} leading={<NavGlyph name="settings" />} current={settings && route.page === null} within={settings && route.page !== null} onNavigate={go} />
        <NavRow to={paths.admin} label={t('Administration')} leading={<NavGlyph name={ADMIN_GLYPH} />} current={admin && route.section === null} within={admin && route.section !== null} onNavigate={go} />
      </div>
    </nav>
  );
}

/** The narrower screens' drawer: a sheet torn off on its right side, its brand the app's. */
export function NavDrawer({ route }: { route: Route }) {
  const open = useUiStore(selectDrawerOpen);
  const close = (): void => setDrawerOpen(false);
  return (
    <Layer open={open} onDismiss={close} kind="start" label={t('Navigation')}>
      <div className={styles.drawerBrand}>
        <div className={styles.drawerBrandLink} onClickCapture={close}>
          <AppBrand size={40} large />
        </div>
        <AppLauncher />
      </div>
      <div className={styles.drawerScroll}>
        <NavList route={route} onNavigate={close} />
      </div>
    </Layer>
  );
}
