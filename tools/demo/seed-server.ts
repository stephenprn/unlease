/**
 * Dev only: push the made-up demo (web/notes/src/dev/demoData.ts), images included, into a server.
 *   UNLEASE_URL=http://localhost:8787 UNLEASE_TOKEN=… \
 *     npx tsx --tsconfig web/notes/tsconfig.app.json tools/demo/seed-server.ts
 */
import sharp from 'sharp';

import { buildDemoRecords, DEMO_IMAGE_IDS } from '../../web/notes/src/dev/demoData';
import { demoImage } from '../../web/notes/src/dev/demoImages';

const url = process.env.UNLEASE_URL ?? 'http://localhost:8787';
const token = process.env.UNLEASE_TOKEN ?? '';
const headers = { Authorization: `Bearer ${token}` };

async function main(): Promise<void> {
  const records = buildDemoRecords(Date.now());
  for (let i = 0; i < records.length; i += 300) {
    const response = await fetch(`${url}/api/sync`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ node: 'demoseed', since: 0, records: records.slice(i, i + 300) }),
    });
    if (!response.ok) throw new Error(`sync ${response.status}: ${await response.text()}`);
  }
  console.log(`pushed ${records.length} records`);

  for (const id of DEMO_IMAGE_IDS) {
    const svg = demoImage(id);
    if (!svg) continue;
    const png = await sharp(Buffer.from(await svg.arrayBuffer()), { density: 144 }).png().toBuffer();
    const response = await fetch(`${url}/api/blobs/${id}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'image/png' }, body: png });
    console.log(`${id}: ${response.status}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
