/** French for Wallet's package: its kinds, types, expiries, search and settings. Keys are the English exactly as written in `t()` / `tx()`. */
import type { Dictionary } from '@unlease/core/i18n';

export const FR_SHARED: Dictionary = {
  // Kinds
  'Card': 'Carte',
  'Gift card': 'Carte cadeau',
  'Emergency card': 'Carte d’urgence',
  'Identity card': 'Carte d’identité',
  'Passport': 'Passeport',
  'Driving licence': 'Permis de conduire',
  'Health insurance card': 'Carte Vitale',
  'Residence permit': 'Titre de séjour',
  'Other identity paper': 'Autre pièce d’identité',
  'Document': 'Document',

  // Document types
  'Taxes': 'Impôts',
  'Work and pay': 'Travail et salaire',
  'Bank and loans': 'Banque et crédits',
  'Insurance': 'Assurance',
  'Housing': 'Logement',
  'Property': 'Propriété',
  'Bills': 'Factures',
  'Health': 'Santé',
  'Vehicle': 'Véhicule',
  'Purchases and warranties': 'Achats et garanties',
  'Family and civil status': 'Famille et état civil',
  'Education': 'Études',
  'Other': 'Autre',

  // Barcodes
  'QR code': 'QR code',
  'Type the number written under the barcode.': 'Tapez le numéro écrit sous le code-barres.',
  '{format} holds digits only.': '{format} ne contient que des chiffres.',
  'ITF holds an even number of digits.': 'ITF contient un nombre pair de chiffres.',
  '{format} holds {count} digits.': '{format} contient {count} chiffres.',
  'The last digit doesn’t match the others: check the number, or scan the card.': 'Le dernier chiffre ne correspond pas aux autres : vérifiez le numéro, ou scannez la carte.',
  '{format} can’t hold some of these characters.': '{format} ne peut pas contenir certains de ces caractères.',
  'This is too long for a barcode.': 'C’est trop long pour un code-barres.',
  'This number can’t be drawn as a barcode.': 'Ce numéro ne peut pas être dessiné en code-barres.',

  // Expiry and keeping
  'Expires today': 'Expire aujourd’hui',
  'Expired {time} ago': 'A expiré il y a {time}',
  'Expires in {time}': 'Expire dans {time}',
  'Valid until {date}': 'Valable jusqu’au {date}',
  'Keep for good': 'À garder pour toujours',
  'Keep until your pension is settled': 'À garder jusqu’à la liquidation de votre retraite',
  'Keep until {date}': 'À garder jusqu’au {date}',
  'Many countries ask for 6 months of validity on arrival: renew it now if you travel soon.': 'Beaucoup de pays demandent 6 mois de validité à l’arrivée : renouvelez-le dès maintenant si vous voyagez bientôt.',
  'Spend what is left on it before it expires.': 'Dépensez ce qu’il reste dessus avant qu’elle expire.',
  'Time to renew it, or to replace it with the new one.': 'Il est temps de le renouveler, ou de le remplacer par le nouveau.',
  'day': 'jour',
  'days': 'jours',
  'month': 'mois',
  'months': 'mois',
  'year': 'an',
  'years': 'ans',

  // Erasing
  'Cards': 'Cartes',
  'No cards': 'Aucune carte',
  'card [wallet]': 'carte',
  'cards [wallet]': 'cartes',
  'Identity papers': 'Papiers d’identité',
  'No identity papers': 'Aucun papier d’identité',
  'identity paper': 'papier d’identité',
  'identity papers': 'papiers d’identité',
  'Documents': 'Documents',
  'No documents': 'Aucun document',
  'document': 'document',
  'documents': 'documents',
  'Locked papers': 'Papiers verrouillés',
  'paper': 'papier',
  'papers': 'papiers',

  // Settings
  'Vault': 'Coffre',
  'At the till': 'À la caisse',
  'Lock papers again': 'Reverrouiller les papiers',
  'Unlock with your fingerprint': 'Déverrouiller avec l’empreinte',
  'Change the passphrase': 'Changer la phrase secrète',
  'Recovery kit': 'Kit de secours',
  'Keep cards open in this browser': 'Garder les cartes ouvertes dans ce navigateur',
  'Brighten the screen': 'Éclairer l’écran',
  'Barcode at the top of the screen': 'Code-barres en haut de l’écran',

  // Watermark
  'Copy for {recipient} – {purpose} – {date}': 'Copie destinée à {recipient} – {purpose} – {date}',
  'Copy for {recipient} – {date}': 'Copie destinée à {recipient} – {date}',
  'Copy – {purpose} – {date}': 'Copie – {purpose} – {date}',
  'Copy – {date}': 'Copie – {date}',
};
