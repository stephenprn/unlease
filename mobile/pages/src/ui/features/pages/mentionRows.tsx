/**
 * What « @word » and « [[word » offer as they are typed in a page's words on the phone, riding over
 * the bar (`BlockBar`): « @ » a page, a person, an event, a note, a collection, a link (`TargetSearch`,
 * ranked as every « @ » of the suite ranks them) or a date (« @demain 14h », first once typed reads
 * as one); « [[ » a page to cite. A tap puts it in place of what was typed, and the caret after it.
 */
import React, { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import type { BlockTarget } from '@unlease/pages/models/blocks';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { dateShown, dateSuggestions, dateWords, daysFrom } from '@unlease/core/services/dates';
import { richToPlain, sliceRich, type AtomRun } from '@unlease/core/services/richText';
import { useLibraryStore } from '@app/store/libraryStore';

import type { SuggestionRow } from '@shared/ui/components';
import { richHandle } from './editorStore';
import { placeAtom, type MentionAsk } from './inline';
import { HitMark } from './TargetSheet';
import { searchTargets } from './TargetSearch';

/** Put in place of « @word » or « [[word » (and a « ]] » typed after the caret). */
function place(block: string, ask: MentionAsk, atom: AtomRun): void {
  const handle = richHandle(block);
  if (!handle) return;
  const runs = handle.runs();
  // The words still read as typed: else the caret moved on, and nothing is replaced.
  if (richToPlain(sliceRich(runs, ask.start, ask.end)) !== `${ask.typed}${ask.word}`) return;
  const end = ask.typed === '[[' && richToPlain(sliceRich(runs, ask.end, ask.end + 2)) === ']]' ? ask.end + 2 : ask.end;
  const placed = placeAtom(runs, ask.start, end, atom);
  handle.write(placed.runs, { start: placed.caret });
}

/** The rows for what is asked in `block` of `page`; none while nothing is. */
export function useMentionRows(ask: (MentionAsk & { readonly block: string }) | null, page: string): readonly SuggestionRow[] {
  const blocks = useLibraryStore(s => s.blocks);
  const people = useLibraryStore(s => s.people);
  const notes = useLibraryStore(s => s.notes);
  const links = useLibraryStore(s => s.links);
  const agenda = useLibraryStore(s => s.agenda);
  return useMemo(() => {
    if (!ask) return [];
    const cite = ask.typed === '[[';
    // « Voyage]] » typed whole searches « Voyage ».
    const word = cite ? ask.word.replace(/\]+$/, '') : ask.word;
    const library = useLibraryStore.getState();
    const hits = searchTargets(library, word, cite ? { sections: ['Pages'], perSection: 8 } : {}).filter(hit => !(hit.target.type === 'page' && hit.target.id === page));
    const targetRows = hits.map<SuggestionRow>(hit => ({
      key: `${hit.target.type}:${hit.target.id}`,
      title: hit.target.type === 'page' ? library.blocks[hit.target.id]?.text.trim() || t(UNTITLED_PAGE) : hit.title,
      detail: hit.detail,
      mark: <HitMark target={hit.target as BlockTarget} />,
      onPress: () => place(ask.block, ask, { kind: 'mention', target: hit.target }),
    }));
    if (cite) return targetRows;
    const now = Date.now();
    const dateRows = dateSuggestions(word, now).map<SuggestionRow>(run => ({
      key: `date:${run.date}:${run.time ?? ''}`,
      title: dateShown(run, now),
      // « Demain » says which day it is.
      detail: Math.abs(daysFrom(run.date, now)) <= 1 ? dateWords(run) : '',
      icon: 'calendar',
      onPress: () => place(ask.block, ask, run),
    }));
    // Typed, a date comes first (« @dem » is tomorrow before a page named Démo); with nothing typed, the mentions do.
    return word.trim() ? [...dateRows, ...targetRows] : [...targetRows, ...dateRows];
    // The library's parts: the rows follow a rename, a page made, a person added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, page, blocks, people, notes, links, agenda]);
}
