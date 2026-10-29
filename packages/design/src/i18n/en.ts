/** English for the design system (`packages/design`): colours, grounds, emblems. Keys are the French exactly as written in `t()` / `tx()`, single-quoted, one per line. */
import type { Dictionary } from '@unlease/core/i18n';

export const DESIGN_ENGLISH: Dictionary = {
  // Pigments
  'Safran': 'Saffron',
  'Orange brûlé': 'Burnt orange',
  'Rouge': 'Red',
  'Framboise': 'Raspberry',
  'Bordeaux': 'Burgundy',
  'Lavande': 'Lavender',
  'Violet': 'Violet',
  'Bleu': 'Blue',
  'Sarcelle': 'Teal',
  'Vert': 'Green',
  'Olive': 'Olive',
  'Ocre': 'Ochre',
  'Brun': 'Brown',
  'Sauge': 'Sage',

  // Gradients
  'Aube': 'Dawn',
  'Lagon': 'Lagoon',
  'Matcha latte': 'Matcha latte',
  'Abricot': 'Apricot',
  'Brume lavande': 'Lavender mist',
  'Nacre': 'Mother-of-pearl',
  'Sous-bois': 'Undergrowth',
  'Terre cuite': 'Terracotta',

  // Papers
  'Pointillé': 'Dotted',
  'Quadrillé': 'Squared',
  'Ligné': 'Ruled',
  'Seyès': 'Seyès',
  'Millimétré': 'Graph paper',
  'Isométrique': 'Isometric',
  'Moucheté': 'Speckled',

  // Emblems
  'Feuille': 'Leaf',
  'Étoile': 'Star',
  'Soleil': 'Sun',
  'Fleur': 'Flower',
  'Trèfle': 'Clover',
  'Galet': 'Pebble',
  'Cœur': 'Heart',
  'Lune': 'Moon',
  'Goutte': 'Drop',
  'Nuage': 'Cloud',
  'Vague': 'Wave',
  'Poisson': 'Fish',
  'Oiseau': 'Bird',
  'Arche': 'Arch',

  // Appearance: palettes, grounds, gradients
  'Myrtille': 'Blueberry',
  'Glycine': 'Wisteria',
  'Pivoine': 'Peony',
  'Mimosa': 'Mimosa',
  'Ardoise': 'Slate',
  'Mousse': 'Moss',
  'Principale': 'Primary',
  'Couleur principale': 'Primary colour',
  'Le bouton +, la sélection et les interrupteurs': 'The + button, selection and switches',
  'Accent': 'Accent',
  'Couleur d’accent': 'Accent colour',
  'Les boutons d’action, les liens et le texte sélectionné': 'Action buttons, links and selected text',
  'La couleur principale marque ce qui est choisi : le bouton +, la sélection, les interrupteurs. L’accent fait agir : les boutons d’action et les liens. Une couleur choisie à la main est gardée telle quelle quand le texte reste lisible dessus ; sinon elle garde sa teinte et change juste assez de clarté.':
    'The primary colour marks what is chosen: the + button, selection, switches. The accent acts: action buttons and links. A colour picked by hand is kept as it is when text stays readable on it; otherwise it keeps its hue and changes just enough in lightness.',
  'Le fond reste clair le jour et sombre la nuit, pour que le texte se lise toujours : chaque fond a sa version de nuit. Une couleur choisie à la main est gardée telle quelle quand elle s’y prête ; sinon elle garde sa teinte et s’éclaircit ou s’assombrit juste ce qu’il faut.':
    'The background stays light by day and dark at night, so text always reads: every background has its night version. A colour picked by hand is kept as it is when it fits; otherwise it keeps its hue and lightens or darkens just as much as needed.',
  'Brume': 'Mist',
  'Opale': 'Opal',
  'Sorbet': 'Sorbet',
  'Crème': 'Cream',
  'Lin': 'Linen',
  'Pierre': 'Stone',
  'Menthe': 'Mint',
  'Ciel': 'Sky',
  'Lilas': 'Lilac',
  'Rose': 'Rose',
  'Fondu': 'Blend',
  'Nuées': 'Clouds',
  'Votre couleur': 'Your colour',
  'Votre dégradé': 'Your gradient',
  'Ajustée le jour et la nuit pour rester lisible.': 'Adjusted by day and at night to stay readable.',
  'Ajustée le jour pour rester lisible.': 'Adjusted by day to stay readable.',
  'Ajustée la nuit pour rester lisible.': 'Adjusted at night to stay readable.',
  'Gardée telle quelle le jour et la nuit.': 'Kept as picked, by day and at night.',
  'Principale de {palette}': '{palette} primary',
  'Accent de {palette}': '{palette} accent',

  // The look carried to other services (customCss.ts)
  'Habiller vos autres services…': 'Style your other services…',
  'Habiller vos autres services': 'Style your other services',
  'Le CSS de vos couleurs et de votre fond, de jour comme de nuit, à coller dans chacun. Reprenez-le après avoir changé l’apparence.':
    'The CSS of your colours and background, by day and at night, to paste into each. Copy it again after changing the appearance.',
  'Seafile, Seerr et Immich peuvent aussi prendre ces couleurs.': 'Seafile, Seerr and Immich can take these colours too.',
  'Voir': 'View',
  'Copier': 'Copy',
  'Impossible de copier le CSS': 'Could not copy the CSS',
  'Copier le CSS pour Seafile': 'Copy the CSS for Seafile',
  'Collez-le dans Administration système, Paramètres, « CSS personnalisé », validez avec ✓, puis cochez « Utiliser un CSS personalisé ».':
    'Paste it in System Admin, Settings, “Custom CSS”, confirm with ✓, then tick “Use custom CSS”.',
  'CSS pour Seafile copié': 'CSS for Seafile copied',
  'Copier le CSS pour Seerr': 'Copy the CSS for Seerr',
  'Toujours sombre, Seerr prend vos couleurs de nuit. Il n’a pas encore de réglage pour le CSS : ajoutez-le avec une extension comme Stylus, ou par votre proxy.':
    'Always dark, Seerr takes your night colours. It has no setting for CSS yet: add it with an extension such as Stylus, or through your proxy.',
  'CSS pour Seerr copié': 'CSS for Seerr copied',
  'Copier le CSS pour Immich': 'Copy the CSS for Immich',
  'Collez-le dans Administration, Paramètres, « Paramètres du thème », « CSS personnalisé », puis « Sauvegarder ».':
    'Paste it in Administration, Settings, “Theme Settings”, “Custom CSS”, then “Save”.',
  'CSS pour Immich copié': 'CSS for Immich copied',

  // Seafile's pictures (servicePictures.ts)
  'Et ses images, à vos couleurs : dans Administration système, Paramètres, « Changer » sous « Logo », « Favicon » et « Image de fond de connexion ».':
    'And its pictures, in your colours: in System Admin, Settings, “Change” under “Logo”, “Favicon” and “Login background image”.',
  'Impossible d’enregistrer l’image': 'Could not save the picture',
  'Logo': 'Logo',
  'Enregistrer le logo pour Seafile': 'Save the logo for Seafile',
  'Logo pour Seafile enregistré': 'Logo for Seafile saved',
  'Favicon': 'Favicon',
  'Enregistrer le favicon pour Seafile': 'Save the favicon for Seafile',
  'Favicon pour Seafile enregistré': 'Favicon for Seafile saved',
  'Fond de connexion': 'Login background',
  'Enregistrer le fond de connexion pour Seafile': 'Save the login background for Seafile',
  'Fond de connexion pour Seafile enregistré': 'Login background for Seafile saved',
};
