# Clock's sounds

The alarm sounds Clock ships (`mobile/clock/android/app/src/main/res/raw/*.ogg`, and the web app's copies for the editor's preview), each keyed as alarms store it (`packages/clock/src/services/sounds.ts`). None is Unlease's own work: they keep their licences, below, and none of them is MIT. The phone's own alarm sounds can be picked too (Android's picker); those stay on the phone.

All are Ogg Vorbis (quality 4), mono, made to loop (each carries `ANDROID_LOOP=true`), starting at once (under 15 ms before the first sound), peaking at or below -1 dBFS and near -16 LUFS, the gentle ones a little softer. The default is `melody`: bright and musical, full from its first note, pleasant yet hard to sleep through.

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `birdsong.ogg` | Birdsong | Joseph Sardin (BigSoundBank) | [Birds Waking #3](https://bigsoundbank.com/wake-birds-3-s0999.html) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `chimes.ogg` | Wind chimes | Pierre Sibanarco (BigSoundBank) | [Cluster Chimes #1](https://bigsoundbank.com/cluster-chimes-1-s2687.html) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bowl.ogg` | Singing bowl | Joseph Sardin (BigSoundBank) | [Tibetan Bowl Struck #1](https://bigsoundbank.com/tibetan-bowl-struck-s1110.html) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `sunrise.ogg` | Sunrise | The Android Open Source Project | [Awaken](https://android.googlesource.com/platform/frameworks/base/+/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds/alarms/material/ogg/Awaken_OG7_1ch_48k.ogg) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `bell.ogg` | Bell alarm clock | Joseph Sardin (BigSoundBank) | [Mechanical Alarm Clock, Ringtone #11](https://bigsoundbank.com/mechanical-alarm-clock-ringtone-11-s2814.html) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `digital.ogg` | Digital beeps | The Android Open Source Project | [Timer](https://android.googlesource.com/platform/frameworks/base/+/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds/alarms/material/ogg/Timer.ogg) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `melody.ogg` | Bright melody | The Android Open Source Project | [Oxygen](https://android.googlesource.com/platform/frameworks/base/+/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds/alarms/material/ogg/Oxygen.ogg) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `groove.ogg` | Neon groove | The Android Open Source Project | [Neon](https://android.googlesource.com/platform/frameworks/base/+/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds/alarms/material/ogg/Neon.ogg) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| `rooster.ogg` | Rooster | Joseph Sardin (BigSoundBank) | [Crowing #4](https://bigsoundbank.com/crowing-4-s0704.html) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Licences

The files from the Android Open Source Project (`sunrise`, `digital`, `melody`, `groove`) are Copyright The Android Open Source Project, licensed under the Apache License 2.0 ([`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt), also in the APK as `assets/licenses/sounds.txt`), the licence of `platform/frameworks/base`, whose NOTICE reads:

> This product includes software developed as part of The Android Open Source Project (http://source.android.com).

They were modified: trimmed or repeated into a loop, mixed to mono, their level adjusted and encoded again as Ogg Vorbis (below). The files are taken from the commit `1cdfff555f4a21f71ccc978290e2e212e2f8b168` of `platform/frameworks/base`.

The files from [BigSoundBank](https://bigsoundbank.com/licenses.html) (`birdsong`, `chimes`, `bowl`, `bell`, `rooster`) were dedicated to the public domain by their authors under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); they are credited as a courtesy. They were cut into loops, mixed to mono, their level adjusted and encoded as Ogg Vorbis.

## What was changed in each

- `birdsong.ogg`, from Birds Waking #3 (BigSoundBank #0999), 6:30 am, 23 April 2018: cut from 23.0 s to 49.25 s and cross-faded (2 s) into a 24.25 s loop that starts on a song; mixed to mono, high-passed at 150 Hz, peaks limited by about 4 dB; encoded as Ogg Vorbis q4.
- `chimes.ogg`, from Cluster Chimes #1 (BigSoundBank #2687): cut from 4 s to 33 s and cross-faded (3 s) into a 26 s loop that starts on a strike; mixed to mono, high-passed at 200 Hz, peaks limited by about 7 dB; encoded as Ogg Vorbis q4.
- `bowl.ogg`, from Tibetan Bowl Struck #1 (BigSoundBank #1110): one strike folded into a 6.5 s loop (struck again every 6.5 s, earlier strikes ringing on); mixed to mono, high-passed at 120 Hz, the strike's peak limited by about 4.5 dB; encoded as Ogg Vorbis q4.
- `sunrise.ogg`, from Awaken (AOSP alarm, frameworks/base data/sounds/alarms/material/ogg): leading silence (0.25 s) and trailing silence trimmed; level lowered; encoded as Ogg Vorbis q4.
- `bell.ogg`, from Mechanical Alarm Clock, Ringtone #11 (BigSoundBank #2814): leading silence trimmed, cut at 13.9 s with a 0.6 s fade; high-passed at 100 Hz; level lowered; encoded as Ogg Vorbis q4.
- `digital.ogg`, from Timer (AOSP alarm, frameworks/base data/sounds/alarms/material/ogg): one 1.188 s period (four beeps and a pause) repeated five times; mixed to mono; level lowered; encoded as Ogg Vorbis q4.
- `melody.ogg`, from Oxygen (AOSP alarm, frameworks/base data/sounds/alarms/material/ogg): trailing silence trimmed; mixed to mono, peaks limited by about 4.5 dB; encoded as Ogg Vorbis q4.
- `groove.ogg`, from Neon (AOSP alarm, frameworks/base data/sounds/alarms/material/ogg): mixed to mono (the 16 s loop kept sample-exact), peaks limited by under 1 dB; encoded as Ogg Vorbis q4.
- `rooster.ogg`, from Crowing #4 (BigSoundBank #0704): crows 2 to 5 of 20 (4.18 s to 18.90 s; the gaps between crows are digital silence); mixed to mono, high-passed at 100 Hz, level lowered; encoded as Ogg Vorbis q4.
