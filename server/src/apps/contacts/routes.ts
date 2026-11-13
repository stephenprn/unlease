/**
 * Contacts' routes, beside the platform's under `/api` and behind the same token, answered while
 * Contacts is on: a photo taken from an address (`photos.ts`), for imports from Google.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { CONTACT_PHOTO_PATH, isContactPhotoRequest } from '@unlease/contacts/sync/photos';
import type { Env } from '../types';
import type { PhotoTaker } from './photos';

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

export function contactsRoutes(app: Hono<Env>, { photos }: { readonly photos: PhotoTaker }): void {
  app.post(CONTACT_PHOTO_PATH, bodyLimit({ maxSize: 16 * 1024, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid request' }, 400);
    }
    if (!isContactPhotoRequest(body)) return c.json({ error: 'Adresse de photo invalide' }, 400);
    const outcome = await photos.take(body);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    return c.json(outcome.answer, 200, { 'Cache-Control': 'no-store' });
  });
}
