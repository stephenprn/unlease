/** A link of Carnet's in a page (an embedded collection, a bookmark): Carnet's row as drawn (`LinkRowView`), on Pages' library and its writes. */
import React, { memo } from 'react';

import { reanalyzeLink, setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { LinkRowView } from '@carnet/ui/features/links/LinkRowView';

function LinkRowComponent({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const link = useLibraryStore(s => s.links[id]);
  return <LinkRowView id={id} link={link} onOpen={onOpen} onSetDone={setLinkDone} onRetry={reanalyzeLink} />;
}

export const LinkRow = memo(LinkRowComponent);
