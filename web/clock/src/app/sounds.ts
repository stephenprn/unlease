/**
 * Clock's sounds in the browser: the same Ogg files the phone rings with (`SOUNDS`, copied from the
 * Android app's `res/raw` into `src/sounds/`), bundled with hashed names so the server keeps them
 * for good, and played once from the editor to hear one before choosing it. Never an alarm: the web
 * rings nothing. One sound at a time; it stops when asked, or when the editor goes.
 *
 * The bytes are fetched whole and played from memory (a `blob:` address, which the security policy
 * allows): a media element's own range requests would reach the offline worker as partial answers,
 * which it cannot keep.
 */
import { create } from 'zustand';

import { isBundledSound } from '@unlease/clock/services/sounds';

const FILES = import.meta.glob<string>('../sounds/*.ogg', { query: '?url', import: 'default', eager: true });

/** A bundled sound's address in the build; null for `silent`, a phone's own sound or an unknown key. */
export function soundUrl(key: string): string | null {
  return isBundledSound(key) ? (FILES[`../sounds/${key}.ogg`] ?? null) : null;
}

/** Whether this browser can play the sounds at all (Ogg Vorbis). */
export function canPlaySounds(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return false;
  }
}

interface PreviewState {
  /** The sound playing now. */
  readonly playing: string | null;
}

export const usePreviewStore = create<PreviewState>(() => ({ playing: null }));

let audio: HTMLAudioElement | null = null;
let address: string | null = null;
/** Bumped by every play and stop: a fetch that comes back late plays nothing. */
let turn = 0;

function release(): void {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    try {
      audio.pause();
    } catch {
      // Nothing to pause (jsdom).
    }
    audio.removeAttribute('src');
    audio = null;
  }
  if (address) URL.revokeObjectURL(address);
  address = null;
}

/** Stops what plays, if anything. */
export function stopPreview(): void {
  turn += 1;
  release();
  if (usePreviewStore.getState().playing !== null) usePreviewStore.setState({ playing: null });
}

/**
 * Plays a sound once from its start (what played stops). Resolves false when it cannot be heard
 * here (no such file, a browser without Ogg, the bytes refused), so the editor can say so.
 */
export async function playPreview(key: string): Promise<boolean> {
  stopPreview();
  const url = soundUrl(key);
  if (!url || !canPlaySounds()) return false;
  const mine = (turn += 1);
  usePreviewStore.setState({ playing: key });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = new Blob([await response.arrayBuffer()], { type: 'audio/ogg' });
    if (mine !== turn) return true;
    address = URL.createObjectURL(blob);
    audio = new Audio(address);
    audio.onended = () => {
      if (mine === turn) stopPreview();
    };
    audio.onerror = () => {
      if (mine === turn) stopPreview();
    };
    await audio.play();
    return true;
  } catch {
    if (mine === turn) stopPreview();
    return false;
  }
}
