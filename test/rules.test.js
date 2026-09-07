'use strict';

/**
 * Tests des règles de sécurité Firestore, contre l'émulateur.
 *
 * C'est le filet de sécurité du jeu : sans serveur, ce sont ces règles — et
 * elles seules — qui empêchent un stagiaire curieux de lire les secrets des
 * autres ou les votes avant le reveal.
 *
 * Lancement : npm run test:rules
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  query, where, writeBatch,
} = require('firebase/firestore');

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

let env;
const ALICE = 'uid-alice';
const BRUNO = 'uid-bruno';
const CHLOE = 'uid-chloe';
const ANIM = 'uid-anim';

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Pose un état de départ en contournant les règles. */
async function seed(writer) {
  await env.withSecurityRulesDisabled(async (ctx) => writer(ctx.firestore()));
}

async function baseGame(extra = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, 'game/state'), Object.assign({
      gameName: 'Secret BAFA', phase: 'lobby', day: 0, roundStatus: null,
      pointsCorrect: 3, pointsWrong: 1,
    }, extra));
    await setDoc(doc(db, 'admins', ANIM), { since: 1 });
    await setDoc(doc(db, 'adminLock/lock'), { claimed: true });
    for (const [uid, name] of [[ALICE, 'Alice'], [BRUNO, 'Bruno'], [CHLOE, 'Chloé']]) {
      await setDoc(doc(db, 'players', uid), { name, nameKey: name.toLowerCase() });
    }
  });
}

/** Un secret déposé par `uid`, avec son lien d'auteur et son marque-page privé. */
async function seedSecret(uid, secretId, text, solvedDay = null) {
  await seed(async (db) => {
    await setDoc(doc(db, 'secrets', secretId), { text, code: secretId.slice(0, 3).toUpperCase(), sortKey: secretId, solvedDay });
    await setDoc(doc(db, 'authorOf', secretId), { uid });
    await setDoc(doc(db, 'mine', uid), { secretId });
  });
}

/* ══════════════════════════════════════════════ le cœur du secret ════ */

check("un joueur ne peut pas lire le lien entre un secret et son auteur", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(getDoc(doc(as(BRUNO), 'authorOf/s-alice')));
  await assertFails(getDoc(doc(as(ALICE), 'authorOf/s-alice')));  // même son auteur
  await assertSucceeds(getDoc(doc(as(ANIM), 'authorOf/s-alice')));
});

check("un joueur ne peut pas lister les liens d'auteur", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(getDocs(collection(as(BRUNO), 'authorOf')));
});

check("un joueur ne peut pas savoir quel secret appartient à qui", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(getDoc(doc(as(BRUNO), 'mine', ALICE)));
  await assertSucceeds(getDoc(doc(as(ALICE), 'mine', ALICE)));
  await assertSucceeds(getDoc(doc(as(ANIM), 'mine', ALICE)));
});

check("le texte des secrets, lui, est bien public", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  const snap = await assertSucceeds(getDoc(doc(as(BRUNO), 'secrets/s-alice')));
  assert.strictEqual(snap.data().text, 'Un secret bien à moi, assez long.');
  assert.ok(!('uid' in snap.data()), "le document secret ne doit contenir aucun auteur");
});

/* ══════════════════════════════════════════════════════ les votes ════ */

check("un joueur ne peut pas lire le vote d'un autre", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await seed(async (db) => {
    await setDoc(doc(db, 'votes/1_' + BRUNO), { day: 1, voter: BRUNO, secretId: 's-alice', guess: CHLOE });
  });
  await assertFails(getDoc(doc(as(CHLOE), 'votes/1_' + BRUNO)));
  await assertSucceeds(getDoc(doc(as(BRUNO), 'votes/1_' + BRUNO)));
  await assertSucceeds(getDoc(doc(as(ANIM), 'votes/1_' + BRUNO)));
});

check("un joueur ne peut pas lister les votes de la journée", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seed(async (db) => {
    await setDoc(doc(db, 'votes/1_' + BRUNO), { day: 1, voter: BRUNO, secretId: 's-alice', guess: CHLOE });
  });
  await assertFails(getDocs(collection(as(CHLOE), 'votes')));
  await assertSucceeds(getDocs(query(collection(as(BRUNO), 'votes'), where('voter', '==', BRUNO))));
  await assertSucceeds(getDocs(collection(as(ANIM), 'votes')));
});

check("on vote une fois, pour soi, et on ne peut pas se corriger", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  const bruno = as(BRUNO);

  // voter au nom d'un autre
  await assertFails(setDoc(doc(bruno, 'votes/1_' + CHLOE),
    { day: 1, voter: CHLOE, secretId: 's-alice', guess: ALICE }));
  // identifiant de document qui ne correspond pas au votant
  await assertFails(setDoc(doc(bruno, 'votes/1_' + BRUNO),
    { day: 1, voter: CHLOE, secretId: 's-alice', guess: ALICE }));
  // vote valable
  await assertSucceeds(setDoc(doc(bruno, 'votes/1_' + BRUNO),
    { day: 1, voter: BRUNO, secretId: 's-alice', guess: CHLOE }));
  // puis impossible de le modifier ou de l'effacer
  await assertFails(updateDoc(doc(bruno, 'votes/1_' + BRUNO), { guess: ALICE }));
  await assertFails(deleteDoc(doc(bruno, 'votes/1_' + BRUNO)));
});

