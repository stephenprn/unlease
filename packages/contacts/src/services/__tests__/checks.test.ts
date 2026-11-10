import { describe, expect, it } from 'vitest';

import { birthdayProblem, emailProblem, isEmailAddress } from '../checks';

describe('contact checks', () => {
  it('reads an e-mail by its shape', () => {
    expect(isEmailAddress('lea@example.org')).toBe(true);
    expect(isEmailAddress(' lea@example.org ')).toBe(true);
    expect(isEmailAddress('lea.example.org')).toBe(false);
    expect(isEmailAddress('lea @example.org')).toBe(false);
    expect(emailProblem('')).toBeNull();
    expect(emailProblem('lea')).not.toBeNull();
  });

  it('says nothing of a birthday left empty, and what to write for one that does not read', () => {
    expect(birthdayProblem('')).toBeNull();
    expect(birthdayProblem('12/03/1990')).toBeNull();
    expect(birthdayProblem('12 03')).toBeNull();
    expect(birthdayProblem('mars')).toContain('27/03/1990');
    expect(birthdayProblem('mars', true)).toContain('03/27/1990');
  });
});
