/**
 * What a field holds decides how it is typed: its keyboard, its capitals, whether the device corrects
 * it, and whether a password manager or the phone's autofill may fill it. One table for both clients,
 * so a postal code takes the same keyboard on the phone and in a phone's browser, and an e-mail is
 * never "corrected" anywhere.
 *
 * Autofill is the person's own data only. A contact's name, an event's place or a link's address are
 * someone else's or something else's: the browser and Android's autofill would offer the person's
 * own name and address there, so those fields turn it off. The two that are the person's own are the
 * server's address and its token, which a password manager may keep as a pair (`serverAddress` and
 * `serverToken`). Another service's key (Claude's, S3's) is a `secret`: hidden with an eye, and never
 * offered to the password manager, which would file it as this site's password.
 */

export type FieldKind =
  /** A short line in words: a title, a name for a label or a collection. */
  | 'text'
  /** Several lines of sentences: a description, a note, a question. */
  | 'prose'
  /** A person's name, or a part of it: capitals on each word, never corrected. */
  | 'person'
  | 'organization'
  | 'email'
  | 'tel'
  /** A web address (a link, a calendar's subscription). */
  | 'url'
  | 'street'
  | 'postalCode'
  | 'city'
  | 'region'
  | 'country'
  /** A count: digits alone. */
  | 'number'
  /** An amount: digits and a decimal mark. */
  | 'decimal'
  /** A time typed in words or digits (« 20h », « 8:30 »). */
  | 'time'
  | 'search'
  /** What a machine reads: a bucket, a region, a key's id, a library's name. */
  | 'code'
  /** A word typed to confirm what cannot be undone (« SUPPRIMER »): every letter a capital, never corrected. */
  | 'confirmWord'
  /** Another service's key or password: hidden until shown, never kept by a password manager. */
  | 'secret'
  /** The person's own server: kept with its token by a password manager. */
  | 'serverAddress'
  | 'serverToken';

export type WebAutoCapitalize = 'off' | 'sentences' | 'words' | 'characters';

/** The attributes a web `<input>` or `<textarea>` takes for a kind. */
export interface WebFieldInput {
  /** Never `number`: its spinner and its scroll wheel change values by accident; digits come from `inputMode`. */
  readonly type: 'text' | 'email' | 'tel' | 'url' | 'search' | 'password';
  readonly inputMode: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | 'search';
  readonly autoComplete: string;
  readonly autoCapitalize: WebAutoCapitalize;
  readonly autoCorrect: 'on' | 'off';
  readonly spellCheck: boolean;
}

/** The props a React Native `TextInput` takes for a kind (Android's names). */
export interface PhoneFieldInput {
  readonly keyboardType: 'default' | 'email-address' | 'phone-pad' | 'url' | 'number-pad' | 'decimal-pad' | 'web-search' | 'visible-password';
  /** Android's autofill hint, `off` where the value is not the person's own. */
  readonly autoComplete: 'off' | 'username' | 'password';
  readonly importantForAutofill: 'yes' | 'no';
  readonly autoCapitalize: 'none' | 'sentences' | 'words' | 'characters';
  readonly autoCorrect: boolean;
  /** Hidden as it is typed, with an eye to show it. */
  readonly secure: boolean;
}

export interface FieldInput {
  readonly web: WebFieldInput;
  readonly phone: PhoneFieldInput;
}

type Keyboard = Pick<WebFieldInput, 'type' | 'inputMode'> & Pick<PhoneFieldInput, 'keyboardType'>;

const KEYBOARDS = {
  words: { type: 'text', inputMode: 'text', keyboardType: 'default' },
  email: { type: 'email', inputMode: 'email', keyboardType: 'email-address' },
  tel: { type: 'tel', inputMode: 'tel', keyboardType: 'phone-pad' },
  url: { type: 'url', inputMode: 'url', keyboardType: 'url' },
  digits: { type: 'text', inputMode: 'numeric', keyboardType: 'number-pad' },
  amount: { type: 'text', inputMode: 'decimal', keyboardType: 'decimal-pad' },
  search: { type: 'search', inputMode: 'search', keyboardType: 'default' },
  // A key typed on the phone: letters and digits, never a suggestion strip learning it.
  machine: { type: 'text', inputMode: 'text', keyboardType: 'visible-password' },
} as const satisfies Record<string, Keyboard>;