check("on ne vote pas sur son propre secret, ni pour soi-même", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  const alice = as(ALICE);
  await assertFails(setDoc(doc(alice, 'votes/1_' + ALICE),
    { day: 1, voter: ALICE, secretId: 's-alice', guess: BRUNO }));   // son propre secret
  await seedSecret(BRUNO, 's-bruno', 'Le secret de Bruno, bien assez long.');
  await assertFails(setDoc(doc(alice, 'votes/1_' + ALICE),
    { day: 1, voter: ALICE, secretId: 's-bruno', guess: ALICE }));   // s'accuser soi-même
  await assertSucceeds(setDoc(doc(alice, 'votes/1_' + ALICE),
    { day: 1, voter: ALICE, secretId: 's-bruno', guess: CHLOE }));
});

check("aucun vote hors d'une journée ouverte", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'closed' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(setDoc(doc(as(BRUNO), 'votes/1_' + BRUNO),
    { day: 1, voter: BRUNO, secretId: 's-alice', guess: CHLOE }));
});

check("on ne peut pas antidater ni postdater son vote", async () => {
  await baseGame({ phase: 'jeu', day: 2, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(setDoc(doc(as(BRUNO), 'votes/1_' + BRUNO),
    { day: 1, voter: BRUNO, secretId: 's-alice', guess: CHLOE }));
  await assertSucceeds(setDoc(doc(as(BRUNO), 'votes/2_' + BRUNO),
    { day: 2, voter: BRUNO, secretId: 's-alice', guess: CHLOE }));
});

/* ═════════════════════════════════════════════════════ les secrets ═══ */

check("déposer un secret exige d'en déclarer l'auteur dans la même opération", async () => {
  await baseGame();
  const alice = as(ALICE);
  // sans le lien d'auteur, le secret est refusé
  await assertFails(setDoc(doc(alice, 'secrets/s-neuf'),
    { text: 'Un secret tout neuf et bien assez long.', code: 'NEU', sortKey: 'z', solvedDay: null }));

  const batch = writeBatch(alice);
  batch.set(doc(alice, 'secrets/s-neuf'),
    { text: 'Un secret tout neuf et bien assez long.', code: 'NEU', sortKey: 'z', solvedDay: null });
  batch.set(doc(alice, 'authorOf/s-neuf'), { uid: ALICE });
  batch.set(doc(alice, 'mine', ALICE), { secretId: 's-neuf' });
  await assertSucceeds(batch.commit());
});

check("on ne peut pas s'attribuer le secret d'un autre", async () => {
  await baseGame();
  const bruno = as(BRUNO);
  const batch = writeBatch(bruno);
  batch.set(doc(bruno, 'secrets/s-vole'),
    { text: 'Un secret que je veux mettre au nom d\'Alice.', code: 'VOL', sortKey: 'z', solvedDay: null });
  batch.set(doc(bruno, 'authorOf/s-vole'), { uid: ALICE });
  await assertFails(batch.commit());
});

check("un secret trop court est refusé", async () => {
  await baseGame();
  const alice = as(ALICE);
  const batch = writeBatch(alice);
  batch.set(doc(alice, 'secrets/s-court'), { text: 'court', code: 'CRT', sortKey: 'z', solvedDay: null });
  batch.set(doc(alice, 'authorOf/s-court'), { uid: ALICE });
  await assertFails(batch.commit());
});

check("chacun modifie son secret en phase d'inscription, personne d'autre", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertSucceeds(updateDoc(doc(as(ALICE), 'secrets/s-alice'), { text: 'Un autre secret, tout aussi long.' }));
  await assertFails(updateDoc(doc(as(BRUNO), 'secrets/s-alice'), { text: 'Je modifie le secret des autres.' }));
});

check("les secrets sont verrouillés dès que la partie est lancée", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(updateDoc(doc(as(ALICE), 'secrets/s-alice'), { text: 'Je change d\'avis en pleine partie.' }));
});

check("un joueur ne peut pas se déclarer démasqué ni démasquer les autres", async () => {
  await baseGame({ phase: 'jeu', day: 1, roundStatus: 'open' });
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  await assertFails(updateDoc(doc(as(ALICE), 'secrets/s-alice'), { solvedDay: 1 }));
  await assertFails(updateDoc(doc(as(BRUNO), 'secrets/s-alice'), { solvedDay: 1 }));
  await assertSucceeds(updateDoc(doc(as(ANIM), 'secrets/s-alice'), { solvedDay: 1 }));
});

/* ═══════════════════════════════════════════════════ pilotage & rôles ═ */

