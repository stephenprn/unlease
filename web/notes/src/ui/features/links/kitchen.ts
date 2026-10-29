/** The cook mode's helpers in the browser: the screen kept awake, a second's tick, a timer's chime. */
import { useEffect, useState } from 'react';

/** Keeps the screen on while `active`, taken again when the tab comes back (a hidden tab loses it). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let live = true;
    const take = (): void => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        lock => {
          if (live) sentinel = lock;
          else void lock.release();
        },
        () => {
          // Refused (battery saver, a frame without the permission): the cook mode works without it.
        },
      );
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', take);
      void sentinel?.release();
    };
  }, [active]);
}

/** The time, every second while `active`. */
export function useSecond(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // At once, then every second: a time kept from before would show a countdown from then.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

let audio: AudioContext | null = null;

/** Made ready on the press that starts a timer: a browser only lets a page sound after a gesture. */
export function primeChime(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

/** Three soft notes when a timer is done. */
export function chime(): void {
  if (!audio) return;
  const start = audio.currentTime + 0.05;
  for (let note = 0; note < 3; note += 1) {
    const at = start + note * 0.4;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = note === 2 ? 1046.5 : 784;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.38);
  }
}
