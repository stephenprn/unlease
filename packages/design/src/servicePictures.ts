/**
 * The pictures a service takes besides its stylesheet (`customCss.ts`), made from the appearance:
 * Seafile's logo and favicon (the mark in the primary, `markColors`) and its login page's background
 * (the ground by day, as Seafile shows that page to someone signed out, with its grain), at the sizes
 * Seafile's settings ask for. Drawn and encoded here, so both apps hand out the same files.
 */
import { localized, tx } from '@unlease/core/i18n';
import { markColors, resolveAppearance, type Appearance } from './appearance';
import { jpegFile } from './jpeg';
import { MARK_CARD, MARK_PEBBLE, MARK_VIEWBOX } from './mark';
import { icoFile, pngFile } from './png';
import { createRaster, drawGround, fillPath, type Pause, type Raster } from './raster';

export const SERVICE_PICTURES = ['logo', 'favicon', 'login'] as const;

export type ServicePicture = (typeof SERVICE_PICTURES)[number];

/** A file to hand to the person: its name, its type and its bytes. */
export interface PictureFile {
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** What the dialog says of Seafile's pictures, below its stylesheet: where they go, in Seafile's own words, and when one cannot be saved. */
export const SERVICE_PICTURES_WORDS = localized({
  where: tx('Et ses images, à vos couleurs : dans Administration système, Paramètres, « Changer » sous « Logo », « Favicon » et « Image de fond de connexion ».'),
  failed: tx('Impossible d’enregistrer l’image'),
});

/** Each picture's button, what it does in full, and the slip once it is saved. */
export const SERVICE_PICTURE_WORDS: Readonly<Record<ServicePicture, { readonly name: string; readonly save: string; readonly saved: string }>> = {
  logo: localized({ name: tx('Logo'), save: tx('Enregistrer le logo pour Seafile'), saved: tx('Logo pour Seafile enregistré') }),
  favicon: localized({ name: tx('Favicon'), save: tx('Enregistrer le favicon pour Seafile'), saved: tx('Favicon pour Seafile enregistré') }),
  login: localized({ name: tx('Fond de connexion'), save: tx('Enregistrer le fond de connexion pour Seafile'), saved: tx('Fond de connexion pour Seafile enregistré') }),
};

/** Square: Seafile draws its logo 32 high in its header and 40 on its login page, as wide as it comes. */
const LOGO_SIZE = 256;

/** What a browser tab and Windows pick from. */
const FAVICON_SIZES = [16, 32, 48] as const;

/** Seafile's size for it; covered over the window, so the window's own shape crops it. */
const LOGIN = { width: 2400, height: 1600, quality: 92 } as const;

/** The ground's grain at the screens' strength (`build_grain.py`), each grain two pixels square: Seafile shows the picture at about 0.6 of its size on a laptop, so a grain stays about one screen pixel, as in the apps. */
const LOGIN_GRAIN = { sigma: 13, size: 2, seed: 1947 } as const;

/** The mark on its pebble, `size` pixels square, on nothing. */
function markRaster(size: number, primary: string): Raster {
  const raster = createRaster(size, size);
  const { tile, card } = markColors(primary);
  const place = { scale: size / MARK_VIEWBOX, x: 0, y: 0 };
  fillPath(raster, MARK_PEBBLE, place, tile);
  fillPath(raster, MARK_CARD, place, card, 'evenodd');
  return raster;
}

/** A picture for Seafile in this appearance; the login background, the large one, gives way to `pause` as it goes. */
export async function servicePicture(picture: ServicePicture, appearance: Appearance, pause?: Pause): Promise<PictureFile> {
  switch (picture) {
    case 'logo':
      return { name: 'seafile-logo.png', mime: 'image/png', bytes: pngFile(markRaster(LOGO_SIZE, appearance.primary)) };
    case 'favicon':
      return { name: 'seafile-favicon.ico', mime: 'image/x-icon', bytes: icoFile(FAVICON_SIZES.map(size => ({ size, png: pngFile(markRaster(size, appearance.primary)) }))) };
    case 'login': {
      const raster = createRaster(LOGIN.width, LOGIN.height);
      await drawGround(raster, resolveAppearance(appearance, 'light').ground, appearance.grain ? LOGIN_GRAIN : null, pause);
      return { name: 'seafile-login-bg.jpg', mime: 'image/jpeg', bytes: await jpegFile(raster, LOGIN.quality, pause) };
    }
  }
}
