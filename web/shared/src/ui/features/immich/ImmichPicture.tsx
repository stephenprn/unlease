/**
 * A picture from Immich, through the server (`useImmichPicture`): a photo's at a size, or a person's
 * face. A quiet ground while it loads; the image glyph where it could not be had (Immich unreachable,
 * the photo gone from it, no server).
 */
import type { ImmichSize } from '@unlease/core/sync/immich';

import { useImmichPicture } from '../../../app/immich';
import { Icon } from '../../components/Icon';
import styles from './immich.module.css';

export function ImmichPicture({ kind = 'asset', id, size = 'thumbnail', alt = '', className }: { kind?: 'asset' | 'person'; id: string; size?: ImmichSize; alt?: string; className?: string }) {
  const picture = useImmichPicture(kind, id, size);
  if (picture.status === 'ready') return <img className={className ?? styles.picture} src={picture.url} alt={alt} draggable={false} />;
  return (
    <span className={styles.missing} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      {picture.status === 'failed' ? <Icon name="image" size={24} /> : null}
    </span>
  );
}
