/**
 * What a paste in a block's text does: files become pictures, videos, PDFs or files after it;
 * blocks copied from a page come back whole; an address of this app becomes a mention, another
 * address a link (over the selected words, or as itself); HTML keeps its structure and marks;
 * one line goes in at the caret, several make blocks.
 */
import type { ClipboardEvent } from 'react';

import type { Block, BlockTarget } from '@unlease/notes/models/blocks';
import { mediaKindFor } from '@unlease/notes/services/media';
import { blocksFromText, type BlockDraft } from '@unlease/notes/services/pageText';
import { deleteRich, insertRich, parseRich, richFromPlain, richLength, serializeRich, setValue, sliceRich, type Run } from '@unlease/core/services/richText';
import { extractUrls } from '@unlease/core/services/url';

import { attachBlockFile, fileRefusal } from '../../../app/media/blockFiles';
import { deleteBlocks, insertDrafts, placeBlock } from '../../../app/store/pages';
import { showError } from '../../../app/store/ui';
import { readBlocks, htmlToDrafts } from './clipboard';
import { caretOf } from './editing';
import { focusBlock, type RichHandle } from './editorStore';
import { appPath, parseRoute } from '../../router';

/** An address of this app that names a page, a note, a collection or a link. */
export function appTarget(address: string): BlockTarget | null {
  let url: URL;
  try {
    url = new URL(address, location.origin);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  const route = parseRoute(appPath(url.pathname));
  if (route.name === 'page') return { type: 'page', id: route.id };
  if (route.name === 'note' || route.name === 'line') return { type: 'note', id: route.id };
  if (route.name === 'link') return { type: 'link', id: route.id };
  return null;
}

/** Blocks in a block's place (from its caret): the text before stays, what followed comes after them. */
export function pasteDrafts(page: string, block: Block, handle: RichHandle, drafts: readonly BlockDraft[], source: string): void {
  const only = drafts[0];
  if (!only) return;
  const runs = handle.runs();
  const { start, end } = caretOf(handle);
  // One line, or one block of text: in at the caret.
  if (drafts.length === 1 && !only.children && !only.extra && (only.kind === 'text' || !/\n/.test(source.trim()))) {
    const inserted: Run[] = only.kind === 'code' ? richFromPlain(only.text) : parseRich(only.text);
    handle.write(insertRich(deleteRich(runs, start, end), start, inserted), { start: start + richLength(inserted) });
    return;
  }
  const before = sliceRich(runs, 0, start);
  const after = sliceRich(runs, end);
  handle.write(before, null);
  const tail = richLength(after) > 0 ? [...drafts, { kind: 'text' as const, text: serializeRich(after) }] : drafts;
  const ids = insertDrafts(page, tail, { afterId: block.id });
  if (richLength(before) === 0 && block.kind === 'text') deleteBlocks(page, [block.id]);
  const last = ids[ids.length - 1];
  if (last) focusBlock(last, richLength(after) > 0 ? 'start' : 'end');
}

/** Files dropped or pasted: each its own block after `block` (in place of it when it is an empty paragraph). */
export async function pasteFiles(page: string, block: Block, files: readonly File[], empty: boolean): Promise<void> {
  let anchor = block.id;
  for (const [index, file] of files.entries()) {
    const kind = mediaKindFor(file.type);
    const id = placeBlock(page, anchor, { kind, fileName: file.name }, empty && index === 0);
    if (!id) continue;
    anchor = id;
    const outcome = await attachBlockFile(page, id, file);
    if (outcome !== 'ok') showError(fileRefusal(outcome, kind === 'image'));
  }
}

export function pasteInto(event: ClipboardEvent<HTMLElement>, page: string, block: Block, handle: RichHandle): void {
  const data = event.clipboardData;
  const files = [...data.files];
  const empty = richLength(handle.runs()) === 0 && block.kind === 'text';
  if (files.length > 0) {
    event.preventDefault();
    void pasteFiles(page, block, files, empty);
    return;
  }
  const copied = readBlocks(data);
  if (copied) {
    event.preventDefault();
    const ids = insertDrafts(page, copied, { afterId: block.id });
    if (empty) deleteBlocks(page, [block.id]);
    const last = ids[ids.length - 1];
    if (last) focusBlock(last, 'end');
    return;
  }
  const text = data.getData('text/plain');
  const trimmed = text.trim();
  const urls = extractUrls(trimmed);
  // One address and nothing else.
  if (/^\S+$/.test(trimmed) && urls.length === 1) {
    event.preventDefault();
    const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : urls[0]!;
    const runs = handle.runs();
    const { start, end } = caretOf(handle);
    const target = appTarget(address);
    if (target) {
      const mention: Run[] = [{ kind: 'mention', target }, { kind: 'text', text: ' ', marks: {} }];
      handle.write(insertRich(deleteRich(runs, start, end), start, mention), { start: start + 2 });
    } else if (start !== end) {
      handle.write(setValue(runs, start, end, 'a', address), { start, end });
    } else {
      const linked = setValue(richFromPlain(address), 0, address.length, 'a', address);
      handle.write(insertRich(runs, start, linked), { start: start + address.length });
    }
    return;
  }
  const html = data.getData('text/html');
  const fromHtml = html ? htmlToDrafts(html) : [];
  if (fromHtml.length > 0) {
    event.preventDefault();
    pasteDrafts(page, block, handle, fromHtml, text);
    return;
  }
  if (text) {
    event.preventDefault();
    pasteDrafts(page, block, handle, blocksFromText(text), text);
  }
}
