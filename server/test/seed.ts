/** A small library for the backup and drive tests: a checklist with a photo, a collection with a link, a page with a sub-page and a PDF. */
import { expect } from 'vitest';
import { AUTH, jpeg, listNote, postSync, rec, T0, type TestServer } from './helpers';

export interface Seeded {
  readonly photo: Buffer;
  readonly pdf: Buffer;
}

export const NOTE = 'note-courses';
export const PHOTO = 'photo-courses';
export const PAGE = 'page-projet';
export const SUB_PAGE = 'page-sous';
export const PDF = 'file-plan';
export const PDF_BLOCK = 'block-plan';

export async function seedLibrary(server: TestServer): Promise<Seeded> {
  const photo = await jpeg(320, 240);
  const pdf = Buffer.from('%PDF-1.4 plan du projet');
  expect((await server.app.request(`/api/blobs/${PHOTO}`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(photo) })).status).toBe(200);
  expect((await server.app.request(`/api/files/${PDF}`, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/pdf' }, body: new Uint8Array(pdf) })).status).toBe(200);
  const at = T0 - 60_000;
  const pushed = await postSync(server, {
    node: 'phone1',
    since: 0,
    records: [
      rec('note', NOTE, { kind: 'checklist', title: 'Courses', body: '', labelIds: [], pinned: false, archived: false, trashedAt: null, position: 'a0', createdAt: at, deletedAt: null }, at),
      rec('check', 'check-lait', { noteId: NOTE, text: 'lait', checked: false, position: 'a0', indent: 0, createdAt: at, deletedAt: null }, at),
      rec('attachment', PHOTO, { noteId: NOTE, mime: 'image/jpeg', width: 320, height: 240, bytes: photo.length, position: 'a0', uploaded: true, createdAt: at, deletedAt: null }, at),
      listNote('line-recettes', 'Recettes', at),
      rec('link', 'link-tarte', { noteId: 'line-recettes', url: 'https://example.fr/tarte', status: 'ready', autoFile: false, title: 'Tarte aux pommes', siteName: 'Exemple', kind: 'other', analyzedAt: at, createdAt: at, deletedAt: null }, at),
      rec('block', PAGE, { kind: 'page', parentId: null, text: 'Projet', position: 'a0', createdAt: at, deletedAt: null }, at),
      rec('block', SUB_PAGE, { kind: 'page', parentId: PAGE, text: 'Sous-page', position: 'a1', createdAt: at + 1, deletedAt: null }, at),
      rec('block', 'block-intro', { kind: 'text', parentId: PAGE, text: 'Le plan :', position: 'a0', createdAt: at, deletedAt: null }, at),
      rec('block', PDF_BLOCK, { kind: 'pdf', parentId: PAGE, fileId: PDF, fileName: 'Plan.pdf', mime: 'application/pdf', bytes: pdf.length, uploaded: true, position: 'a2', createdAt: at, deletedAt: null }, at),
    ],
  });
  expect(pushed.status).toBe(200);
  return { photo, pdf };
}

/** Waits for a restore started by a route to end. */
export async function settle(server: TestServer): Promise<void> {
  for (let i = 0; i < 500 && server.restore.running; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  expect(server.restore.running).toBe(false);
}

export async function putSettings(server: TestServer, body: unknown) {
  const response = await server.app.request('/api/settings', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}
