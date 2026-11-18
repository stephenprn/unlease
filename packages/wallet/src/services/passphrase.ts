/**
 * How strong a vault's passphrase is, as the first run shows it while it is typed. Its cost (Argon2id,
 * `crypto/cipher`) slows a guess to about a second on a phone, so what matters is how many guesses it
 * takes: a few words of one's own (« le chat dort sur la valise ») beat a short word with symbols.
 * A rough count of the bits a guesser faces, from its length and the characters it draws from, lower
 * for repeats and runs; never a verdict on a passphrase it cannot judge.
 */

export type Strength = 'weak' | 'fair' | 'good';

/** The fewest characters a passphrase may have. */
export const PASSPHRASE_MIN = 12;

export interface StrengthReading {
  readonly level: Strength;
  /** 0 to 1, for the meter. */
  readonly score: number;
  /** Too short to be taken at all. */
  readonly tooShort: boolean;
}

function pool(text: string): number {
  let size = 0;
  if (/[a-z]/.test(text)) size += 26;
  if (/[A-Z]/.test(text)) size += 26;
  if (/\d/.test(text)) size += 10;
  if (/[^A-Za-z0-9\s]/.test(text)) size += 33;
  if (/\s/.test(text)) size += 1;
  // Letters beyond ASCII (é, ç, ß…) widen the pool a little.
  if ([...text].some(char => char.charCodeAt(0) > 127)) size += 20;
  return Math.max(size, 1);
}

export function passphraseStrength(passphrase: string): StrengthReading {
  const text = passphrase.trim();
  if (text.length === 0) return { level: 'weak', score: 0, tooShort: true };
  // Repeats and runs (« aaaa », « 1234 », « abcd ») count once.
  let effective = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const previous = i > 0 ? text.charCodeAt(i - 1) : -10;
    const before = i > 1 ? text.charCodeAt(i - 2) : -20;
    const repeat = code === previous;
    const run = code - previous === 1 && previous - before === 1;
    effective += repeat || run ? 0.25 : 1;
  }
  const words = text.split(/\s+/).filter(word => word.length >= 3).length;
  let bits = effective * Math.log2(pool(text));
  // Several words of one's own: each one is worth a word list's (about 13 bits) at least.
  bits = Math.max(bits, words * 13);
  const score = Math.min(1, bits / 80);
  const tooShort = text.length < PASSPHRASE_MIN;
  const level: Strength = tooShort || bits < 45 ? 'weak' : bits < 65 ? 'fair' : 'good';
  return { level, score, tooShort };
}
