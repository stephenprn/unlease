/**
 * A link, read: its kept images in cut frames, what it is, what it costs, the facts Claude pulled
 * from the page, and the owner's own note about it. A side sheet over its collection, so the list
 * stays in view; its foot holds the two things done here (stamp it, open the page), and the
 * collection in its head is where the link is moved. A link nothing can read says why, with the
 * way on. Under the title, the modules its collection picked (promo codes, the way there...).
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { LINK_KIND_NAMES, shownTitle } from '@unlease/notes/models/entities';

import { useMinute } from '../../../app/hooks/useMinute';
import { useBlobUrl } from '../../../app/media/images';
import { deleteLink, moveLink, reanalyzeLink, saveTypedText } from '../../../app/store/actions';
import { onBeforePause } from '../../../app/sync/loop';
import { useLibraryStore } from '../../../app/store/library';
import { selectCanRead, selectServer, useSettingsStore } from '../../../app/store/settings';
import { showError, showSnack, showUndo } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { Menu } from '../../components/Menu';
import { Stamp, stampWord } from '../../components/Stamp';
import { TextField } from '../../components/TextField';
import { navigate, paths } from '../../router';
import { NARROW, useMedia } from '../../useMedia';
import { MoveDialog } from '../lines/MoveDialog';
import { KIND_ICONS } from './kindIcon';
import { ModuleBar } from './ModuleBar';
import { toggleDone } from './LinkRow';
import styles from './links.module.css';
import { OutlinedBox, useOutline } from '../../components/Outline';
import { ReadingTrack } from './ReadingTrack';

/** The facts' well: a panel's outline. */
const SAVE_DELAY_MS = 400;

/**
 * A kept picture in its frame, the frame cut to the picture's own proportion once it loads (4:5
 * until then), so a picture always fills it: no well showing beside a portrait or above a landscape.
 */
function GalleryFrame({ src, remote = false }: { src: string | null; remote?: boolean }) {
  const [ratio, setRatio] = useState<number | null>(null);
  // Its own outline for life, at whatever proportion the picture gives it.
  const { ref, vars } = useOutline<HTMLDivElement>('frame');
  return (
    <div ref={ref} className={styles.galleryItem} data-picture={ratio !== null || undefined} style={ratio !== null ? ({ ...vars, '--ratio': ratio } as CSSProperties) : vars}>
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          referrerPolicy={remote ? 'no-referrer' : undefined}
          onLoad={event => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
          }}
        />
      ) : null}
    </div>
  );
}

function GalleryImage({ blobId, fallback }: { blobId: string; fallback: string | null }) {
  const url = useBlobUrl(blobId, 'display');
  // Until the kept copy is here, or if it cannot come (offline): the first frame shows the page's own picture, as the row does.
  return <GalleryFrame src={url ?? fallback} remote={!url} />;
}

