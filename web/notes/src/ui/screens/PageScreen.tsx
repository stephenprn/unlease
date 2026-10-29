/**
 * One page of the knowledge base (web only, for now). On a phone-sized window its title also
 * heads the phone's top bar, as every page's does, but only once the page's own title has gone up
 * under the bar; the page's menu is the bar's action there.
 */
import { useContext, useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { isInBin } from '@unlease/notes/services/blocks';
import { isPrivatePage } from '@unlease/notes/services/pagesAsk';

import { closePagesAsk, openPagesAsk, usePagesAskSettings, usePagesAskStore } from '../../app/pagesAsk';
import { useLibraryStore } from '../../app/store/library';
import { WithPageAsk } from '../features/pages/AskPanel';
import { PageMenu } from '../features/pages/PageMenu';
import { PageView } from '../features/pages/PageView';
import { APP_HEADER_ID } from '../navigation/Header';
import { PageHead, PageHeadSlot } from '../navigation/PageHead';
import { NotFound } from './NotFound';

/** Whether the page's title (`data-page-title`) has scrolled up under the top bar. */
function useTitleUnderBar(active: boolean, id: string): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    if (!active || typeof IntersectionObserver === 'undefined') return;
    const title = document.querySelector('[data-page-title]');
    if (!title) return;
    const bar = document.getElementById(APP_HEADER_ID)?.getBoundingClientRect().bottom ?? 0;
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (entry) setUnder(!entry.isIntersecting && entry.boundingClientRect.top < bar);
      },
      { rootMargin: `${-Math.round(bar)}px 0px 0px 0px` },
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, [active, id]);
  return active && under;
}

export function PageScreen({ id }: { id: string }) {
  const exists = useLibraryStore(s => s.blocks[id]?.kind === 'page' && s.blocks[id]?.deletedAt === null);
  const title = useLibraryStore(s => s.blocks[id]?.text.trim() || t(UNTITLED_PAGE));
  const binned = useLibraryStore(s => isInBin(s.blocks, id));
  const slot = useContext(PageHeadSlot);
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const titleUnder = useTitleUnderBar(slot !== null && exists, id);
  const ask = usePagesAskSettings() !== null;
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, id));
  const asking = usePagesAskStore(s => s.open === id);
  if (!exists) return <NotFound what={t('Cette page n’existe plus.')} />;
  // A page in the bin keeps its banner's actions only.
  const withMenu = slot !== null && !binned;
  return (
    <>
      {slot ? (
        <PageHead
          title={title}
          titleShown={titleUnder}
          extra={withMenu && ask && !kept ? { icon: 'sparkle', label: t('Demander à Claude'), pressed: asking, onClick: () => (asking ? closePagesAsk() : openPagesAsk(id)) } : undefined}
          action={withMenu ? { icon: 'more', label: t('Plus d’actions'), onClick: () => setMenu(true), menu: { anchor: more, open: menu } } : undefined}
        />
      ) : null}
      <WithPageAsk>
        <PageView id={id} menu={slot === null} />
      </WithPageAsk>
      {withMenu ? <PageMenu id={id} open={menu} anchor={more} onDismiss={() => setMenu(false)} /> : null}
    </>
  );
}
