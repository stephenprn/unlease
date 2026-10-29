/**
 * « Habiller vos autres services »: the stylesheets that give Seafile, Seerr and Immich this browser's
 * colours and ground (`customCss`), each with where it goes and a copy button, its text shown too (to
 * select by hand where the browser gives no clipboard), and Seafile's pictures to download
 * (`servicePictures`). Opened from the ground's section and from the slip that follows a change of
 * colours. The phone's `ServicesCssSheet`.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { CSS_SERVICES, cssServiceName, CUSTOM_CSS_WORDS, customCss, customCssKey, SERVICES_CSS_WORDS, type CssService } from '@unlease/design/customCss';
import { SERVICE_PICTURE_WORDS, SERVICE_PICTURES, SERVICE_PICTURES_WORDS, servicePicture, type ServicePicture } from '@unlease/design/servicePictures';

import { selectAppearance, useSettingsStore } from '../../../app/store/settings';
import { selectServicesCssOpen, setServicesCssOpen, showError, showSnack, useUiStore } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Layer } from '../../components/Layer';
import { copyText, saveFile } from '../../dom';
import styles from './appearance.module.css';

/** How long the colours must stay put before the slip comes: a person trying swatches is not interrupted. */
const HINT_DELAY_MS = 1500;

/** Once a session: the slip already came. */
let hinted = false;

/** Réglages: once the colours or the ground change, a slip says the other services can take them too, with the way to their sheets. */
export function useServicesCssHint(): void {
  const key = useSettingsStore(state => customCssKey(state.appearance));
  const shown = useRef(key);
  useEffect(() => {
    if (hinted || key === shown.current) return;
    const timer = setTimeout(() => {
      hinted = true;
      showSnack(SERVICES_CSS_WORDS.hint, { label: SERVICES_CSS_WORDS.see, run: () => setServicesCssOpen(true) });
    }, HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);
}

export function ServicesCssDialog() {
  const open = useUiStore(selectServicesCssOpen);
  const titleId = useId();
  const close = (): void => setServicesCssOpen(false);
  return (
    <Layer open={open} onDismiss={close} labelledBy={titleId}>
      <ServicesCssBody titleId={titleId} onClose={close} />
    </Layer>
  );
}

function ServicesCssBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const appearance = useSettingsStore(selectAppearance);
  const sheets = useMemo(() => CSS_SERVICES.map(service => [service, customCss(service, appearance)] as const), [appearance]);
  return (
    <DialogFrame title={SERVICES_CSS_WORDS.title} titleId={titleId} onClose={onClose} className={styles.servicesDialog}>
      <p className="t-meta">{SERVICES_CSS_WORDS.intro}</p>
      {sheets.map(([service, css]) => (
        <ServiceSheet key={service} service={service} css={css} />
      ))}
    </DialogFrame>
  );
}

/** One service: its name and the copy button, where the sheet goes, and the sheet itself. */
function ServiceSheet({ service, css }: { service: CssService; css: string }) {
  const nameId = useId();
  const words = CUSTOM_CSS_WORDS[service];
  const copy = async (): Promise<void> => {
    if (await copyText(css)) showSnack(words.copied, undefined, { tone: 'success' });
    else showError(SERVICES_CSS_WORDS.notCopied);
  };
  return (
    <section className={styles.service} aria-labelledby={nameId}>
      <div className={styles.serviceHead}>
        <h3 id={nameId} className="t-body-strong">
          {cssServiceName(service)}
        </h3>
        <Button kind="tonal" small icon="copy" title={words.copy} onClick={() => void copy()}>
          {SERVICES_CSS_WORDS.copy}
        </Button>
      </div>
      <p className="t-meta">{words.where}</p>
      <textarea className={styles.serviceCode} value={css} readOnly spellCheck={false} aria-labelledby={nameId} onFocus={event => event.currentTarget.select()} />
      {service === 'seafile' ? <ServicePictures /> : null}
    </section>
  );
}

/** Lets the page answer between two stretches of a picture's making. */
const giveWay = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Seafile's pictures in this browser's colours: where they go, then one download each. */
function ServicePictures() {
  const appearance = useSettingsStore(selectAppearance);
  const [making, setMaking] = useState<ServicePicture | null>(null);
  const download = async (picture: ServicePicture): Promise<void> => {
    setMaking(picture);
    try {
      const file = await servicePicture(picture, appearance, giveWay);
      saveFile(file.bytes, file.name, file.mime);
    } catch {
      showError(SERVICE_PICTURES_WORDS.failed);
    } finally {
      setMaking(null);
    }
  };
  return (
    <div className={styles.servicePictures}>
      <p className="t-meta">{SERVICE_PICTURES_WORDS.where}</p>
      <div className={styles.servicePictureButtons}>
        {SERVICE_PICTURES.map(picture => (
          <Button key={picture} kind="tonal" small icon="download" busy={making === picture} disabled={making !== null} title={SERVICE_PICTURE_WORDS[picture].save} onClick={() => void download(picture)}>
            {SERVICE_PICTURE_WORDS[picture].name}
          </Button>
        ))}
      </div>
    </div>
  );
}
