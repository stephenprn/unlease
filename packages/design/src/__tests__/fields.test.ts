import { describe, expect, it } from 'vitest';

import { fieldInput, roomLeft, type FieldKind } from '../fields';

const KINDS: readonly FieldKind[] = ['text', 'prose', 'person', 'organization', 'email', 'tel', 'url', 'street', 'postalCode', 'city', 'region', 'country', 'number', 'decimal', 'time', 'search', 'code', 'secret', 'serverAddress', 'serverToken'];

describe('fields', () => {
  it('offers autofill only for the person’s own server', () => {
    for (const kind of KINDS) {
      const input = fieldInput(kind);
      const own = kind === 'serverAddress' || kind === 'serverToken';
      expect(input.phone.importantForAutofill).toBe(own ? 'yes' : 'no');
      expect(input.web.autoComplete === 'off').toBe(!own);
    }
    expect(fieldInput('serverToken').web.autoComplete).toBe('current-password');
  });

  it('never uses the number input, and gives digits their keyboard', () => {
    for (const kind of KINDS) expect(fieldInput(kind).web.type).not.toBe('number');
    expect(fieldInput('number').web.inputMode).toBe('numeric');
    expect(fieldInput('number').phone.keyboardType).toBe('number-pad');
  });

  it('hides keys until shown, and never corrects an address', () => {
    expect(fieldInput('secret').web.type).toBe('password');
    expect(fieldInput('secret').phone.secure).toBe(true);
    expect(fieldInput('email').phone.autoCorrect).toBe(false);
    expect(fieldInput('email').web.spellCheck).toBe(false);
    expect(fieldInput('person').phone.autoCapitalize).toBe('words');
  });

  it('counts the room left only near the limit', () => {
    expect(roomLeft(10, 200)).toBeNull();
    expect(roomLeft(160, 200)).toBe(40);
    expect(roomLeft(205, 200)).toBe(-5);
    expect(roomLeft(5, undefined)).toBeNull();
    // A format's cap (a hex code) is never counted.
    expect(roomLeft(7, 9)).toBeNull();
  });
});
