/**
 * Every collection as a sheet pinned to the wall: its emblem, what Claude files there, how many
 * links wait in it and a glimpse of them. "Non classé" comes last; a dashed sheet makes a new one.
 */
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { pebbleTurn } from '@unlease/design/pebbles';
import { formatPrice, plural, totalPrice } from '@unlease/core/services/format';
import { INBOX_ID, shownHint, shownTitle } from '@unlease/notes/models/entities';

import { useLines } from '../../app/hooks/useLines';
import { useBlobUrl } from '../../app/media/images';
import { useLibraryStore } from '../../app/store/library';
import { setNewLineOpen } from '../../app/store/ui';
import { EmblemStone } from '../components/Emblem';
import { Icon } from '../components/Icon';
import { OutlineEdge } from '../components/Outline';
import styles from '../features/lines/lines.module.css';
import { TileSlot } from '../features/lines/TileSlot';
import { PageHead } from '../navigation/PageHead';
import { Link, paths } from '../router';
import { NARROW, useMedia } from '../useMedia';

const GLIMPSE = 3;

/** A kept picture, cropped to a pebble, each its neighbour's other turn. */
const Glimpse = memo(function Glimpse({ blobId, index }: { blobId: string; index: number }) {
  const url = useBlobUrl(blobId);
  return (
    <span className={styles.glimpse} data-pebble={pebbleTurn(index)} data-still>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : null}
    </span>
  );
});

const Tile = memo(function Tile({ id }: { id: string }) {
  const line = useLibraryStore(s => s.notes[id]);
  const { count, total, images } = useLibraryStore(
    useShallow(s => {
      const open = (s.linksByNote[id] ?? []).map(lid => s.links[lid]).filter(link => !!link && !link.done);
      const sum = totalPrice(open.map(link => ({ price: link!.price, currency: link!.currency })));
      const kept = open.map(link => link!.imageIds[0]).filter((blobId): blobId is string => !!blobId);
      return { count: open.length, total: sum ? formatPrice(sum.amount, sum.currency) : '', images: kept.slice(0, GLIMPSE).join(',') };
    }),
  );
  if (!line) return null;
  const inbox = id === INBOX_ID;
  return (
    // Its outline rides down from its slot: the router's Link takes no style of its own.
    <TileSlot>
      {d => (
        <Link to={paths.line(id)} className={`${styles.tile} paper`} ariaLabel={`${shownTitle(line)}, ${plural(count, 'lien')}`}>
          <EmblemStone id={id} emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={40} width={64} height={58} className={styles.tileMark} />
          <span className={`${styles.tileName} t-body-strong`}>{shownTitle(line)}</span>
          <span className={`${styles.tileHint} t-meta`}>
            {shownHint(line) || (inbox ? t('Ce que Claude ne sait pas où ranger.') : t('Ajoutez une phrase pour aider Claude à y ranger les bons liens.'))}
          </span>
          {images ? (
            <span className={styles.glimpses}>
              {images.split(',').map((blobId, index) => (
                <Glimpse key={blobId} blobId={blobId} index={index} />
              ))}
            </span>
          ) : null}
          <span className={`${styles.tileCount} t-meta-strong tabular`}>{[plural(count, 'lien'), total].filter(Boolean).join(' · ')}</span>
          <OutlineEdge d={d} />
        </Link>
      )}
    </TileSlot>
  );
});

export function LinesScreen() {
  const lines = useLines();
  // Wide, the dashed sheet ending the wall is the way to a new one; on a phone it lies far below the fold, so the top bar keeps its pebble (the phone app's).
  const narrow = useMedia(NARROW);
  return (
    <div className={styles.collections}>
      <PageHead title={t('Collections')} action={narrow ? { icon: 'plus', label: t('Nouvelle collection'), onClick: () => setNewLineOpen(true) } : undefined} />
      <p className={`${styles.intro} t-body`}>{t('Claude lit chaque lien que vous enregistrez et le range dans la collection qui lui correspond. La phrase de chaque collection l’aide à choisir.')}</p>
      <ul className={styles.tiles}>
        {lines.map(line => (
          <Tile key={line.id} id={line.id} />
        ))}
        {/* A card to come: a card's outline, dashed, as the tiles beside it. */}
        <TileSlot dashed>
          {d => (
            <button type="button" className={styles.newTile} onClick={() => setNewLineOpen(true)}>
              <Icon name="plus" size={28} />
              <span className="t-body-strong">{t('Nouvelle collection')}</span>
              <OutlineEdge d={d} />
            </button>
          )}
        </TileSlot>
      </ul>
    </div>
  );
}
