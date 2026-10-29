/**
 * Photo picker, camera, Takeout zip and any one document (a backup archive). Everything comes back
 * as a file already copied into app storage (no lapsing content URIs); `status` is 'ok',
 * 'cancelled' or 'error'. One way out too: a file the app made, saved where the person chooses.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface MediaFile {
  path: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export interface MediaResult {
  status: string;
  message: string;
  files: MediaFile[];
}

export interface ArchiveEntry {
  /** The path inside the zip, e.g. `Takeout/Keep/Courses.json`. */
  name: string;
  /** Where it was extracted. */
  path: string;
  bytes: number;
}

export interface ArchiveResult {
  status: string;
  message: string;
  /** The directory everything was extracted into; remove it when done. */
  dir: string;
  entries: ArchiveEntry[];
}

export interface PickedFile {
  status: string;
  message: string;
  /** Where it was copied, in the app's cache; empty unless 'ok'. */
  path: string;
  /** Its name as the picker showed it. */
  name: string;
  bytes: number;
}

export interface SavedFile {
  status: string;
  message: string;
}

export interface Spec extends TurboModule {
  pickImages(max: number): Promise<MediaResult>;
  capturePhoto(): Promise<MediaResult>;
  /** Size and type of an image already in app storage. */
  describeImage(path: string): Promise<MediaFile>;
  /** Pick a Takeout zip and extract only its Keep folder. */
  pickKeepArchive(): Promise<ArchiveResult>;
  /** Pick one document of these types, copied into the cache; remove it when done. */
  pickFile(mimeTypes: string[]): Promise<PickedFile>;
  readText(path: string): Promise<string>;
  /** Offers to save a file the app made, through Android's own save screen (no permission): its bytes as base64. */
  saveFile(name: string, mime: string, base64: string): Promise<SavedFile>;
  /** Paths outside app storage are refused. */
  remove(path: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('Media');
