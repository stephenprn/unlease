import { afterEach, describe, expect, it } from 'vitest';
import { AUTH, createTestServer, FakeFetcher, rec, T0, type FakeRoute, type TestServer } from './helpers';
import { putSettings } from './seed';

let server: TestServer;

afterEach(() => server.close());

const json = (value: unknown): FakeRoute => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const FORECAST =
  'https://api.open-meteo.com/v1/forecast?latitude=45.76&longitude=4.84&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2';

const alarm = (id: string, extra: Record<string, unknown> = {}) =>
  rec(
    'alarm',
    id,
    { time: '07:30', days: [1, 2, 3, 4, 5], date: null, enabled: true, label: 'Travail', sound: 'melody', vibrate: true, weather: true, agenda: true, skipDay: null, createdAt: T0, deletedAt: null, ...extra },
    T0,
  );

describe('Clock on the server', () => {
  it('keeps alarms as records', () => {
    server = createTestServer();
    server.sync.push([alarm('a')]);
    expect(server.records.get('alarm', 'a')!.fields).toMatchObject({ time: '07:30', days: [1, 2, 3, 4, 5], label: 'Travail' });
  });

  it('counts its live alarms for the Administration', async () => {
    server = createTestServer();
    server.sync.push([alarm('a'), alarm('b', { deletedAt: T0 })]);
    expect(server.clock.counts!()).toEqual({ alarms: 1 });
    const status = (await (await server.app.request('/api/admin', { headers: AUTH })).json()) as { server: { alarms: number } };
    expect(status.server.alarms).toBe(1);
  });

  it('reads the weather by coordinates rounded to a kilometre, its hours as instants', async () => {
    const fetcher = new FakeFetcher({
      [FORECAST]: json({
        utc_offset_seconds: 3600,
        hourly: { time: ['2026-11-17T07:00', '2026-11-17T08:00'], temperature_2m: [6.4, 7.1], weather_code: [3, 61], precipitation_probability: [10, 60] },
        daily: { time: ['2026-11-17'], weather_code: [61], temperature_2m_max: [12.5], temperature_2m_min: [4.2], precipitation_probability_max: [70] },
      }),
    });
    server = createTestServer({ fetcher });
    const response = await server.app.request('/api/clock/weather?lat=45.7641&lon=4.8357', { headers: AUTH });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.hours).toEqual([
      { at: Date.UTC(2026, 10, 17, 6, 0), temp: 6.4, code: 3, rain: 10 },
      { at: Date.UTC(2026, 10, 17, 7, 0), temp: 7.1, code: 61, rain: 60 },
    ]);
    expect(body.days).toEqual([{ day: '2026-11-17', code: 61, max: 12.5, min: 4.2, rain: 70 }]);
    // Asked again within the hour: kept, not fetched twice.
    await server.app.request('/api/clock/weather?lat=45.76&lon=4.84', { headers: AUTH });
    expect(fetcher.urls().filter(url => url === FORECAST)).toHaveLength(1);
  });

  it('refuses a place that is none, says when the forecast cannot be reached, and answers nothing while Clock is off', async () => {
    server = createTestServer({ fetcher: new FakeFetcher({}) });
    expect((await server.app.request('/api/clock/weather?lat=95&lon=4', { headers: AUTH })).status).toBe(400);
    expect((await server.app.request('/api/clock/weather?lat=abc', { headers: AUTH })).status).toBe(400);
    expect((await server.app.request('/api/clock/weather?lat=45.76&lon=4.84', { headers: AUTH })).status).toBe(502);
    expect((await putSettings(server, { apps: ['notes'] })).status).toBe(200);
    expect((await server.app.request('/api/clock/weather?lat=45.76&lon=4.84', { headers: AUTH })).status).toBe(404);
  });

  it('lists its alarms in archives, in French, by time', () => {
    server = createTestServer();
    server.sync.push([alarm('late', { time: '09:00', days: [6], label: '' }), alarm('early', { enabled: false, sound: 'silent', vibrate: true, weather: false, agenda: false }), alarm('gone', { deletedAt: T0 })]);
    const [file] = server.clock.markdown!(server.records.all(), { kept: true });
    expect(file!.path).toBe('Clock/Clock.md');
    expect(file!.text).toBe(
      [
        '# Clock',
        '',
        '## 07:30 · Travail (désactivée)',
        '',
        '- Jours : En semaine',
        '- Son : Silencieux (vibreur seul), vibreur',
        '',
        '## 09:00',
        '',
        '- Jours : sam.',
        '- Son : Mélodie claire, vibreur',
        '- Au réveil : la météo et les événements du jour',
        '',
      ].join('\n'),
    );
    expect(server.clock.markdown!([], { kept: true })).toEqual([]);
  });
});
