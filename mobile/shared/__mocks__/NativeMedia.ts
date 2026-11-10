/**
 * The Media TurboModule under Jest: a recorder whose answers a test can set.
 */
import type { ArchiveResult, MediaFile, MediaResult, PickedFile, SavedFile } from '../specs/NativeMedia';

export const state = {
  nextPick: { status: 'cancelled', message: '', files: [] } as MediaResult,
  nextArchive: { status: 'cancelled', message: '', dir: '', entries: [] } as ArchiveResult,
  nextFile: { status: 'cancelled', message: '', path: '', name: '', bytes: 0 } as PickedFile,
  texts: {} as Record<string, string>,
  removed: [] as string[],
  nextSave: { status: 'ok', message: '' } as SavedFile,
  saved: [] as { name: string; mime: string; base64: string }[],
};

export function __reset(): void {
  state.nextPick = { status: 'cancelled', message: '', files: [] };
  state.nextArchive = { status: 'cancelled', message: '', dir: '', entries: [] };
  state.nextFile = { status: 'cancelled', message: '', path: '', name: '', bytes: 0 };
  state.texts = {};
  state.removed = [];
  state.nextSave = { status: 'ok', message: '' };
  state.saved = [];
}

const NativeMedia = {
  pickImages: async (_max: number): Promise<MediaResult> => state.nextPick,
  capturePhoto: async (): Promise<MediaResult> => state.nextPick,
  describeImage: async (path: string): Promise<MediaFile> => ({ path, mime: 'image/jpeg', width: 800, height: 600, bytes: 1000 }),
  pickKeepArchive: async (): Promise<ArchiveResult> => state.nextArchive,
  pickFile: async (_mimeTypes: string[]): Promise<PickedFile> => state.nextFile,
  readText: async (path: string): Promise<string> => state.texts[path] ?? '',
  remove: async (path: string): Promise<boolean> => {
    state.removed.push(path);
    return true;
  },
  saveFile: async (name: string, mime: string, base64: string): Promise<SavedFile> => {
    state.saved.push({ name, mime, base64 });
    return state.nextSave;
  },
};

export default NativeMedia;
