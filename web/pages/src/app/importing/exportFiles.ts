/**
 * What Pages' import is given, read in this browser (nothing leaves it): a Notion export (its .zip,
 * and the archives at its top, as Notion cuts a large export in parts), Markdown files, a folder
 * chosen whole (its files' paths kept). Words are decoded (UTF-8, else Windows-1252: a note saved by
 * an older editor); pictures and files are kept as bytes, for the pages that show them.
 */
import { unzipSync, type Unzipped } from 'fflate';

import { t } from '@unlease/core/i18n';
import { isExportArchive, isExportJunk, isExportText, type ExportFile } from '@unlease/pages/services/importing';

export interface ReadExport {
  readonly files: readonly ExportFile[];
  /** The bytes of the files that are not words (pictures, PDFs…), by their path in the export. */
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  /** What was given and could not be read at all, and why. */
  readonly refused: readonly { readonly name: string; readonly why: string }[];
}

/** In a browser the work happens in a module worker; where workers are missing (tests) it runs inline. */
function unzip(bytes: Uint8Array): Promise<Unzipped> {
  if (typeof Worker === 'undefined') return Promise.resolve(unzipSync(bytes));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./unzipWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(unzipSync(bytes));
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
        resolve(unzipSync(bytes));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    worker.postMessage(bytes);
  });
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

function decode(bytes: Uint8Array): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Where a folder chosen whole puts each of its files. */
const pathOf = (file: File): string => (file as File & { readonly webkitRelativePath?: string }).webkitRelativePath || file.name;

export async function readExportFiles(given: readonly File[]): Promise<ReadExport> {
  const files = new Map<string, ExportFile>();
  const bytes = new Map<string, Uint8Array>();
  const refused: { name: string; why: string }[] = [];
  const add = (path: string, data: Uint8Array): void => {
    if (isExportJunk(path)) return;
    if (isExportText(path)) files.set(path, { path, text: decode(data), bytes: data.length });
    else {
      files.set(path, { path, bytes: data.length });
      bytes.set(path, data);
    }
  };
  // Notion's parts (`Export-…-Part-1.zip`) sit at an archive's top and are opened in place; an archive attached to a page stays a file.
  const open = async (data: Uint8Array, nested: boolean): Promise<void> => {
    for (const [name, content] of Object.entries(await unzip(data))) {
      if (name.endsWith('/')) continue;
      if (!nested && isExportArchive(name) && !name.includes('/')) await open(content, true);
      else add(name, content);
    }
  };
  for (const file of given) {
    const path = pathOf(file);
    let data: Uint8Array;
    try {
      data = new Uint8Array(await file.arrayBuffer());
    } catch {
      // A folder dropped on the zone reads as a file that cannot be read.
      refused.push({ name: file.name, why: t('Un dossier ne se dépose pas ici : choisissez-le avec « Choisir un dossier », ou compressez-le en .zip.') });
      continue;
    }
    if (isExportArchive(file.name)) {
      try {
        await open(data, false);
      } catch {
        refused.push({ name: file.name, why: t('Archive illisible : téléchargez-la à nouveau.') });
      }
    } else if (path.includes('/') || isExportText(path)) add(path, data);
    else refused.push({ name: file.name, why: t('Ni une archive .zip, ni un fichier Markdown ou CSV.') });
  }
  return { files: [...files.values()], bytes, refused };
}
