/** The phone's own language, for the interface's default before one is chosen in Réglages. */
export function deviceLanguage(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return '';
  }
}