interface Spec {
  readonly keyboard: Keyboard;
  /** Capitals: none, each sentence's first letter, each word's, or every letter. */
  readonly capitals: 'none' | 'sentences' | 'words' | 'characters';
  /** Whether the device may correct and suggest words. */
  readonly corrected: boolean;
  /** The person's own value a password manager keeps, or none. */
  readonly own?: 'username' | 'password';
  readonly hidden?: boolean;
}

const SPECS: Record<FieldKind, Spec> = {
  text: { keyboard: KEYBOARDS.words, capitals: 'sentences', corrected: true },
  prose: { keyboard: KEYBOARDS.words, capitals: 'sentences', corrected: true },
  person: { keyboard: KEYBOARDS.words, capitals: 'words', corrected: false },
  organization: { keyboard: KEYBOARDS.words, capitals: 'words', corrected: false },
  email: { keyboard: KEYBOARDS.email, capitals: 'none', corrected: false },
  tel: { keyboard: KEYBOARDS.tel, capitals: 'none', corrected: false },
  url: { keyboard: KEYBOARDS.url, capitals: 'none', corrected: false },
  street: { keyboard: KEYBOARDS.words, capitals: 'sentences', corrected: false },
  postalCode: { keyboard: KEYBOARDS.words, capitals: 'characters', corrected: false },
  city: { keyboard: KEYBOARDS.words, capitals: 'words', corrected: false },
  region: { keyboard: KEYBOARDS.words, capitals: 'words', corrected: false },
  country: { keyboard: KEYBOARDS.words, capitals: 'words', corrected: false },
  number: { keyboard: KEYBOARDS.digits, capitals: 'none', corrected: false },
  decimal: { keyboard: KEYBOARDS.amount, capitals: 'none', corrected: false },
  time: { keyboard: KEYBOARDS.words, capitals: 'none', corrected: false },
  search: { keyboard: KEYBOARDS.search, capitals: 'none', corrected: false },
  code: { keyboard: KEYBOARDS.machine, capitals: 'none', corrected: false },
  confirmWord: { keyboard: KEYBOARDS.words, capitals: 'characters', corrected: false },
  secret: { keyboard: KEYBOARDS.machine, capitals: 'none', corrected: false, hidden: true },
  serverAddress: { keyboard: KEYBOARDS.url, capitals: 'none', corrected: false, own: 'username' },
  serverToken: { keyboard: KEYBOARDS.machine, capitals: 'none', corrected: false, own: 'password', hidden: true },
};

const WEB_CAPITALS: Record<Spec['capitals'], WebAutoCapitalize> = { none: 'off', sentences: 'sentences', words: 'words', characters: 'characters' };

/** How a field holding `kind` is typed, on each client. */
export function fieldInput(kind: FieldKind): FieldInput {
  const spec = SPECS[kind];
  const web: WebFieldInput = {
    type: spec.hidden ? 'password' : spec.keyboard.type,
    inputMode: spec.keyboard.inputMode,
    // A hidden key that is not the person's own: `off` (a password field still asks the browser; `new-password` would offer to make one up).
    autoComplete: spec.own === 'username' ? 'username' : spec.own === 'password' ? 'current-password' : 'off',
    autoCapitalize: WEB_CAPITALS[spec.capitals],
    autoCorrect: spec.corrected ? 'on' : 'off',
    spellCheck: spec.corrected,
  };
  const phone: PhoneFieldInput = {
    // A hidden field keeps the default keyboard: Android's own password keyboard, which learns nothing.
    keyboardType: spec.hidden ? 'default' : spec.keyboard.keyboardType,
    autoComplete: spec.own ?? 'off',
    importantForAutofill: spec.own ? 'yes' : 'no',
    autoCapitalize: spec.capitals,
    autoCorrect: spec.corrected,
    secure: spec.hidden === true,
  };
  return { web, phone };
}

/**
 * A field's text near its limit says how much room is left: from this share of the limit on, so a
 * title of 200 says nothing until 160 are typed.
 */
export const COUNTER_FROM = 0.8;

/** A limit this short is a format's (a hex code, a year), never counted. */
export const COUNTED_FROM_LIMIT = 30;

/** What a counter shows for `length` of `limit`, or null while there is room. Negative past the limit. */
export function roomLeft(length: number, limit: number | undefined): number | null {
  if (!limit || limit < COUNTED_FROM_LIMIT) return null;
  return length >= Math.floor(limit * COUNTER_FROM) ? limit - length : null;
}
