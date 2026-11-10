/**
 * A person's face: their photo cropped to the pebble (a picture glimpsed, turned their own way for
 * life, `pebbleTurnOf`), or their initials on a tile of their own wash in the frame's continuous
 * corner (text never lies on the pebble). Without a name, the person glyph on that tile.
 */
import { memo } from 'react';

import type { LineColor } from '@unlease/design/colors';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { Contact } from '@unlease/contacts/models/contacts';
import { initials } from '@unlease/contacts/services/names';

import { useBlobUrl } from '@shared/app/media/images';
import { Icon } from '@shared/ui/components/Icon';
import { avatarColor } from '@unlease/contacts/services/avatar';
import styles from '../contacts.module.css';

/** A person's own pigment, the same on every device and in every app (`avatarColor`). */
export const washOf = (id: string): LineColor => avatarColor(id);

type Face = Pick<Contact, 'id' | 'firstName' | 'lastName' | 'company' | 'emails' | 'phones' | 'photoId' | 'photoUploaded'>;

function AvatarComponent({ contact, size = 40, photo }: { contact: Face; size?: number; photo?: { readonly id: string | null; readonly uploaded: boolean } }) {
  const photoId = photo ? photo.id : contact.photoId;
  const url = useBlobUrl(photoId, 'display', photo ? photo.uploaded : contact.photoUploaded);
  const letters = initials(contact);
  return (
    <span
      className={styles.avatar}
      data-pebble={url ? pebbleTurnOf(contact.id) : undefined}
      data-still={url ? true : undefined}
      data-line={url ? undefined : washOf(contact.id)}
      style={{ width: size, height: url ? Math.round(size * 0.93) : size, fontSize: Math.round(size * (letters.length > 1 ? 0.36 : 0.42)) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : letters ? letters : <Icon name="person" size={Math.round(size * 0.55)} />}
    </span>
  );
}

export const Avatar = memo(AvatarComponent);
