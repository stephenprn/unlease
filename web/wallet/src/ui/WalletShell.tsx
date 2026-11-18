/**
 * Wallet's places as the shell draws them, and its frame: the navigation (« Cartes », « Identité »,
 * « Documents »; Réglages and the Administration are the shell's), what the place on screen makes
 * beside the search and as the pebble at the foot of a phone-sized window (a card, a paper, a
 * document), an item and its form over the place they were opened from, the tab's title.
 */
import { useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { ItemKind } from '@unlease/wallet/models/item';
import { kindName } from '@unlease/wallet/services/words';
import type { GlyphName } from '@unlease/design/glyphs';

import { Icon } from '@shared/ui/components/Icon';
import { useLeaving, usePresence } from '@shared/ui/components/presence';
import { NavAction, NavGlyph, NavRow } from '@shared/ui/navigation/NavParts';
import shell from '@shared/ui/navigation/shell.module.css';
import { goBack, parseRoute, type Arrival, type Route } from '@shared/ui/router';
import { useWalletStore } from '../app/store/library';
import { lockVault, useVaultStore } from '../app/store/vault';
import { ItemEditor } from './features/ItemEditor';
import { ItemView } from './features/ItemView';
import { openNew } from './features/open';
import { HOME, isWalletPlace, paths } from './routes';
import { CardsScreen } from './screens/CardsScreen';
import { DocumentsScreen } from './screens/DocumentsScreen';
import { PapersScreen } from './screens/PapersScreen';

export function WalletScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'walletPapers':
      return <PapersScreen />;
    case 'walletDocuments':
      return <DocumentsScreen />;
    case 'wallet':
      return <CardsScreen />;
    default:
      return null;
  }
}

/** An item and its form lie over the page they were opened from, else over its place. */
export function walletPageUnder(route: Route, background: string | undefined): Route | null {
  if (route.name !== 'walletItem' && route.name !== 'walletEdit' && route.name !== 'walletNew') return null;
  if (background) return parseRoute(new URL(background, location.origin).pathname);
  if (route.name === 'walletNew') return route.kind === 'document' ? { name: 'walletDocuments' } : ['card', 'giftCard', 'emergency'].includes(route.kind) ? { name: 'wallet' } : { name: 'walletPapers' };
  return { name: 'wallet' };
}

export function walletPathOf(route: Route): string {
  switch (route.name) {
    case 'walletPapers':
      return paths.papers;
    case 'walletDocuments':
      return paths.documents;
    case 'walletItem':
      return paths.item(route.id);
    case 'walletEdit':
      return paths.edit(route.id);
    case 'walletNew':
      return paths.create(route.kind);
    default:
      return HOME;
  }
}

export { isWalletPlace };

/** The tab names the place, never what an item holds (a tab's title shows in the history and the task switcher). */
export function useWalletTitle(page: Route, overlay: Route): string | null {
  if (overlay.name === 'walletNew') return kindName(overlay.kind);
  switch (page.name) {
    case 'walletPapers':
      return t('Identity papers');
    case 'walletDocuments':
      return t('Documents');
    default:
      return null;
  }
}

export function walletStillThere(route: Route): boolean {
  if (route.name !== 'walletItem' && route.name !== 'walletEdit') return true;
  const item = useWalletStore.getState().items[route.id];
  return item !== undefined && item.deletedAt === null;
}

const PLACES: readonly { readonly name: Route['name']; readonly to: string; readonly label: () => string; readonly glyph: GlyphName }[] = [
  { name: 'wallet', to: HOME, label: () => t('Cards'), glyph: 'card' },
  { name: 'walletPapers', to: paths.papers, label: () => t('Identity'), glyph: 'idCard' },
  { name: 'walletDocuments', to: paths.documents, label: () => t('Documents'), glyph: 'file' },
];

export function WalletNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const open = useVaultStore(s => s.open !== null);
  return (
    <>
      {PLACES.map(place => (
        <NavRow key={place.name} to={place.to} label={place.label()} leading={<NavGlyph name={place.glyph} />} current={route.name === place.name} onNavigate={onNavigate} />
      ))}
      {/* The papers open: shut them at once, without looking for Réglages. */}
      {open ? (
        <NavAction
          label={t('Lock now')}
          icon="lock"
          onClick={() => {
            lockVault();
            onNavigate();
          }}
        />
      ) : null}
    </>
  );
}

/** What the place on screen makes. */
function makerOf(route: Route): { readonly label: string; readonly kind: ItemKind } | null {
  switch (route.name) {
    case 'wallet':
      return { label: t('Add a card'), kind: 'card' };
    case 'walletPapers':
      return { label: t('Add a paper'), kind: 'idCard' };
    case 'walletDocuments':
      return { label: t('Add a document'), kind: 'document' };
    default:
      return null;
  }
}

export function WalletHeaderActions({ route }: { route: Route }) {
  const maker = makerOf(route);
  if (!maker) return null;
  return (
    <button type="button" className={`${shell.classify} paper`} onClick={() => openNew(maker.kind)} aria-label={maker.label} data-tip={maker.label}>
      <Icon name="plus" size={20} />
      <span className={shell.classifyLabel}>{maker.label}</span>
    </button>
  );
}

const BAR_EXIT_MS = 200;

export function WalletBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const maker = makerOf(route);
  const { present, closing, done } = usePresence(maker !== null && isWalletPlace(route), BAR_EXIT_MS);
  const [arrival] = useState(enter);
  const [kept, setKept] = useState(maker);
  if (maker && maker.label !== kept?.label) setKept(maker);
  const shown = maker ?? kept;
  if (!present || !shown) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button type="button" className={shell.fab} data-pebble-under={0} aria-label={shown.label} onClick={() => openNew(shown.kind)}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

const EXIT_MS = 340;
const NEW = '\u0000new';

export function WalletOverlays({ route, pagePath }: { route: Route; pagePath: string }) {
  const viewed = useLeaving(route.name === 'walletItem' ? route.id : null, EXIT_MS);
  const edited = useLeaving(route.name === 'walletEdit' ? route.id : route.name === 'walletNew' ? `${NEW}${route.kind}` : null, EXIT_MS);
  const close = (): void => goBack(pagePath);
  const newKind = edited.value?.startsWith(NEW) ? (edited.value.slice(NEW.length) as ItemKind) : null;
  return (
    <>
      {viewed.value !== null ? <ItemView key={viewed.value} id={viewed.value} closing={viewed.leaving} onClose={close} /> : null}
      {edited.value !== null ? <ItemEditor key={edited.value} id={newKind ? null : edited.value} kind={newKind} closing={edited.leaving} under={pagePath} onClose={close} /> : null}
    </>
  );
}
