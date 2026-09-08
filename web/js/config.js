// ═══════════════════════════════════════════════════════════════════════
//  Configuration du projet Firebase de SECRET BAFA.
//
//  Ce bloc vient de la console Firebase : ⚙ Paramètres du projet → « Vos
//  applications » → application Web → « Configuration du SDK ». Pour changer
//  de projet, il suffit de le remplacer par celui du nouveau.
//
//  Ces valeurs ne sont pas des secrets : elles désignent publiquement le
//  projet et n'ouvrent aucun droit. Ce sont les règles de sécurité
//  (firestore.rules) qui décident de ce que chacun peut lire et écrire.
// ═══════════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyBs3uMkDmhPGOtTDP-scxWRw6B_EQ5P87Y",
  authDomain: "secret-bafa-7ba35.firebaseapp.com",
  projectId: "secret-bafa-7ba35",
  storageBucket: "secret-bafa-7ba35.firebasestorage.app",
  messagingSenderId: "129771006978",
  appId: "1:129771006978:web:7684e9ce1ed4969b180b1b",
  measurementId: "G-BHGB1T89FB"
};

// ─────────────── ne touche pas à ce qui suit ───────────────
export { firebaseConfig };

/** Domaine technique des comptes : les stagiaires ne saisissent qu'un prénom. */
export const ACCOUNT_DOMAIN = 'joueurs.secret-bafa';
