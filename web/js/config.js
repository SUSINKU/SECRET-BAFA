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
  apiKey: "AIzaSyCjL5Gtv5rEX3GNQP62_-NNi9mz2Ag__pA",
  authDomain: "secretbafa.firebaseapp.com",
  projectId: "secretbafa",
  storageBucket: "secretbafa.firebasestorage.app",
  messagingSenderId: "230853647850",
  appId: "1:230853647850:web:7e2573325ad8f6e2632693"
};

// ─────────────── ne touche pas à ce qui suit ───────────────
export { firebaseConfig };

/** Domaine technique des comptes : les stagiaires ne saisissent qu'un prénom. */
export const ACCOUNT_DOMAIN = 'joueurs.secret-bafa';
