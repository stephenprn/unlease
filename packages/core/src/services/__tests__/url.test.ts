import { extractUrls, isHttpUrl, linkAt, linksInText, safeHref, safeLink } from '../url';

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

describe('what counts as an address', () => {
  it('never takes a number, a file or a name for a site', () => {
    for (const text of ['96.8', '2.7', ' 3.14 ', '1.5/2', 'v1.2', '12.05.2026', 'photo.jpg', 'notes.txt', 'M.Dupont', 'e.g', 'a.b']) {
      expect(extractUrls(text), text).toEqual([]);
      expect(linksInText(text), text).toEqual([]);
    }
  });

  it('takes a site written bare, with its scheme, or on the local network', () => {
    expect(extractUrls('zara.com/fr/veste')).toEqual(['https://zara.com/fr/veste']);
    expect(extractUrls('Zara.com')).toEqual(['https://Zara.com']);
    expect(extractUrls('monsite.studio')).toEqual(['https://monsite.studio']);
    expect(extractUrls('www.Example.studio')).toEqual(['https://www.Example.studio']);
    expect(extractUrls('http://192.168.1.20:8080/admin')).toEqual(['http://192.168.1.20:8080/admin']);
    expect(extractUrls('https://café.example/menu')).toEqual(['https://café.example/menu']);
    expect(extractUrls('https://96.8')).toEqual([]);
    expect(isHttpUrl('https://999.1.1.1')).toBe(false);
  });

  it('finds the links in a line, where they stand', () => {
    const text = 'Veste https://www.zara.com/fr/veste. et www.example.org, merci';
    expect(linksInText(text)).toEqual([
      { start: 6, end: 35, href: 'https://www.zara.com/fr/veste' },
      { start: 40, end: 55, href: 'https://www.example.org' },
    ]);
    expect(linksInText('  zara.com/fr ')).toEqual([{ start: 2, end: 13, href: 'https://zara.com/fr' }]);
    expect(linksInText('voir zara.com demain')).toEqual([]);
    expect(linkAt(text, 6)?.href).toBe('https://www.zara.com/fr/veste');
    expect(linkAt(text, 35)?.href).toBe('https://www.zara.com/fr/veste');
    expect(linkAt(text, 37)).toBeNull();
  });
});
