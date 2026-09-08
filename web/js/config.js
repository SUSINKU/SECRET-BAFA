// ═══════════════════════════════════════════════════════════════════════
//  UNE SEULE CHOSE À FAIRE ICI.
//
//  Dans la console Firebase : ⚙ Paramètres du projet → « Vos applications »
//  → ton application Web → « Configuration du SDK ». Firebase affiche un bloc
//  qui commence par « const firebaseConfig = { ». Copie-le, et remplace le
//  bloc ci-dessous par le tien. Rien d'autre à toucher dans ce fichier.
//
//  Ces valeurs ne sont pas des secrets : elles désignent le projet, elles
//  n'ouvrent aucun droit. Ce sont les règles de sécurité (firestore.rules)
//  qui décident de ce que chacun peut lire et écrire.
// ═══════════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "À_REMPLIR",
  authDomain: "À_REMPLIR.firebaseapp.com",
  projectId: "À_REMPLIR",
  storageBucket: "À_REMPLIR.firebasestorage.app",
  messagingSenderId: "À_REMPLIR",
  appId: "À_REMPLIR"
};

// ─────────────── ne touche pas à ce qui suit ───────────────
export { firebaseConfig };

/** Domaine technique des comptes : les stagiaires ne saisissent qu'un prénom. */
export const ACCOUNT_DOMAIN = 'joueurs.secret-bafa';
