/** App-wide overlays and what feeds them: shares, reminder notifications, the sync lifecycle, the kitchen timers' rings. */
import React, { useCallback, useEffect, useRef } from 'react';

import { INBOX_ID } from '@unlease/notes/models/entities';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { receiveShare } from '@app/intake';
import { useAppLifecycle } from '@app/hooks/useAppLifecycle';
import { useReminders } from '@app/hooks/useReminders';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack, startTransfer } from '@app/store/uiStore';
import { onShare, takePendingShare, type Share } from '@platform/intake';

import { navigate, navigationRef } from '../../navigation/navigationRef';
import { ServicesCssSheet } from '../appearance/ServicesCssSheet';
import { KitchenAlarms } from '../links/KitchenTimers';
import { CaptureSheet } from './CaptureSheet';
import { TransferPanel } from './TransferPanel';

export function Overlays(): React.ReactElement {
  const handled = useRef(new Set<string>());
  const handle = useCallback(async (share: Share) => {
    // A share can arrive both as the pending one and as an event: once is enough.
    if (handled.current.has(share.id)) return;
    handled.current.add(share.id);
    const result = await receiveShare(share);
    if (result.kind === 'links') {
      const added = result.links.filter(link => link.existing === null);
      if (result.reading) added.forEach(link => startTransfer(link.id, added.length === 1 ? link.cleaned : 0));
      // Read, the new links travel on the transfer panel; the slip tells what was saved already.
      const message = addedMessage(result.links, result.reading ? { into: null } : { into: INBOX_ID, announce: true }, useLibraryStore.getState().notes);
      if (message) showSnack(message);
    }
    if (result.kind === 'note') navigate('Note', { id: result.id });
  }, []);

  const pickUpShare = useCallback(() => {
    takePendingShare().then(share => {
      if (share) handle(share);
    });
  }, [handle]);

  useEffect(() => {
    // The navigator may not be mounted on the very first frame of a cold start.
    const timer = setTimeout(pickUpShare, navigationRef.isReady() ? 0 : 300);
    const unsubscribe = onShare(handle);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [handle, pickUpShare]);

  useAppLifecycle(pickUpShare);
  useReminders(noteId => navigate('Note', { id: noteId }));

  return (
    <>
      <TransferPanel />
      <CaptureSheet />
      <ServicesCssSheet />
      <KitchenAlarms />
    </>
  );
}
