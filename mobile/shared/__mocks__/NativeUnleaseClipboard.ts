/** The clipboard TurboModule under Jest: what is on it, in `state`. */
export const state = { text: '' };

export function __reset(): void {
  state.text = '';
}

const NativeClipboard = {
  readText: async (): Promise<string> => state.text,
  writeText: async (text: string): Promise<boolean> => {
    state.text = text;
    return true;
  },
};

export default NativeClipboard;
