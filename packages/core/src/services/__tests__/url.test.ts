import { safeHref, safeLink } from '../url';

describe('links that may be opened', () => {
  it('keep the web, mail, telephone and the app’s own paths', () => {
    expect(safeLink(' https://example.org/a?b=1 ')).toBe('https://example.org/a?b=1');
    expect(safeLink('HTTP://example.org')).toBe('HTTP://example.org');
    expect(safeLink('mailto:ada@example.org')).toBe('mailto:ada@example.org');
    expect(safeLink('tel:+33612345678')).toBe('tel:+33612345678');
    expect(safeLink('/pages/page/0193')).toBe('/pages/page/0193');
    expect(safeLink('example.org/fr')).toBe('https://example.org/fr');
  });

  it('refuse scripts, data, other apps’ schemes and other origins', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0001javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'intent://scan/#Intent;end', 'carnet://note/1', 'file:///etc/passwd', '//evil.example/x', '/\\evil.example/x', '/\t/evil.example', 'javascript.example:alert(1)', '']) {
      expect(safeLink(href), href).toBeNull();
      expect(safeHref(href), href).toBe('#');
    }
  });
});
