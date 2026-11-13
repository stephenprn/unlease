import { describe, expect, it } from 'vitest';
import { calendarFromReport, calendarQueryBody, davCalendars, davPointers, davSelf, parseXml, readMultistatus } from '../caldav';

const event = (uid: string, summary: string): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'END:VTIMEZONE', 'BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`, 'DTSTART;TZID=Europe/Paris:20261104T100000', 'DTEND;TZID=Europe/Paris:20261104T110000', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

describe('CalDAV', () => {
  it('reads XML by local names, with entities, CDATA and attributes', () => {
    const root = parseXml('<?xml version="1.0"?><!-- a comment --><a:root xmlns:a="DAV:" x=\'1 &amp; 2\'><a:b>Tom &amp; Léa &#233;&#x2014;</a:b><c><![CDATA[<raw & kept>]]></c><d/></a:root>');
    expect(root?.name).toBe('root');
    expect(root?.attributes.x).toBe('1 & 2');
    expect(root?.children.map(child => [child.name, child.text])).toEqual([
      ['b', 'Tom & Léa é—'],
      ['c', '<raw & kept>'],
      ['d', ''],
    ]);
    expect(parseXml('not xml')).toBeNull();
  });

  it('reads a multistatus whatever its prefixes, leaving out what a propstat did not find', () => {
    const answer = readMultistatus(`<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <response>
        <href>/remote.php/dav/calendars/lea/perso/</href>
        <propstat><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Perso</displayname></prop><status>HTTP/1.1 200 OK</status></propstat>
        <propstat><prop><current-user-principal/></prop><status>HTTP/1.1 404 Not Found</status></propstat>
      </response>
    </multistatus>`);
    expect(answer).toHaveLength(1);
    expect(answer[0]!.href).toBe('/remote.php/dav/calendars/lea/perso/');
    expect([...answer[0]!.props.keys()]).toEqual(['resourcetype', 'displayname']);
    expect(readMultistatus('<html>Not WebDAV</html>')).toEqual([]);
  });

  it('finds the calendars of events, their names and addresses, and where to look next', () => {
    const base = 'https://cloud.example.org/remote.php/dav/calendars/lea/';
    const answer = readMultistatus(`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
      <d:response><d:href>/remote.php/dav/calendars/lea/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:current-user-principal><d:href>/remote.php/dav/principals/users/lea/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
      <d:response><d:href>/remote.php/dav/calendars/lea/perso/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>Perso</d:displayname><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
      <d:response><d:href>/remote.php/dav/calendars/lea/taches/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>Tâches</d:displayname><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
      <d:response><d:href>https://cloud.example.org/remote.php/dav/calendars/lea/sans-liste/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
    </d:multistatus>`);
    expect(davCalendars(answer, base)).toEqual([
      { url: 'https://cloud.example.org/remote.php/dav/calendars/lea/perso/', name: 'Perso' },
      { url: 'https://cloud.example.org/remote.php/dav/calendars/lea/sans-liste/', name: '' },
    ]);
    expect(davSelf(answer, base)?.href).toBe('/remote.php/dav/calendars/lea/');
    expect(davPointers(answer, base)).toEqual({ home: null, principal: 'https://cloud.example.org/remote.php/dav/principals/users/lea/' });
  });

  it('asks for the events from a day on, and reads each object’s calendar', () => {
    expect(calendarQueryBody('2025-09-14')).toContain('<c:time-range start="20250914T000000Z"/>');
    expect(calendarQueryBody(null)).not.toContain('time-range');
    const escaped = event('a@x', 'Point & café').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const answer = readMultistatus(`<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:response><D:href>/cal/a.ics</D:href><D:propstat><D:prop><C:calendar-data>${escaped}</C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
      <D:response><D:href>/cal/b.ics</D:href><D:propstat><D:prop><C:calendar-data><![CDATA[${event('b@x', 'Revue')}]]></C:calendar-data></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
      <D:response><D:href>/cal/c.ics</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>
    </D:multistatus>`);
    const calendar = calendarFromReport(answer);
    expect(calendar.events.map(item => [item.uid, item.title, item.start, item.timeZone])).toEqual([
      ['a@x', 'Point & café', '2026-11-04T10:00', 'Europe/Paris'],
      ['b@x', 'Revue', '2026-11-04T10:00', 'Europe/Paris'],
    ]);
  });
});