check("un joueur ne pilote pas la partie", async () => {
  await baseGame();
  await assertFails(updateDoc(doc(as(ALICE), 'game/state'), { phase: 'jeu', day: 1, roundStatus: 'open' }));
  await assertSucceeds(updateDoc(doc(as(ANIM), 'game/state'), { phase: 'jeu', day: 1, roundStatus: 'open' }));
});

check("un joueur ne publie pas de faux résultats ni de faux scores", async () => {
  await baseGame();
  await assertFails(setDoc(doc(as(ALICE), 'results/1'), { day: 1, votes: [] }));
  await assertFails(setDoc(doc(as(ALICE), 'scores/state'), { rows: [{ name: 'Alice', points: 999 }] }));
  await assertSucceeds(setDoc(doc(as(ANIM), 'results/1'), { day: 1, votes: [] }));
  await assertSucceeds(setDoc(doc(as(ANIM), 'scores/state'), { rows: [] }));
  // mais tout le monde les lit
  await assertSucceeds(getDoc(doc(as(ALICE), 'results/1')));
  await assertSucceeds(getDoc(doc(as(ALICE), 'scores/state')));
});

check("le rôle d'animateur ne se prend qu'une fois", async () => {
  await seed(async (db) => {
    await setDoc(doc(db, 'game/state'), { phase: 'lobby', day: 0, roundStatus: null, pointsCorrect: 3, pointsWrong: 1 });
  });
  const alice = as(ALICE);
  const first = writeBatch(alice);
  first.set(doc(alice, 'admins', ALICE), { since: 1 });
  first.set(doc(alice, 'adminLock/lock'), { claimed: true });
  await assertSucceeds(first.commit());

  const bruno = as(BRUNO);
  const second = writeBatch(bruno);
  second.set(doc(bruno, 'admins', BRUNO), { since: 2 });
  second.set(doc(bruno, 'adminLock/lock'), { claimed: true });
  await assertFails(second.commit());

  // et on ne se retire pas le verrou pour recommencer
  await assertFails(deleteDoc(doc(bruno, 'adminLock/lock')));
  await assertFails(deleteDoc(doc(alice, 'admins', ALICE)));
});

check("on ne s'inscrit pas sous l'identité d'un autre", async () => {
  await baseGame();
  const DINA = 'uid-dina';                       // pas encore inscrite
  await assertFails(setDoc(doc(as(DINA), 'players', CHLOE), { name: 'Chloé', nameKey: 'chloe' }));
  await assertFails(setDoc(doc(as(DINA), 'players', DINA), { name: 'D', nameKey: 'd' })); // trop court
  await assertSucceeds(setDoc(doc(as(DINA), 'players', DINA), { name: 'Dina', nameKey: 'dina' }));
});

check("on ne se renomme pas après coup, et on n'efface pas les autres", async () => {
  await baseGame();
  await assertFails(updateDoc(doc(as(ALICE), 'players', ALICE), { name: 'Alice la maligne' }));
  await assertFails(deleteDoc(doc(as(BRUNO), 'players', ALICE)));
  await assertSucceeds(deleteDoc(doc(as(ANIM), 'players', ALICE)));
});

check("chacun peut signaler son secret déposé, mais rien d'autre", async () => {
  await baseGame();
  await assertSucceeds(updateDoc(doc(as(ALICE), 'players', ALICE), { hasSecret: true }));
  await assertFails(updateDoc(doc(as(ALICE), 'players', ALICE), { hasSecret: false }));
  await assertFails(updateDoc(doc(as(ALICE), 'players', ALICE), { hasSecret: true, name: 'Alix' }));
  await assertFails(updateDoc(doc(as(BRUNO), 'players', ALICE), { hasSecret: true }));
});

check("un visiteur non connecté ne voit rien du tout", async () => {
  await baseGame();
  await seedSecret(ALICE, 's-alice', 'Un secret bien à moi, assez long.');
  const db = anon();
  await assertFails(getDoc(doc(db, 'game/state')));
  await assertFails(getDoc(doc(db, 'secrets/s-alice')));
  await assertFails(getDocs(collection(db, 'players')));
  await assertFails(getDoc(doc(db, 'scores/state')));
});

check("rien ne traîne en dehors des collections prévues", async () => {
  await baseGame();
  await assertFails(setDoc(doc(as(ALICE), 'nimporte/quoi'), { x: 1 }));
  await assertFails(getDoc(doc(as(ANIM), 'nimporte/quoi')));
});

/* ═══════════════════════════════════════════════════════════ exécution ═ */

(async () => {
  env = await initializeTestEnvironment({
    projectId: 'secret-bafa-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
    },
  });

  let failed = 0;
  for (const [name, fn] of checks) {
    await env.clearFirestore();
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}\n    ${error.message.split('\n')[0]}`);
    }
  }
  await env.cleanup();
  console.log(failed === 0
    ? `\n${checks.length} tests de règles passés.`
    : `\n${failed} test(s) en échec sur ${checks.length}.`);
  process.exit(failed === 0 ? 0 : 1);
})();
