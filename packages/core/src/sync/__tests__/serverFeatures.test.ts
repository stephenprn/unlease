import { describe, expect, it } from 'vitest';

import { parseServerFeatures, parseServerSettings, serverFeatures } from '../settings';

describe('the server features the Administration sets up', () => {
  it('reads each from the settings: a key, S3, a drive, Seerr', () => {
    const bare = parseServerSettings({ analysis: { enabled: false } })!;
    expect(serverFeatures(bare)).toEqual({ claude: false, backup: false, drive: false, seerr: false });
    const full = parseServerSettings({
      analysis: { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 },
      backup: { configured: true },
      drive: { provider: 'seafile', url: 'https://drive.example.org' },
      seerr: { url: 'https://seerr.example.org' },
    })!;
    expect(serverFeatures(full)).toEqual({ claude: true, backup: true, drive: true, seerr: true });
  });

  it('keeps only what is known, as a device stored it', () => {
    expect(parseServerFeatures(null)).toEqual({});
    expect(parseServerFeatures('claude')).toEqual({});
    expect(parseServerFeatures({ claude: true, backup: 'yes', drive: false, other: true })).toEqual({ claude: true, drive: false });
  });
});
