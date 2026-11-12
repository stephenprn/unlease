/**
 * Unzips an export off the main thread (`exportFiles`), so a large Notion export does not freeze
 * the page. A module worker from this origin, so the page's CSP needs no `blob:` worker.
 */
import { unzipSync } from 'fflate';

self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try {
    const files = unzipSync(event.data);
    const buffers = Object.values(files).map(data => data.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ ok: true, files }, buffers);
  } catch (error) {
    (self as unknown as Worker).postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
