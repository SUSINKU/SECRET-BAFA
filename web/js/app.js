import {
  initializeApp, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, connectAuthEmulator,
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, writeBatch, connectFirestoreEmulator,
} from './firebase.js';
import { firebaseConfig, ACCOUNT_DOMAIN } from './config.js';

/**
 * Secret BAFA — application autonome, branchée sur Firestore.
 *
 * Il n'y a pas de serveur : ce sont les règles de sécurité (firestore.rules)
 * qui gardent l'information cachée. Trois collections ne sont lisibles que par
 * l'animateur — `authorOf` (qui a écrit quoi), `votes` (les votes du jour) et
 * `mine` (quel secret est à qui). Au moment du reveal, c'est le navigateur de
 * l'animateur qui calcule les points et publie ce qui doit devenir public.
 */

/* ────────────────────────────────────────────────────────────── aides ── */
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
function say(target, text, kind) {
  const node = typeof target === 'string' ? $(target) : target;
  if (!node) return;
  clear(node);
  if (text) node.appendChild(el('div', 'msg ' + (kind || 'error'), text));
}
function nameKey(name) {
  return String(name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function randomId(bytes = 8) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return [...raw].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function secretCode() {
  const raw = crypto.getRandomValues(new Uint8Array(3));
  return [...raw].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

/** Traduit les codes d'erreur Firebase en français compréhensible. */
function humanError(error) {
  const code = (error && error.code) || '';
  if (code.includes('email-already-in-use')) return 'Ce prénom est déjà pris. Ajoute une initiale, par exemple « Camille B. ».';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Prénom ou mot de passe incorrect.';
  }
  if (code.includes('weak-password')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (code.includes('too-many-requests')) return 'Trop de tentatives. Attends une minute avant de réessayer.';
  if (code.includes('network-request-failed')) return 'Pas de connexion. Vérifie ton réseau et réessaie.';
  if (code.includes('permission-denied')) return "Tu n'as pas le droit de faire ça.";
  if (code.includes('operation-not-allowed')) {
    return "La connexion par mot de passe n'est pas activée sur le projet Firebase.";
  }
  return (error && error.message) || 'Une erreur est survenue.';
}

/* ───────────────────────────────────────────────────────────── état ──── */
const DEFAULT_GAME = {
  gameName: 'Secret BAFA', phase: 'lobby', day: 0, roundStatus: null,
  pointsCorrect: 3, pointsWrong: 1,
};

const S = {
  user: null,
  isAdmin: false,
  game: null,
  players: new Map(),   // uid -> {uid, name, hasSecret}
  secrets: new Map(),   // id  -> {id, text, code, sortKey, solvedDay, authorUid, authorName}
  mySecretId: null,
  myVotes: new Map(),   // jour -> {secretId, guess}
  votePending: false,   // vote écrit localement mais pas encore confirmé
  scores: [],
  authorOf: new Map(),  // animateur : secretId -> uid
  allVotes: [],         // animateur : tous les votes
  ready: false,
  view: 'secret',
  authMode: 'register',
  pick: null,
  pickWho: '',
  resultDay: null,
  resultsCache: new Map(),
};

const game = () => S.game || DEFAULT_GAME;
const myName = () => (S.user && S.players.get(S.user.uid) ? S.players.get(S.user.uid).name : '');
const mySecret = () => (S.mySecretId ? S.secrets.get(S.mySecretId) || null : null);

const TABS = [
  ['secret', 'Mon secret'], ['vote', 'Voter'], ['secrets', 'Les secrets'],
  ['results', 'Résultats'], ['ranking', 'Classement'], ['anim', 'Animateur'],
];

/* ──────────────────────────────────────────────────── mise en route ──── */
let db = null;
let auth = null;
const unsubscribes = [];

function configured() {
  return firebaseConfig && !String(firebaseConfig.projectId || '').startsWith('À_REMPLIR');
}

/** Écran d'installation : ce que voit l'animateur avant d'avoir branché Firebase. */
function renderSetup() {
  $('statusLine').textContent = 'Installation';
  $('heroTitle').textContent = 'Presque prêt';
  $('heroSub').textContent = 'Il reste à brancher le jeu sur ta base Firebase.';
  clear($('heroStats'));

  const screen = clear($('screen'));
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Cinq étapes, une dizaine de minutes'));
  card.appendChild(el('p', 'muted',
    "Cette page est le jeu, complet. Il lui manque seulement les identifiants du projet Firebase qui stockera la partie."));

  const steps = el('ol');
  [
    ['Créer le projet', 'Sur console.firebase.google.com — tu peux refuser Google Analytics.'],
    ['Activer la connexion', 'Authentication → Get started → active « Adresse e-mail/Mot de passe ».'],
    ['Créer la base', 'Firestore Database → Créer une base de données → un emplacement en Europe, en mode production.'],
    ['Coller les règles', 'Firestore Database → Règles : remplace tout par le fichier firestore.rules du dépôt, puis Publier. Sans cette étape, tous les secrets seraient lisibles par tout le monde.'],
    ['Recopier la configuration', "⚙ Paramètres du projet → Vos applications → Web : copie le bloc « const firebaseConfig = { … } » et remplace celui du fichier web/js/config.js."],
  ].forEach(([title, detail]) => {
    const item = el('li');
    item.appendChild(el('strong', null, title));
    item.appendChild(el('div', 'muted', detail));
    item.style.marginBottom = '12px';
    steps.appendChild(item);
  });
  card.appendChild(steps);
  card.appendChild(el('p', 'muted',
    "Une fois le fichier enregistré, recharge cette page : le jeu démarre. Pense ensuite à ajouter l'adresse de cette page dans Firebase → Authentication → Settings → Domaines autorisés."));
  screen.appendChild(card);
}

async function boot() {
  if (!configured()) return renderSetup();
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Développement : on branche les émulateurs plutôt que le vrai projet.
  if (firebaseConfig.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { /* mode privé */ }

  onAuthStateChanged(auth, async (user) => {
    for (const stop of unsubscribes.splice(0)) stop();
    S.user = user || null;
    S.isAdmin = false;
    S.mySecretId = null;
    S.myVotes = new Map();
    S.authorOf = new Map();
    S.allVotes = [];
    if (!user) { S.ready = true; return render(true); }
    await afterSignIn();
  });
}

async function afterSignIn() {
  const uid = S.user.uid;
  try {
    S.isAdmin = (await getDoc(doc(db, 'admins', uid))).exists();
  } catch (e) { S.isAdmin = false; }

  // La toute première personne crée l'état de la partie (vierge : les règles
  // n'autorisent rien d'autre).
  try {
    if (!(await getDoc(doc(db, 'game', 'state'))).exists()) {
      await setDoc(doc(db, 'game', 'state'), DEFAULT_GAME);
    }
  } catch (e) { /* quelqu'un d'autre vient de le faire */ }

  watch(onSnapshot(doc(db, 'game', 'state'), (snap) => {
    S.game = snap.exists() ? { ...DEFAULT_GAME, ...snap.data() } : null;
    S.ready = true;
    render();
  }, onDbError));

  watch(onSnapshot(collection(db, 'players'), (snap) => {
    S.players = new Map();
    for (const d of snap.docs) {
      const data = d.data();
      S.players.set(d.id, { uid: d.id, name: data.name, hasSecret: data.hasSecret === true });
    }
    render();
  }, onDbError));

  watch(onSnapshot(collection(db, 'secrets'), (snap) => {
    S.secrets = new Map();
    for (const d of snap.docs) {
      const data = d.data();
      S.secrets.set(d.id, {
        id: d.id, text: data.text, code: data.code, sortKey: data.sortKey,
        solvedDay: data.solvedDay == null ? null : data.solvedDay,
        authorUid: data.authorUid || null, authorName: data.authorName || null,
      });
    }
    render();
  }, onDbError));

  watch(onSnapshot(doc(db, 'mine', uid), (snap) => {
    S.mySecretId = snap.exists() ? snap.data().secretId : null;
    render();
  }, onDbError));

  watch(onSnapshot(doc(db, 'scores', 'state'), (snap) => {
    S.scores = snap.exists() ? (snap.data().rows || []) : [];
    render();
  }, onDbError));

  // includeMetadataChanges : on veut savoir quand le vote passe de « écrit
  // localement » à « confirmé par le serveur ». C'est la différence entre un
  // vote affiché et un vote qui compte vraiment.
  watch(onSnapshot(
    query(collection(db, 'votes'), where('voter', '==', uid)),
    { includeMetadataChanges: true },
    (snap) => {
      S.myVotes = new Map();
      for (const d of snap.docs) {
        const data = d.data();
        S.myVotes.set(data.day, { secretId: data.secretId, guess: data.guess });
      }
      S.votePending = snap.metadata.hasPendingWrites;
      render();
    },
    onDbError
  ));

  if (S.isAdmin) watchAdmin();
  render(true);
}

/** L'animateur seul voit les liens d'auteur et l'ensemble des votes. */
function watchAdmin() {
  watch(onSnapshot(collection(db, 'authorOf'), (snap) => {
    S.authorOf = new Map(snap.docs.map((d) => [d.id, d.data().uid]));
    render();
  }, onDbError));
  watch(onSnapshot(collection(db, 'votes'), (snap) => {
    S.allVotes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, onDbError));
}

function watch(stop) { unsubscribes.push(stop); }
function onDbError(error) {
  console.error('firestore', error);
  $('statusLine').textContent = 'Connexion perdue — recharge la page.';
}

/* ────────────────────────────────────────────────────────── comptes ──── */
const emailFor = (name) => `${nameKey(name)}@${ACCOUNT_DOMAIN}`;

async function register(name, password) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2) throw new Error('Ton prénom doit faire au moins 2 caractères.');
  if (clean.length > 30) throw new Error('Ton prénom est trop long (30 caractères maximum).');
  if (!nameKey(clean)) throw new Error("Ce prénom ne contient aucune lettre utilisable.");
  if (String(password || '').length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.');

  const credential = await createUserWithEmailAndPassword(auth, emailFor(clean), password);
  await setDoc(doc(db, 'players', credential.user.uid), { name: clean, nameKey: nameKey(clean) });
}

async function login(name, password) {
  await signInWithEmailAndPassword(auth, emailFor(name), password);
}

/* ─────────────────────────────────────────────────────────── secrets ─── */
async function saveSecret(text) {
  const clean = String(text || '').trim();
  if (clean.length < 10) throw new Error('Ton secret doit faire au moins 10 caractères.');
  if (clean.length > 500) throw new Error('Ton secret ne doit pas dépasser 500 caractères.');
  if (game().phase !== 'lobby') throw new Error('La partie a commencé : les secrets sont verrouillés.');

  const uid = S.user.uid;
  if (S.mySecretId) {
    await updateDoc(doc(db, 'secrets', S.mySecretId), { text: clean });
    return;
  }
  // Le secret, son lien d'auteur et le marque-page privé partent ensemble :
  // les règles refusent le secret si l'auteur n'est pas déclaré au même instant.
  const secretId = randomId(10);
  const batch = writeBatch(db);
  batch.set(doc(db, 'secrets', secretId),
    { text: clean, code: secretCode(), sortKey: randomId(6), solvedDay: null });
  batch.set(doc(db, 'authorOf', secretId), { uid });
  batch.set(doc(db, 'mine', uid), { secretId });
  batch.update(doc(db, 'players', uid), { hasSecret: true });
  await batch.commit();
}

/* ────────────────────────────────────────────────────────────── vote ─── */
function suspects() {
  const revealed = new Set(
    [...S.secrets.values()].filter((s) => s.authorUid).map((s) => s.authorUid)
  );
  return [...S.players.values()]
    .filter((p) => p.hasSecret && !revealed.has(p.uid) && p.uid !== S.user.uid)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function secretsInOrder() {
  return [...S.secrets.values()].sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
}

async function castVote(secretId, guessUid) {
  const g = game();
  if (g.phase !== 'jeu' || g.roundStatus !== 'open') throw new Error("Aucune journée de vote n'est ouverte.");
  if (!S.mySecretId) throw new Error('Tu dois avoir déposé ton secret pour voter.');
  if (S.myVotes.has(g.day)) throw new Error("Tu as déjà voté aujourd'hui.");
  if (secretId === S.mySecretId) throw new Error('Tu ne peux pas voter sur ton propre secret.');
  await setDoc(doc(db, 'votes', `${g.day}_${S.user.uid}`),
    { day: g.day, voter: S.user.uid, secretId, guess: guessUid });
}

/* ─────────────────────────────────────────────────────── animateur ──── */
async function claimAdmin() {
  const uid = S.user.uid;
  const batch = writeBatch(db);
  batch.set(doc(db, 'admins', uid), { since: Date.now() });
  batch.set(doc(db, 'adminLock', 'lock'), { claimed: true });
  await batch.commit();
  S.isAdmin = true;
  watchAdmin();
}

async function startGame() {
  if (S.secrets.size < 3) throw new Error('Il faut au moins 3 secrets déposés pour lancer la partie.');
  await updateDoc(doc(db, 'game', 'state'), { phase: 'jeu', day: 1, roundStatus: 'open' });
}

/**
 * Relit les votes et les liens d'auteur directement dans la base.
 *
 * On ne se fie pas à l'instantané local : si l'animateur clôture la journée
 * juste après avoir ouvert sa page, les derniers votes ne lui sont peut-être
 * pas encore parvenus, et le reveal publierait des résultats incomplets.
 */
async function freshAdminData() {
  const [voteSnap, authorSnap] = await Promise.all([
    getDocs(collection(db, 'votes')),
    getDocs(collection(db, 'authorOf')),
  ]);
  return {
    votes: voteSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    authorOf: new Map(authorSnap.docs.map((d) => [d.id, d.data().uid])),
  };
}

/** Le calcul des points : le seul moment où l'information cachée sert à
 *  produire quelque chose de public, et c'est l'animateur qui le publie. */
function computeScores(allVotes, authorOf) {
  const g = game();
  const closedDays = new Set(
    allVotes.map((v) => v.day).filter((d) => d < g.day || g.roundStatus === 'closed')
  );
  const rows = new Map(
    [...S.players.values()].map((p) => [p.uid, { uid: p.uid, name: p.name, found: 0, fooled: 0, points: 0 }])
  );
  for (const vote of allVotes) {
    if (!closedDays.has(vote.day)) continue;
    const author = authorOf.get(vote.secretId);
    if (!author) continue;
    if (vote.guess === author) {
      const voter = rows.get(vote.voter);
      if (voter) { voter.found += 1; voter.points += g.pointsCorrect; }
    } else {
      const target = rows.get(author);
      if (target) { target.fooled += 1; target.points += g.pointsWrong; }
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.found - a.found || a.name.localeCompare(b.name, 'fr')
  );
}

async function closeDay() {
  const g = game();
  if (g.roundStatus !== 'open') throw new Error('Aucune journée ouverte.');
  const { votes: allVotes, authorOf } = await freshAdminData();
  const dayVotes = allVotes.filter((v) => v.day === g.day);

  // Les secrets devinés juste par au moins une personne sortent du jeu.
  const found = new Set();
  for (const vote of dayVotes) {
    const author = authorOf.get(vote.secretId);
    const secret = S.secrets.get(vote.secretId);
    if (secret && secret.solvedDay == null && author && vote.guess === author) found.add(vote.secretId);
  }

  const nameOf = (uid) => (S.players.get(uid) ? S.players.get(uid).name : '?');
  const batch = writeBatch(db);
  for (const secretId of found) {
    const author = authorOf.get(secretId);
    batch.update(doc(db, 'secrets', secretId),
      { solvedDay: g.day, authorUid: author, authorName: nameOf(author) });
  }

  // Le reveal public : un vote raté ne nomme jamais l'auteur d'un secret qui
  // reste en jeu. C'est ici que la règle du jeu est appliquée, une fois pour
  // toutes, avant que quoi que ce soit ne devienne lisible.
  const publicVotes = dayVotes.map((vote) => {
    const secret = S.secrets.get(vote.secretId);
    const author = authorOf.get(vote.secretId);
    const correct = author && vote.guess === author;
    const nowPublic = correct || found.has(vote.secretId) ||
      (secret && secret.solvedDay != null);
    return {
      voterName: nameOf(vote.voter),
      guessedName: nameOf(vote.guess),
      secretCode: secret ? secret.code : '?',
      secretText: secret ? secret.text : '',
      correct: Boolean(correct),
      authorName: nowPublic ? nameOf(author) : null,
    };
  }).sort((a, b) => a.secretCode.localeCompare(b.secretCode) || a.voterName.localeCompare(b.voterName, 'fr'));

  const solvedList = [...found].map((secretId) => {
    const secret = S.secrets.get(secretId);
    return { code: secret.code, text: secret.text, authorName: nameOf(authorOf.get(secretId)) };
  });

  batch.set(doc(db, 'results', String(g.day)), { day: g.day, votes: publicVotes, solved: solvedList });

  const remaining = [...S.secrets.values()].filter((s) => s.solvedDay == null && !found.has(s.id));
  batch.update(doc(db, 'game', 'state'),
    { roundStatus: 'closed', phase: remaining.length === 0 ? 'fini' : 'jeu' });
  await batch.commit();

  await setDoc(doc(db, 'scores', 'state'), { rows: computeScores(allVotes, authorOf), day: g.day });
}

async function openNextDay() {
  const g = game();
  if (g.phase === 'fini') throw new Error('La partie est terminée.');
  if (g.roundStatus === 'open') throw new Error('Une journée est déjà ouverte.');
  await updateDoc(doc(db, 'game', 'state'), { day: g.day + 1, roundStatus: 'open' });
}

async function endGame() {
  if (game().roundStatus === 'open') await closeDay();
  const { votes: allVotes, authorOf } = await freshAdminData();
  const nameOf = (uid) => (S.players.get(uid) ? S.players.get(uid).name : '?');
  const batch = writeBatch(db);
  for (const secret of S.secrets.values()) {
    if (secret.authorUid) continue;
    const author = authorOf.get(secret.id);
    if (author) batch.update(doc(db, 'secrets', secret.id), { authorUid: author, authorName: nameOf(author) });
  }
  batch.update(doc(db, 'game', 'state'), { phase: 'fini' });
  await batch.commit();
  await setDoc(doc(db, 'scores', 'state'), { rows: computeScores(allVotes, authorOf), day: game().day });
}

async function saveSettings(patch) {
  await updateDoc(doc(db, 'game', 'state'), patch);
  const { votes: allVotes, authorOf } = await freshAdminData();
  await setDoc(doc(db, 'scores', 'state'), { rows: computeScores(allVotes, authorOf), day: game().day });
}

async function removePlayer(uid) {
  const batch = writeBatch(db);
  for (const vote of S.allVotes.filter((v) => v.voter === uid)) batch.delete(doc(db, 'votes', vote.id));
  const secretId = [...S.authorOf.entries()].find(([, owner]) => owner === uid);
  if (secretId) {
    for (const vote of S.allVotes.filter((v) => v.secretId === secretId[0])) {
      batch.delete(doc(db, 'votes', vote.id));
    }
    batch.delete(doc(db, 'secrets', secretId[0]));
    batch.delete(doc(db, 'authorOf', secretId[0]));
  }
  batch.delete(doc(db, 'mine', uid));
  batch.delete(doc(db, 'players', uid));
  await batch.commit();
}

async function resetGame(keepPlayers) {
  const batch = writeBatch(db);
  for (const vote of S.allVotes) batch.delete(doc(db, 'votes', vote.id));
  for (let day = 1; day <= game().day; day += 1) batch.delete(doc(db, 'results', String(day)));
  if (keepPlayers) {
    for (const secret of S.secrets.values()) {
      batch.update(doc(db, 'secrets', secret.id), { solvedDay: null, authorUid: null, authorName: null });
    }
  } else {
    for (const secret of S.secrets.values()) {
      batch.delete(doc(db, 'secrets', secret.id));
      batch.delete(doc(db, 'authorOf', secret.id));
    }
    for (const player of S.players.values()) {
      batch.delete(doc(db, 'mine', player.uid));
      if (player.uid !== S.user.uid) batch.delete(doc(db, 'players', player.uid));
    }
  }
  batch.update(doc(db, 'game', 'state'), { phase: 'lobby', day: 0, roundStatus: null });
  batch.set(doc(db, 'scores', 'state'), { rows: [], day: 0 });
  await batch.commit();
}

/* ══════════════════════════════════════════════════════════ affichage ══ */

let renderPending = false;
function isTyping() {
  const active = document.activeElement;
  return !!active && $('screen').contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
}
document.addEventListener('focusout', () => {
  if (renderPending) { renderPending = false; setTimeout(() => render(true), 0); }
});

function phaseText() {
  const g = game();
  if (g.phase === 'lobby') return 'Inscriptions ouvertes · dépôt des secrets';
  if (g.phase === 'fini') return 'Partie terminée';
  if (g.roundStatus === 'open') return 'Journée ' + g.day + ' · votes ouverts';
  return 'Journée ' + g.day + ' · votes révélés';
}

function render(force) {
  if (!S.ready) return;
  if (!force && isTyping()) { renderPending = true; return; }

  $('gameName').textContent = game().gameName;
  $('statusLine').textContent = phaseText();
  renderHero();

  if (!S.user) { renderTabs(false); return renderAuth(); }
  if (S.view === 'login' || !TABS.some((t) => t[0] === S.view)) S.view = 'secret';
  renderTabs(true);

  const screen = clear($('screen'));
  if (S.view === 'secret') renderMySecret(screen);
  else if (S.view === 'vote') renderVote(screen);
  else if (S.view === 'secrets') renderSecrets(screen);
  else if (S.view === 'results') renderResults(screen);
  else if (S.view === 'ranking') renderRanking(screen);
  else if (S.view === 'anim') renderAnim(screen);
}

function renderTabs(show) {
  const tabs = $('tabs');
  tabs.classList.toggle('hidden', !show);
  clear(tabs);
  if (!show) return;
  for (const [id, label] of TABS) {
    const button = el('button', null, label);
    button.type = 'button';
    button.setAttribute('aria-selected', String(S.view === id));
    button.onclick = () => { S.view = id; render(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    tabs.appendChild(button);
  }
}

function heroCopy() {
  const g = game();
  if (!S.user) return { title: 'Un secret. Un vote par jour.', sub: 'Le jeu des secrets de ta formation.' };
  if (g.phase === 'lobby') {
    return mySecret()
      ? { title: 'Ton secret est sous clé', sub: "On attend que l'animateur lance la partie." }
      : { title: 'Dépose ton secret', sub: 'La partie ne peut pas commencer sans toi.' };
  }
  if (g.phase === 'fini') {
    const top = S.scores[0];
    return top
      ? { title: top.name + " l'emporte !", sub: top.points + ' points. Tous les secrets sont révélés.' }
      : { title: 'Partie terminée', sub: 'Tous les secrets sont révélés.' };
  }
  if (g.roundStatus === 'open') {
    return S.myVotes.has(g.day)
      ? { title: 'Vote enregistré', sub: 'Rendez-vous au reveal de ce soir.' }
      : { title: 'À toi de jouer', sub: "Un seul vote aujourd'hui, et il est définitif." };
  }
  return { title: 'Les votes sont tombés', sub: 'Journée ' + g.day + ' révélée. La suivante ouvrira bientôt.' };
}

function statChip(value, label) {
  const chip = el('div', 'stat');
  chip.appendChild(el('b', null, String(value)));
  chip.appendChild(el('span', null, label));
  return chip;
}

function renderHero() {
  const g = game();
  const copy = heroCopy();
  $('heroTitle').textContent = copy.title;
  $('heroSub').textContent = copy.sub;

  const total = S.secrets.size;
  const solved = [...S.secrets.values()].filter((s) => s.solvedDay != null).length;
  const stats = clear($('heroStats'));

  if (!S.user || g.phase === 'lobby') {
    stats.appendChild(statChip(S.players.size, S.players.size > 1 ? 'inscrits' : 'inscrit'));
    stats.appendChild(statChip(total, total > 1 ? 'secrets' : 'secret'));
  } else {
    stats.appendChild(statChip('J' + g.day, 'journée'));
    stats.appendChild(statChip(solved + '/' + total, 'démasqués'));
    if (S.scores.length) {
      const mine = S.scores.find((row) => row.uid === S.user.uid);
      stats.appendChild(statChip(mine ? mine.points : 0, 'mes points'));
    }
  }

  const bar = $('heroProgress');
  const show = total > 0 && g.phase !== 'lobby';
  bar.classList.toggle('hidden', !show);
  if (show) {
    $('progressFill').style.width = Math.round((solved / total) * 100) + '%';
    $('progressLabel').textContent =
      solved + ' secret' + (solved > 1 ? 's' : '') + ' démasqué' + (solved > 1 ? 's' : '') + ' sur ' + total;
  }
}

const celebrated = new Set();
function celebrate(day) {
  if (celebrated.has(day)) return;
  celebrated.add(day);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sky = el('div', 'confetti');
  const colors = ['#EF5A6F', '#F79B4B', '#8B5CF6', '#E8629B', '#FFB884', '#6C5CE7'];
  for (let i = 0; i < 28; i += 1) {
    const bit = document.createElement('i');
    bit.style.left = Math.random() * 100 + '%';
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    bit.style.animationDuration = (1.9 + Math.random() * 1.1).toFixed(2) + 's';
    sky.appendChild(bit);
  }
  document.body.appendChild(sky);
  setTimeout(() => sky.remove(), 3400);
}

/* ─────────────────────────────────────────── inscription / connexion ── */
function renderAuth() {
  const screen = clear($('screen'));

  const brand = el('div', 'hero__logo');
  const box = el('div', 'brandcard');
  const logo = document.createElement('img');
  logo.src = 'images/logo-secret-bafa.png';
  logo.alt = 'Secret BAFA';
  box.appendChild(logo);
  brand.appendChild(box);
  screen.appendChild(brand);

  const rules = el('div', 'card');
  rules.appendChild(el('h2', null, 'Comment on joue'));
  const list = el('ol', 'muted');
  [
    "Chacun·e s'inscrit et dépose un secret sur soi. Il reste anonyme.",
    "Chaque jour, tu as un seul vote : tu choisis un secret et tu désignes la personne qui l'a écrit.",
    "Le soir, l'animateur clôture la journée et tous les votes sont révélés d'un coup.",
    '+' + game().pointsCorrect + ' si tu trouves le bon auteur. +' + game().pointsWrong +
      " pour l'auteur d'un secret, à chaque fois que quelqu'un se trompe sur lui.",
  ].forEach((line) => list.appendChild(el('li', null, line)));
  rules.appendChild(list);
  rules.appendChild(el('p', 'muted', 'Un secret démasqué sort du jeu et son auteur est affiché.'));
  screen.appendChild(rules);

  const card = el('div', 'card');
  const switcher = el('div', 'row');
  const toLogin = el('button', 'btn small', 'Se connecter');
  const toRegister = el('button', 'btn small', 'Créer mon compte');
  toLogin.type = 'button'; toRegister.type = 'button';
  switcher.append(toLogin, toRegister);
  card.appendChild(switcher);

  const form = el('form');
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.autocomplete = 'username'; nameInput.placeholder = 'Camille';
  nameInput.required = true;
  const passInput = document.createElement('input');
  passInput.type = 'password'; passInput.required = true;
  const hint = el('p', 'muted', '');
  const submit = el('button', 'btn full', '');

  function paint() {
    const reg = S.authMode === 'register';
    toRegister.className = 'btn small' + (reg ? '' : ' ghost');
    toLogin.className = 'btn small' + (reg ? ' ghost' : '');
    submit.textContent = reg ? "Je m'inscris" : 'Entrer dans la partie';
    passInput.autocomplete = reg ? 'new-password' : 'current-password';
    passInput.placeholder = reg ? '6 caractères minimum' : '';
    hint.textContent = reg
      ? "Ce mot de passe sert juste à empêcher un camarade de voter à ta place. N'en réutilise pas un vrai."
      : "Reprends le prénom exact choisi à l'inscription.";
    say('authMsg', '');
  }
  toLogin.onclick = () => { S.authMode = 'login'; paint(); };
  toRegister.onclick = () => { S.authMode = 'register'; paint(); };

  form.append(el('label', null, 'Ton prénom'), nameInput,
              el('label', null, 'Ton mot de passe'), passInput, hint, submit);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    say('authMsg', '');
    try {
      if (S.authMode === 'register') await register(nameInput.value, passInput.value);
      else await login(nameInput.value, passInput.value);
      S.view = 'secret';
    } catch (error) {
      say('authMsg', error.code ? humanError(error) : error.message);
      submit.disabled = false;
    }
  };
  card.appendChild(form);
  const msg = el('div'); msg.id = 'authMsg';
  card.appendChild(msg);
  screen.appendChild(card);
  paint();
}

/* ────────────────────────────────────────────────────────── mon secret ─ */
function renderMySecret(screen) {
  const g = game();
  const secret = mySecret();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Mon secret'));

  if (secret) {
    const line = el('p');
    line.appendChild(el('span', 'pill', 'Secret ' + secret.code));
    if (secret.solvedDay != null) {
      line.appendChild(el('span', 'pill grey', ' démasqué journée ' + secret.solvedDay + ' '));
    }
    card.appendChild(line);
  }

  if (g.phase === 'lobby') {
    const form = el('form');
    const area = document.createElement('textarea');
    area.maxLength = 500;
    area.placeholder = 'Un truc vrai sur toi, drôle ou surprenant… mais pas trop facile à deviner !';
    area.value = secret ? secret.text : '';
    const count = el('p', 'muted', '');
    const update = () => { count.textContent = area.value.trim().length + '/500 — 10 caractères minimum.'; };
    update();
    area.oninput = update;
    const submit = el('button', 'btn full', secret ? 'Modifier mon secret' : 'Déposer mon secret');
    form.append(el('label', null, 'Écris un secret sur toi'), area, count, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try { await saveSecret(area.value); say('secretMsg', 'Secret enregistré. Motus !', 'ok'); }
      catch (error) { say('secretMsg', error.code ? humanError(error) : error.message); }
      submit.disabled = false;
    };
    card.appendChild(form);
    const msg = el('div'); msg.id = 'secretMsg'; card.appendChild(msg);
    card.appendChild(el('p', 'muted', "Tu peux le modifier tant que la partie n'est pas lancée."));
  } else if (secret) {
    const box = el('div', 'secret flat mine');
    box.appendChild(el('span', 'txt', secret.text));
    card.appendChild(box);
    card.appendChild(el('p', 'muted', 'Les secrets sont verrouillés depuis le lancement de la partie.'));
  } else {
    card.appendChild(el('p', 'muted',
      "La partie a commencé sans ton secret : tu ne peux plus en déposer, mais tu peux voter."));
  }

  const line = el('div', 'linkline');
  const out = el('button', null, 'Se déconnecter (' + myName() + ')');
  out.type = 'button';
  out.onclick = () => signOut(auth);
  line.appendChild(out);
  card.appendChild(line);
  screen.appendChild(card);
}

/* ─────────────────────────────────────────────────────────────── vote ── */
function renderVote(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Mon vote du jour'));

  if (g.phase === 'lobby') {
    card.appendChild(el('p', 'muted', "Les votes ouvriront quand l'animateur lancera la partie."));
    return screen.appendChild(card);
  }
  if (g.phase === 'fini') {
    card.appendChild(el('p', 'muted', 'La partie est terminée : va voir le classement final.'));
    return screen.appendChild(card);
  }
  if (g.roundStatus !== 'open') {
    card.appendChild(el('p', 'muted', 'La journée ' + g.day + " est close. Attends l'ouverture de la suivante."));
    return screen.appendChild(card);
  }
  if (!S.mySecretId) {
    card.appendChild(el('p', 'muted', "Tu n'as pas déposé de secret : tu ne peux pas voter."));
    return screen.appendChild(card);
  }

  const mine = S.myVotes.get(g.day);
  if (mine) {
    const secret = S.secrets.get(mine.secretId);
    const who = S.players.get(mine.guess);
    card.appendChild(el('p', null, 'Tu as voté pour la journée ' + g.day + ' :'));
    const box = el('div', 'secret flat');
    box.appendChild(el('span', 'code', 'Secret ' + (secret ? secret.code : '?')));
    box.appendChild(el('span', 'txt', secret ? secret.text : ''));
    box.appendChild(el('span', 'who', 'Ta réponse : ' + (who ? who.name : '?')));
    card.appendChild(box);
    if (S.votePending) {
      card.appendChild(el('p', 'muted', 'Envoi en cours… garde la page ouverte un instant.'));
    } else {
      const done = el('p');
      done.appendChild(el('span', 'pill', 'Vote enregistré'));
      done.id = 'voteDone';
      card.appendChild(done);
      card.appendChild(el('p', 'muted', 'Un seul vote par jour, impossible de le changer.'));
    }
    return screen.appendChild(card);
  }

  const votable = secretsInOrder().filter((s) => s.solvedDay == null && s.id !== S.mySecretId);
  const who = suspects();
  if (!votable.length || !who.length) {
    card.appendChild(el('p', 'muted', 'Aucun secret à deviner pour le moment.'));
    return screen.appendChild(card);
  }

  card.appendChild(el('p', 'muted',
    'Journée ' + g.day + ' — ' + plural(votable.length, 'secret à percer', 'secrets à percer') + ". Tu n'as qu'un vote."));

  card.appendChild(el('h3', null, '1. Choisis un secret'));
  for (const secret of votable) {
    const button = el('button', 'secret');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(S.pick === secret.id));
    button.appendChild(el('span', 'code', 'Secret ' + secret.code));
    button.appendChild(el('span', 'txt', secret.text));
    button.onclick = () => { S.pick = secret.id; render(true); };
    card.appendChild(button);
  }

  card.appendChild(el('h3', null, "2. Qui l'a écrit ?"));
  const select = document.createElement('select');
  const none = el('option', null, '— Choisir une personne —'); none.value = '';
  select.appendChild(none);
  for (const person of who) {
    const option = el('option', null, person.name);
    option.value = person.uid;
    select.appendChild(option);
  }
  select.value = who.some((p) => p.uid === S.pickWho) ? S.pickWho : '';
  select.onchange = () => { S.pickWho = select.value; };
  card.appendChild(select);

  const submit = el('button', 'btn full', 'Valider mon vote (définitif)');
  submit.type = 'button';
  submit.onclick = async () => {
    say('voteMsg', '');
    if (!S.pick) return say('voteMsg', "Choisis d'abord un secret.");
    if (!select.value) return say('voteMsg', 'Choisis la personne que tu accuses.');
    const secret = S.secrets.get(S.pick);
    const person = who.find((p) => p.uid === select.value);
    if (!window.confirm('Tu accuses ' + person.name + " d'avoir écrit le secret " + secret.code +
      ".\n\nC'est ton seul vote de la journée et il est définitif. On valide ?")) return;
    submit.disabled = true;
    try { S.pick = null; S.pickWho = ''; await castVote(secret.id, person.uid); }
    catch (error) { say('voteMsg', error.code ? humanError(error) : error.message); submit.disabled = false; }
  };
  card.appendChild(submit);
  const msg = el('div'); msg.id = 'voteMsg'; card.appendChild(msg);
  screen.appendChild(card);
}

/* ───────────────────────────────────────────────────────── les secrets ─ */
function renderSecrets(screen) {
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Tous les secrets'));
  const all = secretsInOrder();
  const solved = all.filter((s) => s.solvedDay != null).length;
  card.appendChild(el('p', 'muted', solved + ' démasqué(s) sur ' + all.length + '.'));

  if (!all.length) card.appendChild(el('p', 'muted', 'Aucun secret déposé pour le moment.'));
  for (const secret of all) {
    const box = el('div', 'secret flat');
    if (secret.solvedDay != null) box.classList.add('solved');
    if (secret.id === S.mySecretId) box.classList.add('mine');
    box.appendChild(el('span', 'code', 'Secret ' + secret.code));
    box.appendChild(el('span', 'txt', secret.text));
    if (secret.solvedDay != null) {
      box.appendChild(el('span', 'who', 'Démasqué journée ' + secret.solvedDay + ' — écrit par ' + secret.authorName));
    } else if (secret.authorName) {
      box.appendChild(el('span', 'who', 'Écrit par ' + secret.authorName));
    } else if (secret.id === S.mySecretId) {
      box.appendChild(el('span', 'who', "C'est le tien — chut."));
    }
    card.appendChild(box);
  }
  screen.appendChild(card);
}

/* ────────────────────────────────────────────────────────── résultats ── */
function renderResults(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Résultats'));

  const days = [];
  for (let day = 1; day <= g.day; day += 1) {
    if (day < g.day || g.roundStatus === 'closed') days.push(day);
  }
  days.reverse();

  if (!days.length) {
    card.appendChild(el('p', 'muted',
      "Aucune journée révélée pour l'instant. Les votes restent secrets jusqu'au reveal du soir."));
    return screen.appendChild(card);
  }

  const select = document.createElement('select');
  for (const day of days) {
    const option = el('option', null, 'Journée ' + day);
    option.value = String(day);
    select.appendChild(option);
  }
  const chosen = days.includes(S.resultDay) ? S.resultDay : days[0];
  S.resultDay = chosen;
  select.value = String(chosen);

  const body = el('div');
  select.onchange = () => { S.resultDay = Number(select.value); loadDay(S.resultDay); };
  card.append(el('label', null, 'Journée'), select, body);
  screen.appendChild(card);

  function paintDay(results) {
    clear(body);
    if (results.solved && results.solved.length) {
      body.appendChild(el('h3', null, 'Secrets démasqués ce jour-là'));
      for (const secret of results.solved) {
        const box = el('div', 'secret flat solved');
        box.appendChild(el('span', 'stamp', 'Démasqué'));
        box.appendChild(el('span', 'code', 'Secret ' + secret.code));
        box.appendChild(el('span', 'txt', secret.text));
        box.appendChild(el('span', 'who', "C'était " + secret.authorName));
        body.appendChild(box);
      }
    }

    const votes = results.votes || [];
    if (votes.some((v) => v.correct && v.voterName === myName())) celebrate(results.day);

    body.appendChild(el('h3', null, 'Tous les votes (' + votes.length + ')'));
    if (!votes.length) body.appendChild(el('p', 'muted', "Personne n'a voté ce jour-là."));

    for (const vote of votes) {
      const row = el('div', 'vote' + (vote.correct ? ' hit' : ''));
      row.appendChild(el('p', null,
        vote.voterName + ' a attribué le secret ' + vote.secretCode + ' à ' + vote.guessedName));
      row.appendChild(el('p', 'muted', '« ' + vote.secretText + ' »'));
      let verdict;
      if (vote.correct) {
        verdict = 'Trouvé ! +' + g.pointsCorrect + ' pour ' + vote.voterName;
      } else if (vote.authorName) {
        verdict = "Raté — c'était " + vote.authorName + ' (+' + g.pointsWrong + ' pour ' + vote.authorName + ')';
      } else {
        verdict = "Raté — ce n'est pas " + vote.guessedName + '. +' + g.pointsWrong +
          " pour l'auteur, qui reste dans l'ombre.";
      }
      row.appendChild(el('span', 'pill' + (vote.correct ? '' : ' bad'), verdict));
      body.appendChild(row);
    }
  }

  async function loadDay(day) {
    if (S.resultsCache.has(day)) return paintDay(S.resultsCache.get(day));
    clear(body).appendChild(el('p', 'muted', 'Chargement…'));
    try {
      const snap = await getDoc(doc(db, 'results', String(day)));
      if (!snap.exists()) {
        clear(body).appendChild(el('p', 'muted', "Les résultats de cette journée n'ont pas été publiés."));
        return;
      }
      const data = { day, ...snap.data() };
      S.resultsCache.set(day, data);
      paintDay(data);
    } catch (error) {
      clear(body).appendChild(el('p', 'muted', humanError(error)));
    }
  }
  loadDay(chosen);
}

/* ────────────────────────────────────────────────────────── classement ─ */
function renderRanking(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Classement'));
  card.appendChild(el('p', 'muted',
    '+' + g.pointsCorrect + ' par bonne réponse, +' + g.pointsWrong + ' par personne trompée par ton secret.'));

  if (!S.scores.length) {
    card.appendChild(el('p', 'muted',
      'Le classement apparaîtra après le premier reveal : les points sont attribués à la clôture de la journée.'));
    return screen.appendChild(card);
  }

  S.scores.forEach((entry, index) => {
    const row = el('div', 'rank' + (index < 3 ? ' p' + (index + 1) : '') +
      (S.user && entry.uid === S.user.uid ? ' me' : ''));
    row.appendChild(el('div', 'pos', String(index + 1)));
    const who = el('div', 'who', entry.name);
    who.appendChild(el('small', null,
      plural(entry.found, 'secret trouvé', 'secrets trouvés') + ' · ' +
      plural(entry.fooled, 'personne trompée', 'personnes trompées')));
    row.appendChild(who);
    row.appendChild(el('div', 'pts', entry.points + (Math.abs(entry.points) > 1 ? ' pts' : ' pt')));
    card.appendChild(row);
  });
  screen.appendChild(card);
}

/* ────────────────────────────────────────────────────────── animateur ── */
function renderAnim(screen) {
  const g = game();

  if (!S.isAdmin) {
    const card = el('div', 'card');
    card.appendChild(el('h2', null, 'Espace animateur'));
    card.appendChild(el('p', 'muted',
      "Le rôle d'animateur se prend une seule fois, par la première personne qui le réclame. " +
      "Si c'est toi le formateur, prends-le maintenant, avant de donner le lien aux stagiaires."));
    const take = el('button', 'btn full', 'Devenir animateur');
    take.type = 'button';
    take.onclick = async () => {
      if (!window.confirm("Prendre le rôle d'animateur ? Il ne pourra plus être pris par quelqu'un d'autre.")) return;
      take.disabled = true;
      try { await claimAdmin(); render(true); }
      catch (error) {
        say('animMsg', "Le rôle est déjà pris par quelqu'un d'autre.");
        take.disabled = false;
      }
    };
    card.appendChild(take);
    const msg = el('div'); msg.id = 'animMsg'; card.appendChild(msg);
    return screen.appendChild(card);
  }

  const withSecret = S.secrets.size;
  const solved = [...S.secrets.values()].filter((s) => s.solvedDay != null).length;
  const votedToday = new Set(S.allVotes.filter((v) => v.day === g.day).map((v) => v.voter));

  const pilot = el('div', 'card');
  pilot.appendChild(el('h2', null, 'Pilotage de la partie'));
  const table = el('table');
  const lines = [
    ['Inscrits', String(S.players.size)],
    ['Secrets déposés', withSecret + ' / ' + S.players.size],
    ['Secrets démasqués', solved + ' / ' + withSecret],
    ['Barème', '+' + g.pointsCorrect + ' trouvé / +' + g.pointsWrong + ' par erreur'],
  ];
  if (g.roundStatus === 'open') {
    lines.splice(2, 0, ['Votes de la journée ' + g.day, votedToday.size + ' / ' + withSecret]);
  }
  for (const [label, value] of lines) {
    const tr = el('tr');
    tr.append(el('th', null, label), el('td', null, value));
    table.appendChild(tr);
  }
  pilot.appendChild(table);

  const actions = el('div', 'row');
  function action(label, cls, enabled, fn, confirmText) {
    const button = el('button', 'btn small ' + cls, label);
    button.type = 'button';
    button.disabled = !enabled;
    button.onclick = async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      button.disabled = true;
      say('pilotMsg', '');
      try { await fn(); say('pilotMsg', label + " : c'est fait.", 'ok'); }
      catch (error) { say('pilotMsg', humanError(error)); button.disabled = false; }
    };
    actions.appendChild(button);
  }
  action('Lancer la partie', '', g.phase === 'lobby', startGame,
    'Lancer la partie ? Les secrets seront verrouillés et la journée 1 ouverte.');
  action('Clôturer & révéler', '', g.roundStatus === 'open', closeDay,
    'Clôturer la journée ? Tous les votes du jour deviennent publics et les points sont attribués.');
  action('Ouvrir la journée suivante', 'ghost', g.phase === 'jeu' && g.roundStatus === 'closed', openNextDay);
  action('Terminer la partie', 'ghost', g.phase !== 'fini', endGame,
    'Terminer la partie ? Tous les secrets restants seront révélés.');
  pilot.appendChild(actions);
  const pmsg = el('div'); pmsg.id = 'pilotMsg'; pilot.appendChild(pmsg);
  screen.appendChild(pilot);

  const people = el('div', 'card');
  people.appendChild(el('h2', null, 'Participants'));
  people.appendChild(el('p', 'muted',
    'Toi seul vois les secrets avec leur auteur, pour pouvoir modérer et animer le reveal à voix haute.'));
  const bySecret = new Map([...S.authorOf.entries()].map(([secretId, uid]) => [uid, secretId]));
  for (const player of [...S.players.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
    const secretId = bySecret.get(player.uid);
    const secret = secretId ? S.secrets.get(secretId) : null;
    const box = el('div', 'secret flat');
    const head = el('p');
    head.appendChild(el('strong', null, player.name));
    head.appendChild(document.createTextNode(' '));
    head.appendChild(el('span', secret ? 'pill' : 'pill bad', secret ? 'Secret ' + secret.code : 'Pas de secret'));
    if (secret && secret.solvedDay != null) head.appendChild(el('span', 'pill grey', ' démasqué '));
    if (g.roundStatus === 'open' && votedToday.has(player.uid)) head.appendChild(el('span', 'pill', ' a voté '));
    box.appendChild(head);
    if (secret) box.appendChild(el('span', 'txt', secret.text));

    if (player.uid !== S.user.uid) {
      const remove = el('button', 'btn small bad', 'Retirer');
      remove.type = 'button';
      remove.onclick = async () => {
        if (!window.confirm('Retirer ' + player.name + ' ? Son secret et ses votes seront effacés.')) return;
        try { await removePlayer(player.uid); }
        catch (error) { window.alert(humanError(error)); }
      };
      box.appendChild(remove);
    }
    people.appendChild(box);
  }
  screen.appendChild(people);

  const settings = el('div', 'card');
  settings.appendChild(el('h2', null, 'Réglages'));
  const form = el('form');
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.maxLength = 40; nameInput.value = g.gameName;
  const okInput = document.createElement('input');
  okInput.type = 'number'; okInput.min = '0'; okInput.max = '100'; okInput.value = String(g.pointsCorrect);
  const koInput = document.createElement('input');
  koInput.type = 'number'; koInput.min = '0'; koInput.max = '100'; koInput.value = String(g.pointsWrong);
  const save = el('button', 'btn full', 'Enregistrer les réglages');
  form.append(el('label', null, 'Nom de la partie'), nameInput,
              el('label', null, 'Points pour une bonne réponse'), okInput,
              el('label', null, "Points pour l'auteur, par personne trompée"), koInput, save);
  form.onsubmit = async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await saveSettings({
        gameName: nameInput.value.trim() || 'Secret BAFA',
        pointsCorrect: Math.max(0, Math.min(100, Math.round(Number(okInput.value) || 0))),
        pointsWrong: Math.max(0, Math.min(100, Math.round(Number(koInput.value) || 0))),
      });
      say('setMsg', 'Réglages enregistrés.', 'ok');
    } catch (error) { say('setMsg', humanError(error)); }
    save.disabled = false;
  };
  settings.appendChild(form);
  const smsg = el('div'); smsg.id = 'setMsg'; settings.appendChild(smsg);

  settings.appendChild(el('h3', null, 'Zone rouge'));
  const danger = el('div', 'row');
  const soft = el('button', 'btn small ghost', 'Nouvelle partie (garder les comptes)');
  soft.type = 'button';
  soft.onclick = async () => {
    if (!window.confirm('Les votes, journées et points sont effacés. Comptes et secrets conservés. Continuer ?')) return;
    try { await resetGame(true); say('setMsg', 'Nouvelle partie prête.', 'ok'); }
    catch (error) { say('setMsg', humanError(error)); }
  };
  const hard = el('button', 'btn small bad', 'Tout effacer');
  hard.type = 'button';
  hard.onclick = async () => {
    if (!window.confirm('TOUT effacer : secrets, votes et points, et les comptes des stagiaires.')) return;
    if (!window.confirm('Dernière confirmation : on efface vraiment tout ?')) return;
    try { await resetGame(false); say('setMsg', 'Tout a été effacé.', 'ok'); }
    catch (error) { say('setMsg', humanError(error)); }
  };
  danger.append(soft, hard);
  settings.appendChild(danger);
  settings.appendChild(el('p', 'muted',
    "« Tout effacer » supprime les comptes dans la base, mais pas dans Firebase Authentication : " +
    "pour repartir totalement de zéro, vide aussi la liste des utilisateurs depuis la console Firebase."));
  screen.appendChild(settings);
}

boot();
