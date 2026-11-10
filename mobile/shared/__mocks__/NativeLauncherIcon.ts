/** The LauncherIcon TurboModule under Jest: the launcher's entries this build has, the one on, each switch, and whether it declines now, in `state`. */
export const state = {
  palettes: ['carnet', 'sarcelle', 'myrtille', 'glycine', 'pivoine', 'mimosa', 'ardoise', 'mousse'] as string[],
  on: 'carnet',
  switched: [] as string[],
  /** Another activity waits in the app's task: the module declines. */
  busy: false,
};

export function __reset(): void {
  state.palettes = ['carnet', 'sarcelle', 'myrtille', 'glycine', 'pivoine', 'mimosa', 'ardoise', 'mousse'];
  state.on = 'carnet';
  state.switched = [];
  state.busy = false;
}

const NativeLauncherIcon = {
  current: (): string => (state.palettes.includes(state.on) ? state.on : ''),
  choose: (palette: string): boolean => {
    if (!state.palettes.includes(palette) || state.busy) return false;
    state.on = palette;
    state.switched.push(palette);
    return true;
  },
  mainActivity: (): string => (state.palettes.length > 0 ? 'com.stephenprn.unlease.MainActivity' : ''),
};

export default NativeLauncherIcon;