/** The kept pictures, side by side; with more than one, dots under them say which is in view (the phone's gallery). */
function Gallery({ blobIds, fallback }: { blobIds: readonly string[]; fallback: string | null }) {
  const strip = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const many = blobIds.length > 1;
  // The picture in view: the one whose start lies nearest the strip's (each is as wide as its own proportion).
  const follow = (): void => {
    const node = strip.current;
    if (!node) return;
    const start = node.getBoundingClientRect().left;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    [...node.children].forEach((child, index) => {
      const gap = Math.abs(child.getBoundingClientRect().left - start);
      if (gap < distance) {
        distance = gap;
        nearest = index;
      }
    });
    setShown(nearest);
  };
  return (
    <div>
      {/* Focusable, so the arrow keys scroll it too. */}
      <div ref={strip} className={styles.gallery} data-many={many || undefined} role="group" aria-label={t('Images de la page')} tabIndex={many ? 0 : undefined} onScroll={many ? follow : undefined}>
        {blobIds.map((blobId, index) => (
          <GalleryImage key={blobId} blobId={blobId} fallback={index === 0 ? fallback : null} />
        ))}
      </div>
      {many ? (
        <div className={styles.dots} role="img" aria-label={t('Image {index} sur {count}', { index: shown + 1, count: blobIds.length })}>
          {blobIds.map((blobId, index) => (
            <span key={blobId} className={styles.dot} data-dot data-shown={index === shown || undefined} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** `closing`: the route has moved on and the side sheet is animating out. */
export function LinkPanel({ id, closing = false, onClose }: { id: string; closing?: boolean; onClose: () => void }) {
  const live = useLibraryStore(s => s.links[id]);
  // Deleted from here, the link leaves looking as it was, not as "Ce lien n'existe plus".
  const [parting, setParting] = useState<typeof live>(undefined);
  const link = parting ?? live;
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  // Under 720px the link is a whole page, as on the phone: Back leaves it; wider, the side sheet closes.
  const narrow = useMedia(NARROW);
  const leave = narrow ? ({ icon: 'back', label: t('Retour') } as const) : ({ icon: 'close', label: t('Fermer') } as const);
  const reading = useSettingsStore(selectCanRead);
  // The facts' well, in its own outline.
  const { ref: factsRef, vars: factsVars } = useOutline<HTMLDListElement>('panel');
  const server = useSettingsStore(selectServer);
  const now = useMinute();
  const titleId = useId();
  // The sheet opens on its title, not on the close button: focus starts where reading does.
  const heading = useRef<HTMLHeadingElement>(null);
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed = useRef<string | null>(null);
  /** What the comment held when the draft began: the base for merging an edit from another device. */
  const typedFrom = useRef<string | null>(null);
  const more = useRef<HTMLButtonElement>(null);

  // The owner's note is saved as typed, and on the way out (of the panel or of the tab).
  useEffect(() => {
    const save = (): void => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const value = typed.current;
      const from = typedFrom.current;
      typed.current = null;
      typedFrom.current = null;
      if (value !== null) saveTypedText('link', id, 'comment', from, value);
    };
    const unsubscribe = onBeforePause(() => {
      save();
      setComment(null);
    });
    return () => {
      unsubscribe();
      save();
    };
  }, [id]);

  if (!link || link.deletedAt !== null) {
    return (
      <Layer open={!closing} onDismiss={onClose} kind="side" label={t('Lien introuvable')} routed panelClassName={styles.page}>
        <div className={styles.panelHead}>
          <IconButton icon={leave.icon} label={leave.label} onClick={onClose} />
        </div>
        <p className={`${styles.detailBody} t-body`}>{t('Ce lien n’existe plus.')}</p>
      </Layer>
    );
  }

  // Named as on its row: "Sac cabas" read from the address when nothing was read, the site as "Komono", never "KOMONO" or "fr.eryone3d".
  const { title, source } = linkRowText(link);
  // Under the title: what it is and where from; a plain link nobody read says only where ("Lien" would tell nothing).
  const meta = [link.title || link.kind !== 'other' ? LINK_KIND_NAMES[link.kind] : null, source].filter(Boolean).join(' · ');
  // The kept pictures are the server's copies: without a server the page's own picture stands in, as on the row.
  const kept = server ? link.imageIds : [];
  const pictured = kept.length > 0 || !!link.imageUrl;
  const value = comment ?? link.comment;
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const failed = link.status === 'failed';
  const doneAt = link.done ? link.doneAt : null;
  // A failed reading was tried, not read.
  const added = formatDay(link.createdAt, now);
  const read = link.analyzedAt === null ? '' : formatDay(link.analyzedAt, now);
  const dates = link.analyzedAt === null ? t('Ajouté le {added}', { added }) : link.status === 'ready' ? t('Ajouté le {added} · lu le {read}', { added, read }) : failed ? t('Ajouté le {added} · lecture tentée le {read}', { added, read }) : t('Ajouté le {added}', { added });
  const saveComment = (text: string): void => {
    const from = typedFrom.current;
    typed.current = null;
    typedFrom.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    saveTypedText('link', id, 'comment', from, text);
    setComment(null);
  };
  // With a server, what is missing is the key: straight to that section.
  const toAdmin = (): void => navigate(server ? `${paths.admin}#reading` : `${paths.admin}#server`);

  const head = (
    <div className={styles.heading}>
      <div className={styles.titleBlock}>
        <h2 id={titleId} ref={heading} tabIndex={-1} className={`${styles.detailTitle} t-editor-title`}>
          {title}
        </h2>
        {meta ? <p className="t-meta">{meta}</p> : null}
      </div>
      {link.price !== null || doneAt !== null ? (
        <div className={styles.priceRow}>
          {link.price !== null ? <span className="t-editor-title tabular">{formatPrice(link.price, link.currency)}</span> : null}
          {doneAt !== null ? <Stamp kind={link.kind} date={formatDay(doneAt, now)} /> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <Layer open={!closing} onDismiss={onClose} kind="side" labelledBy={titleId} full routed initialFocus={heading} panelClassName={styles.page}>
      <div className={styles.panelHead}>
        <IconButton icon={leave.icon} label={leave.label} onClick={onClose} shortcut={t('Échap')} />
        {line ? (
          <button type="button" className={`${styles.sign} t-title`} aria-label={t('Collection {title} : changer de collection', { title: shownTitle(line) })} aria-haspopup="dialog" onClick={() => setMoving(true)}>
            <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={30} className={styles.signEmblem} />
            <span className={styles.signName}>{shownTitle(line)}</span>
            <Icon name="chevronDown" size={18} className={styles.signChevron} />
          </button>
        ) : null}
        <span className={styles.panelHeadSpace} />
        <IconButton ref={more} icon="more" label={t('Plus d’actions')} hasPopup="menu" expanded={menu} onClick={() => setMenu(true)} />
      </div>
      <div className={styles.panelScroll}>
        {kept.length > 0 ? (
          <Gallery blobIds={kept} fallback={link.imageUrl} />
        ) : link.imageUrl ? (
          <div className={styles.gallery}>
            <GalleryFrame src={link.imageUrl} remote />
          </div>
        ) : null}

        <div className={styles.detailBody} data-bare={pictured ? undefined : true}>
          {/* The modules under the title, the whole width of the sheet, picture or not (the phone's). */}
          <div className={styles.headGroup}>
            {pictured ? (
              head
            ) : (
              // No picture: the kind's frame, as in the collection's row, beside the title.
              <div className={styles.headRow}>
                <OutlinedBox kind="frame" className={styles.headFrame}>
                  <Icon name={KIND_ICONS[link.kind]} size={30} />
                </OutlinedBox>
                {head}
              </div>
            )}
            <ModuleBar id={id} />
          </div>

          {link.status === 'pending' && reading ? (
            <p className={`${styles.reading} t-meta`}>
              <ReadingTrack width={96} />
              {t('Lecture de la page par Claude…')}
            </p>
          ) : null}
          {unread || failed ? (
            <OutlinedBox kind="panel" edge={false} className={`${styles.notice} ${failed ? styles.noticeFailed : ''} t-body`}>
              <Icon name={failed ? 'alert' : 'info'} size={20} />
              <div className={styles.noticeBody}>
                <p>
                  {failed
                    ? (link.error ? t(link.error) : t('La page n’a pas pu être lue.'))
                    : !server
                      ? t('Pas lu : Claude lit les liens depuis votre serveur {app}. Connectez-le dans l’administration.', { app: APP_NAME })
                      : !reading
                        ? t('Pas lu : ajoutez une clé API Claude dans l’administration pour que les liens soient lus.')
                        : t('Ce lien a été gardé sans être lu.')}
                </p>
                {reading ? (
                  <Button kind="text" small className={styles.noticeAction} onClick={() => reanalyzeLink(id)}>
                    {failed ? t('Réessayer') : t('Lire la page')}
                  </Button>
                ) : unread ? (
                  <Button kind="text" small className={styles.noticeAction} onClick={toAdmin}>
                    {t('Administration')}
                  </Button>
                ) : null}
              </div>
            </OutlinedBox>
          ) : null}

          {link.summary || link.attributes.length > 0 ? (
            <div className={styles.about}>
              {link.summary ? <p className={`${styles.summary} t-body`}>{link.summary}</p> : null}
              {link.attributes.length > 0 ? (
                <dl ref={factsRef} className={`${styles.factsWell} paper`} style={factsVars}>
                  {link.attributes.map((attribute, index) => (
                    <div key={`${attribute.label}-${index}`} className={styles.fact}>
                      <dt className="t-meta">{attribute.label}</dt>
                      <dd className="t-body">{attribute.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}

          <TextField
            label={t('Votre note')}
            value={value}
            multiline
            maxLength={5000}
            placeholder={t('Pour qui, pourquoi, quand…')}
            inputClassName={styles.noteInput}
            onChange={text => {
              if (typed.current === null) typedFrom.current = useLibraryStore.getState().links[id]?.comment ?? '';
              typed.current = text;
              setComment(text);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => saveComment(text), SAVE_DELAY_MS);
            }}
            onBlur={() => {
              if (typed.current !== null) saveComment(typed.current);
            }}
          />

          <div className={styles.details}>
            <p className={`${styles.urlLine} t-meta`}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.url}
              </a>
            </p>
            <p className="t-meta">{dates}</p>
          </div>
        </div>
      </div>

      {/* The two things done here, always in reach at the sheet's foot. */}
      <div className={styles.panelFoot}>
        <Button kind="tonal" icon={link.done ? 'undo' : 'stamp'} onClick={() => toggleDone(id)}>
          {link.done ? t('Remettre à faire') : stampWord(link.kind)}
        </Button>
        <Button icon="external" href={link.url} className={styles.open}>
          {t('Ouvrir la page')}
        </Button>
      </div>

      <Menu
        open={menu}
        anchor={more}
        onDismiss={() => setMenu(false)}
        label={t('Plus d’actions')}
        items={[
          { label: t('Changer de collection'), icon: 'transfer', onSelect: () => setMoving(true) },
          {
            label: t('Copier l’adresse'),
            icon: 'copy',
            // Over plain http (a LAN address) the browser gives no clipboard: say so rather than nothing.
            onSelect: () =>
              navigator.clipboard
                ? navigator.clipboard.writeText(link.url).then(
                    () => showSnack(t('Adresse copiée'), undefined, { tone: 'success' }),
                    () => showError(t('Impossible de copier l’adresse')),
                  )
                : showError(t('Impossible de copier l’adresse')),
          },
          ...(typeof navigator.share === 'function'
            ? [{ label: t('Partager'), icon: 'share' as const, onSelect: () => void navigator.share({ url: link.url, title: link.title || undefined }).catch(() => {}) }]
            : []),
          // Reading again only means something when the server reads links.
          ...(reading ? [{ label: link.status === 'skipped' ? t('Lire la page') : t('Relire la page'), icon: 'refresh' as const, onSelect: () => reanalyzeLink(id) }] : []),
          {
            label: t('Supprimer'),
            icon: 'trash',
            danger: true,
            separatorBefore: true,
            onSelect: () => {
              setParting(link);
              const undo = deleteLink(id);
              onClose();
              showUndo(t('Lien supprimé'), undo);
            },
          },
        ]}
      />
      <MoveDialog
        open={moving}
        currentLineId={link.noteId}
        onDismiss={() => setMoving(false)}
        onPick={target => {
          const undo = moveLink(id, target);
          const into = useLibraryStore.getState().notes[target];
          showUndo(t('Déplacé dans {collection}', { collection: into ? shownTitle(into) : '' }), undo);
        }}
      />
    </Layer>
  );
}
