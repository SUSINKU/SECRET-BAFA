/**
 * Réglages Firebase — à remplir avec les valeurs de TON projet.
 *
 * Où les trouver : console Firebase → ⚙ Paramètres du projet → « Vos
 * applications » → application Web → « Configuration du SDK ». Copie les six
 * valeurs ci-dessous.
 *
 * Ces valeurs ne sont pas des secrets : elles identifient le projet, elles
 * n'ouvrent aucun droit. Ce sont les règles de sécurité (firestore.rules) qui
 * décident de ce que chacun peut lire et écrire.
 */
export const firebaseConfig = {
  apiKey: 'À_REMPLIR',
  authDomain: 'À_REMPLIR.firebaseapp.com',
  projectId: 'À_REMPLIR',
  storageBucket: 'À_REMPLIR.appspot.com',
  messagingSenderId: 'À_REMPLIR',
  appId: 'À_REMPLIR',
};

/** Domaine technique des comptes : les stagiaires n'entrent qu'un prénom. */
export const ACCOUNT_DOMAIN = 'joueurs.secret-bafa';
