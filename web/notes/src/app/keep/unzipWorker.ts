/**
 * Unzips a Takeout archive off the main thread, keeping only Keep's entries.
 * A module worker from this origin, so the page's CSP needs no `blob:` worker.
 */
import { unzipSync } from 'fflate';

import { isKeepEntry } from './entries';

self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try {
    const files = unzipSync(event.data, { filter: entry => isKeepEntry(entry.name) });
    const buffers = Object.values(files).map(data => data.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ ok: true, files }, buffers);
  } catch (error) {
    (self as unknown as Worker).postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
