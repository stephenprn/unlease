/** Carnet's link row: the row as drawn (`LinkRowView`), on Carnet's library and its actions. */
import React, { memo } from 'react';

import { reanalyzeLink, setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { LinkRowView } from './LinkRowView';

export { LINK_IMAGE } from './LinkRowView';

function LinkRowComponent({ id, onOpen, onLongPress, onPressIn, onPressOut }: { id: string; onOpen: (id: string) => void; onLongPress?: (id: string) => void; onPressIn?: () => void; onPressOut?: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  return <LinkRowView id={id} link={link} onOpen={onOpen} onLongPress={onLongPress} onSetDone={setLinkDone} onRetry={reanalyzeLink} onPressIn={onPressIn} onPressOut={onPressOut} />;
}

export const LinkRow = memo(LinkRowComponent);
