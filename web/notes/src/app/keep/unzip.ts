/**
 * The Keep part of a Takeout zip, as `{ path: bytes }`.
 *
 * In a browser the work happens in a module worker, so a large export does not
 * freeze the page; where workers are missing (tests) it runs inline.
 */
import { unzipSync, type Unzipped } from 'fflate';

import { isKeepEntry } from './entries';

function unzipInline(bytes: Uint8Array): Unzipped {
  return unzipSync(bytes, { filter: entry => isKeepEntry(entry.name) });
}

export function unzipKeep(bytes: Uint8Array): Promise<Unzipped> {
  if (typeof Worker === 'undefined') return Promise.resolve(unzipInline(bytes));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./unzipWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(unzipInline(bytes));
      return;
    }
    worker.onmessage = (event: MessageEvent<{ ok: true; files: Unzipped } | { ok: false; message: string }>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.files);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      // A worker that cannot start (an old engine) is not a broken archive.
      try {
        resolve(unzipInline(bytes));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    worker.postMessage(bytes);
  });
}
