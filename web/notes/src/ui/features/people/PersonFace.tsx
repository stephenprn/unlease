/**
 * A person's face where Carnet names them: their photo cropped to the pebble (a picture glimpsed,
 * turned their own way for life), or their initials on a tile of their own wash in the frame's corner
 * (text never lies on the pebble), as Contacts draws them.
 */
import { memo } from 'react';

import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { Contact } from '@unlease/contacts/models/contacts';
import { avatarColor } from '@unlease/contacts/services/avatar';
import { initials } from '@unlease/contacts/services/names';

import { useBlobUrl } from '@shared/app/media/images';
import { Icon } from '@shared/ui/components/Icon';
import styles from './people.module.css';

type Face = Pick<Contact, 'id' | 'firstName' | 'lastName' | 'company' | 'emails' | 'phones' | 'photoId' | 'photoUploaded'>;

function PersonFaceComponent({ contact, size = 24 }: { contact: Face; size?: number }) {
  const url = useBlobUrl(contact.photoId, 'display', contact.photoUploaded);
  const letters = initials(contact);
  return (
    <span
      className={styles.face}
      data-pebble={url ? pebbleTurnOf(contact.id) : undefined}
      data-still={url ? true : undefined}
      data-line={url ? undefined : avatarColor(contact.id)}
      style={{ width: size, height: size, fontSize: Math.round(size * (letters.length > 1 ? 0.4 : 0.46)) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : letters ? letters : <Icon name="person" size={Math.round(size * 0.6)} />}
    </span>
  );
}

export const PersonFace = memo(PersonFaceComponent);
