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
  // Points ajoutés ou retirés à la main par l'animateur : { uid: nombre }.
  adjust: {},
};

const S = {
  user: null,
  isAdmin: false,
  admins: new Set(),    // uid des animateurs — lisible par tout le monde
  game: null,
  players: new Map(),   // uid -> {uid, name, hasSecret, revealed}
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
  animPanel: 'pilotage',  // onglet ouvert dans l'espace animateur
  openSheet: null,        // fiche participant dépliée
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
const adminUnsubs = [];

/**
 * Faut-il parler aux émulateurs plutôt qu'au vrai projet ?
 *
 * Sur une machine de développement, oui : sans quoi `npm run serve` et les
 * tests écriraient dans la base de la vraie formation. En ligne, jamais.
 * On le déduit de l'adresse, pour qu'il n'y ait aucun réglage à penser — et
 * donc aucun réglage à oublier de remettre avant de publier.
 * `?prod` force le vrai projet depuis une page locale, au besoin.
 */
function useEmulators() {
  if (typeof firebaseConfig.useEmulators === 'boolean') return firebaseConfig.useEmulators;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return local && !new URLSearchParams(location.search).has('prod');
}

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

  if (useEmulators()) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { /* mode privé */ }

  onAuthStateChanged(auth, async (user) => {
    for (const stop of unsubscribes.splice(0)) stop();
    for (const stop of adminUnsubs.splice(0)) stop();
    S.user = user || null;
    S.isAdmin = false;
    S.admins = new Set();
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
      S.players.set(d.id, {
        uid: d.id, name: data.name,
        hasSecret: data.hasSecret === true, revealed: data.revealed === true,
      });
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

  // Qui est animateur est public : c'est ce qui permet à la page de savoir,
  // sans recharger, qu'on vient de te confier le rôle — ou de te le retirer.
  watch(onSnapshot(collection(db, 'admins'), (snap) => {
    S.admins = new Set(snap.docs.map((d) => d.id));
    syncAdminWatchers();
    render();
  }, onDbError));

  render(true);
}

/**
 * Branche ou débranche les écoutes réservées à l'animateur.
 *
 * Elles portent sur les deux collections que les règles de sécurité ferment
 * aux stagiaires : le lien secret → auteur, et l'ensemble des votes. Les
 * garder abonnées alors qu'on vient de perdre le rôle ferait pleuvoir des
 * refus ; on les coupe, et on oublie ce qu'on en savait.
 */
function syncAdminWatchers() {
  const isAdmin = Boolean(S.user && S.admins.has(S.user.uid));
  if (isAdmin === S.isAdmin) return;
  S.isAdmin = isAdmin;
  for (const stop of adminUnsubs.splice(0)) stop();
  if (!isAdmin) { S.authorOf = new Map(); S.allVotes = []; return; }
  adminUnsubs.push(onSnapshot(collection(db, 'authorOf'), (snap) => {
    S.authorOf = new Map(snap.docs.map((d) => [d.id, d.data().uid]));
    render();
  }, onDbError));
  adminUnsubs.push(onSnapshot(collection(db, 'votes'), (snap) => {
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
/**
 * Les personnes qu'on peut encore accuser : celles qui ont déposé un secret
 * et dont le secret n'a pas été percé. Le drapeau `revealed` est posé par
 * l'animateur au reveal ; c'est le même que consultent les règles de
 * sécurité, pour que la page et la base disent exactement la même chose.
 */
function suspects() {
  return [...S.players.values()]
    .filter((p) => p.hasSecret && !p.revealed && p.uid !== S.user.uid)
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

/**
 * Confie le rôle d'animateur à quelqu'un, ou le lui retire.
 *
 * Le rôle ne se réclame pas : il se donne. Le tout premier animateur est
 * inscrit à la main dans la console Firebase, qui écrit sous l'identité du
 * projet et ne passe donc pas par les règles de sécurité. Depuis
 * l'application, seul un animateur peut en nommer un autre — jamais
 * lui-même, et jamais se révoquer : sinon le rôle se volerait d'un clic, ou
 * se perdrait par mégarde en pleine partie.
 */
async function grantAdmin(uid) {
  if (uid === S.user.uid) throw new Error('Tu es déjà animateur.');
  await setDoc(doc(db, 'admins', uid), { since: Date.now(), by: S.user.uid });
}

async function revokeAdmin(uid) {
  if (uid === S.user.uid) throw new Error("Tu ne peux pas te retirer toi-même le rôle d'animateur.");
  await deleteDoc(doc(db, 'admins', uid));
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

/**
 * Le calcul des points : le seul moment où l'information cachée sert à
 * produire quelque chose de public, et c'est l'animateur qui le publie.
 *
 * `g` est passé en argument plutôt que lu dans l'état global : au moment où
 * l'on publie les scores, la clôture vient d'être écrite et l'instantané
 * local n'est pas forcément revenu. Prendre l'état qu'on vient d'écrire est
 * la seule façon de ne pas oublier les points de la journée qu'on clôture.
 */
function computeScores(allVotes, authorOf, g) {
  const counted = (vote) => vote.day < g.day || (vote.day === g.day && g.roundStatus === 'closed');
  const adjust = g.adjust || {};
  const rows = new Map(
    [...S.players.values()].map((p) => [p.uid, {
      uid: p.uid, name: p.name, found: 0, fooled: 0,
      bonus: Math.round(Number(adjust[p.uid]) || 0),
      points: Math.round(Number(adjust[p.uid]) || 0),
    }])
  );
  for (const vote of allVotes) {
    if (!counted(vote)) continue;
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

/** Recalcule et republie le classement à partir de l'état frais de la base. */
async function publishScores(g) {
  const { votes, authorOf } = await freshAdminData();
  await setDoc(doc(db, 'scores', 'state'), { rows: computeScores(votes, authorOf, g), day: g.day });
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
    // Démasqué : cette personne sort de la liste des suspects. Le drapeau est
    // public — c'est lui que les règles de sécurité consultent pour refuser
    // qu'on l'accuse encore les jours suivants.
    if (S.players.has(author)) batch.update(doc(db, 'players', author), { revealed: true });
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
  const after = { ...g, roundStatus: 'closed', phase: remaining.length === 0 ? 'fini' : 'jeu' };
  batch.update(doc(db, 'game', 'state'),
    { roundStatus: after.roundStatus, phase: after.phase });
  await batch.commit();

  await publishScores(after);
}

async function openNextDay() {
  const g = game();
  if (g.phase === 'fini') throw new Error('La partie est terminée.');
  if (g.roundStatus === 'open') throw new Error('Une journée est déjà ouverte.');
  await updateDoc(doc(db, 'game', 'state'), { day: g.day + 1, roundStatus: 'open' });
}

async function endGame() {
  if (game().roundStatus === 'open') await closeDay();
  const g = game();
  const { authorOf } = await freshAdminData();
  const nameOf = (uid) => (S.players.get(uid) ? S.players.get(uid).name : '?');
  const batch = writeBatch(db);
  for (const secret of S.secrets.values()) {
    if (secret.authorUid) continue;
    const author = authorOf.get(secret.id);
    if (!author) continue;
    batch.update(doc(db, 'secrets', secret.id), { authorUid: author, authorName: nameOf(author) });
  }
  batch.update(doc(db, 'game', 'state'), { phase: 'fini' });
  await batch.commit();
  await publishScores({ ...g, phase: 'fini' });
}

async function saveSettings(patch) {
  await updateDoc(doc(db, 'game', 'state'), patch);
  await publishScores({ ...game(), ...patch });
}

/** Ajoute ou retire des points à la main, sans toucher aux votes. */
async function adjustPoints(uid, points) {
  const value = Math.round(Number(points) || 0);
  const adjust = { ...(game().adjust || {}) };
  if (value === 0) delete adjust[uid]; else adjust[uid] = value;
  await saveSettings({ adjust });
}

/** Annule un vote saisi par erreur : la personne pourra revoter aujourd'hui. */
async function cancelVote(voteId) {
  await deleteDoc(doc(db, 'votes', voteId));
  await publishScores(game());
}

/**
 * Supprime un secret déplacé. Les votes qui le visaient partent avec lui —
 * les laisser fausserait les points et afficherait un secret fantôme au
 * reveal. Son auteur peut alors en déposer un autre si la partie n'est pas
 * encore lancée.
 */
async function deleteSecret(secretId) {
  const author = S.authorOf.get(secretId);
  const batch = writeBatch(db);
  for (const vote of S.allVotes.filter((v) => v.secretId === secretId)) {
    batch.delete(doc(db, 'votes', vote.id));
  }
  batch.delete(doc(db, 'secrets', secretId));
  batch.delete(doc(db, 'authorOf', secretId));
  if (author) {
    batch.delete(doc(db, 'mine', author));
    batch.update(doc(db, 'players', author), { hasSecret: false, revealed: false });
  }
  await batch.commit();
  await publishScores(game());
}

async function removePlayer(uid) {
  const batch = writeBatch(db);
  for (const vote of S.allVotes.filter((v) => v.voter === uid)) batch.delete(doc(db, 'votes', vote.id));
  const owned = [...S.authorOf.entries()].find(([, owner]) => owner === uid);
  if (owned) {
    const secretId = owned[0];
    for (const vote of S.allVotes.filter((v) => v.secretId === secretId)) {
      batch.delete(doc(db, 'votes', vote.id));
    }
    batch.delete(doc(db, 'secrets', secretId));
    batch.delete(doc(db, 'authorOf', secretId));
  }
  batch.delete(doc(db, 'admins', uid));
  batch.delete(doc(db, 'mine', uid));
  batch.delete(doc(db, 'players', uid));
  await batch.commit();
  await publishScores(game());
}

async function resetGame(keepPlayers) {
  const g = game();
  const batch = writeBatch(db);
  for (const vote of S.allVotes) batch.delete(doc(db, 'votes', vote.id));
  for (let day = 1; day <= g.day; day += 1) batch.delete(doc(db, 'results', String(day)));
  if (keepPlayers) {
    for (const secret of S.secrets.values()) {
      batch.update(doc(db, 'secrets', secret.id), { solvedDay: null, authorUid: null, authorName: null });
    }
    for (const player of S.players.values()) {
      if (player.revealed) batch.update(doc(db, 'players', player.uid), { revealed: false });
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
  batch.update(doc(db, 'game', 'state'), { phase: 'lobby', day: 0, roundStatus: null, adjust: {} });
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

/**
 * L'en-tête porte le logo tant que la partie garde son nom ; si l'animateur
 * la rebaptise, c'est ce nom-là qui s'affiche — un logo qui dirait autre
 * chose que le titre serait un mensonge poli.
 */
function renderBrand() {
  const name = game().gameName;
  const brand = clear($('brand'));
  if (name === DEFAULT_GAME.gameName) {
    const mark = el('span', 'wordmark');
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', 'Secret BAFA');
    brand.appendChild(mark);
  } else {
    brand.appendChild(el('span', 'brand__text', name));
  }
}

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

  renderBrand();
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
    // Un palier par secret : on voit le chemin parcouru et celui qui reste.
    const ticks = clear($('progressTicks'));
    for (let i = 1; i < total && total <= 40; i += 1) {
      const tick = document.createElement('i');
      tick.style.left = (i / total) * 100 + '%';
      ticks.appendChild(tick);
    }
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
  const logo = el('div', 'wordmark big');
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'Secret BAFA');
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

/** Un champ en lecture seule + un bouton « copier », pour un identifiant
 *  qu'on doit transporter jusqu'à la console Firebase sans le recopier. */
function copyField(value, label) {
  const wrap = el('div', 'copyline');
  const field = document.createElement('input');
  field.type = 'text'; field.readOnly = true; field.value = value;
  field.setAttribute('aria-label', label || 'À copier');
  field.onclick = () => field.select();
  const button = el('button', 'btn small', 'Copier');
  button.type = 'button';
  button.onclick = async () => {
    field.select();
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'Copié !';
    } catch (e) {
      // Navigateur ancien ou page non sécurisée : le texte est déjà
      // sélectionné, il ne reste qu'un appui long ou un Ctrl+C.
      button.textContent = 'Fais Ctrl+C';
    }
    setTimeout(() => { button.textContent = 'Copier'; }, 2400);
  };
  wrap.append(field, button);
  return wrap;
}

/** Ce que voit quelqu'un qui n'est pas animateur : comment le devenir. */
function renderAdminBootstrap(screen) {
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Espace animateur'));

  if (S.admins.size) {
    const names = [...S.admins].map((uid) => (S.players.get(uid) || {}).name).filter(Boolean);
    card.appendChild(el('p', 'muted', names.length
      ? 'Cette partie est animée par ' + names.join(', ') + '.'
      : "Cette partie a déjà un animateur."));
    card.appendChild(el('p', 'muted',
      "Si tu es le formateur et que tu devrais en faire partie, demande à un animateur de te nommer depuis sa page : c'est instantané."));
  } else {
    card.appendChild(el('p', 'muted',
      "Personne ne pilote encore cette partie. Le rôle d'animateur ne se réclame pas d'un clic — sinon le premier stagiaire curieux verrait tous les secrets. Il s'inscrit une fois dans la console Firebase, qui n'appartient qu'à toi."));
  }

  card.appendChild(el('h3', null, 'Ton identifiant'));
  card.appendChild(copyField(S.user.uid, 'Ton identifiant technique'));
  card.appendChild(el('p', 'muted',
    "C'est le nom que Firebase donne à ton compte. Il ne sert qu'à cette mise en place."));

  if (!S.admins.size) {
    card.appendChild(el('h3', null, 'Te nommer animateur — une seule fois'));
    const steps = el('ol');
    [
      ['Ouvre la console', 'console.firebase.google.com → ton projet → Firestore Database → onglet Données.'],
      ['Démarre une collection', 'Clique « Démarrer une collection » et nomme-la exactement admins (en minuscules).'],
      ['Colle ton identifiant', "Comme « ID du document », colle l'identifiant ci-dessus. Ajoute un champ since, de type number, avec la valeur 1."],
      ['Enregistre', 'Reviens sur cette page : elle bascule toute seule, sans recharger.'],
    ].forEach(([title, detail]) => {
      const item = el('li');
      item.appendChild(el('strong', null, title));
      item.appendChild(el('div', 'muted', detail));
      steps.appendChild(item);
    });
    card.appendChild(steps);
    card.appendChild(el('p', 'muted',
      "Ensuite, tu pourras nommer un second animateur directement depuis cette page — plus besoin de la console."));
  }
  screen.appendChild(card);
}

/* ── le tableau de bord ────────────────────────────────────────────────── */

function adminFacts() {
  const g = game();
  const withSecret = S.secrets.size;
  const solved = [...S.secrets.values()].filter((s) => s.solvedDay != null).length;
  const votedToday = new Set(S.allVotes.filter((v) => v.day === g.day).map((v) => v.voter));
  const expected = [...S.players.values()].filter((p) => p.hasSecret);
  const missing = g.roundStatus === 'open'
    ? expected.filter((p) => !votedToday.has(p.uid)).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    : [];
  return { g, withSecret, solved, votedToday, expected, missing };
}

const nameOf = (uid) => (S.players.get(uid) ? S.players.get(uid).name : '?');

/** Un vote vu par l'animateur : qui, quel secret, qui il accuse, juste ou faux. */
function adminVoteRow(vote) {
  const secret = S.secrets.get(vote.secretId);
  const author = S.authorOf.get(vote.secretId);
  const correct = Boolean(author && vote.guess === author);
  const row = el('div', 'vote' + (correct ? ' hit' : ''));
  const head = el('p', null,
    nameOf(vote.voter) + ' → secret ' + (secret ? secret.code : '?') + ' → ' + nameOf(vote.guess));
  row.appendChild(head);
  row.appendChild(el('span', 'pill' + (correct ? '' : ' bad'),
    correct ? 'Juste' : "Faux — c'est " + nameOf(author)));
  return row;
}

function renderPilotage(screen) {
  const { g, withSecret, solved, votedToday, expected, missing } = adminFacts();

  const board = el('div', 'card');
  board.appendChild(el('h2', null, 'Tableau de bord'));
  const table = el('table');
  const lines = [
    ['Où on en est', phaseText()],
    ['Inscrits', String(S.players.size)],
    ['Secrets déposés', withSecret + ' / ' + S.players.size],
    ['Secrets démasqués', solved + ' / ' + withSecret],
    ['Barème', '+' + g.pointsCorrect + ' trouvé · +' + g.pointsWrong + ' par personne trompée'],
  ];
  if (g.roundStatus === 'open') {
    lines.splice(3, 0, ['Votes de la journée ' + g.day, votedToday.size + ' / ' + expected.length]);
  }
  for (const [label, value] of lines) {
    const tr = el('tr');
    tr.append(el('th', null, label), el('td', null, value));
    table.appendChild(tr);
  }
  board.appendChild(table);

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
  board.appendChild(actions);
  const pmsg = el('div'); pmsg.id = 'pilotMsg'; board.appendChild(pmsg);
  screen.appendChild(board);

  // ── Qui n'a pas encore voté, nommément : de quoi relancer les gens de
  //    vive voix pendant la pause, au lieu d'attendre en regardant un chiffre.
  if (g.roundStatus === 'open') {
    const relance = el('div', 'card');
    relance.appendChild(el('h2', null, 'À relancer'));
    if (!missing.length) {
      relance.appendChild(el('p', null, expected.length
        ? 'Tout le monde a voté. Tu peux clôturer la journée.'
        : "Personne n'a encore déposé de secret."));
    } else {
      relance.appendChild(el('p', 'muted',
        plural(missing.length, "personne n'a pas voté", "personnes n'ont pas voté") + ' pour la journée ' + g.day + ' :'));
      const chips = el('div', 'chips');
      for (const person of missing) chips.appendChild(el('span', 'chip', person.name));
      relance.appendChild(chips);
    }
    screen.appendChild(relance);
  }

  // ── Les votes en direct : ce qui prépare l'animation du soir.
  const live = el('div', 'card');
  const dayVotes = S.allVotes.filter((v) => v.day === g.day)
    .sort((a, b) => nameOf(a.voter).localeCompare(nameOf(b.voter), 'fr'));
  live.appendChild(el('h2', null, 'Les votes de la journée ' + g.day));
  if (g.phase === 'lobby') {
    live.appendChild(el('p', 'muted', "La partie n'a pas encore commencé."));
  } else if (!dayVotes.length) {
    live.appendChild(el('p', 'muted', 'Aucun vote pour le moment.'));
  } else {
    live.appendChild(el('p', 'muted', g.roundStatus === 'open'
      ? "Toi seul les vois. Les stagiaires ne les découvriront qu'à la clôture."
      : 'Journée révélée : tout le monde les voit.'));
    for (const vote of dayVotes) live.appendChild(adminVoteRow(vote));
  }
  screen.appendChild(live);
}

/* ── une fiche par participant ─────────────────────────────────────────── */

function renderParticipants(screen) {
  const { g, votedToday } = adminFacts();
  const secretOf = new Map([...S.authorOf.entries()].map(([secretId, uid]) => [uid, secretId]));
  const scoreOf = new Map(S.scores.map((row) => [row.uid, row]));

  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Participants'));
  card.appendChild(el('p', 'muted',
    'Toi seul vois les secrets avec leur auteur, pour pouvoir modérer et animer le reveal à voix haute. Touche une fiche pour la déplier.'));

  const people = [...S.players.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (!people.length) card.appendChild(el('p', 'muted', 'Personne ne s’est encore inscrit.'));

  for (const person of people) {
    const secretId = secretOf.get(person.uid);
    const secret = secretId ? S.secrets.get(secretId) : null;
    const score = scoreOf.get(person.uid);
    const open = S.openSheet === person.uid;

    const box = el('div', 'sheet' + (open ? ' open' : ''));
    const head = el('button', 'sheet__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    const title = el('span', 'sheet__name', person.name);
    if (S.admins.has(person.uid)) title.appendChild(el('span', 'pill violet', 'animateur'));
    head.appendChild(title);
    const badges = el('span', 'sheet__badges');
    badges.appendChild(el('span', secret ? 'pill' : 'pill bad', secret ? 'Secret ' + secret.code : 'Pas de secret'));
    if (person.revealed) badges.appendChild(el('span', 'pill grey', 'démasqué'));
    if (g.roundStatus === 'open') {
      badges.appendChild(votedToday.has(person.uid)
        ? el('span', 'pill', 'a voté')
        : el('span', 'pill bad', 'pas voté'));
    }
    if (score) badges.appendChild(el('span', 'pill grey', score.points + ' pts'));
    head.appendChild(badges);
    head.onclick = () => { S.openSheet = open ? null : person.uid; render(true); };
    box.appendChild(head);

    if (!open) { card.appendChild(box); continue; }

    const body = el('div', 'sheet__body');
    if (secret) {
      body.appendChild(el('h3', null, 'Son secret'));
      const quote = el('div', 'secret flat');
      quote.appendChild(el('span', 'code', 'Secret ' + secret.code));
      quote.appendChild(el('span', 'txt', secret.text));
      if (secret.solvedDay != null) {
        quote.appendChild(el('span', 'who', 'Démasqué journée ' + secret.solvedDay));
      }
      body.appendChild(quote);
    }

    body.appendChild(el('h3', null, 'Ses points'));
    const table = el('table');
    for (const [label, value] of [
      ['Total', score ? String(score.points) : '0'],
      ['Secrets trouvés', score ? String(score.found) : '0'],
      ['Personnes trompées par son secret', score ? String(score.fooled) : '0'],
      ['Ajustement manuel', score && score.bonus ? (score.bonus > 0 ? '+' : '') + score.bonus : '—'],
    ]) {
      const tr = el('tr');
      tr.append(el('th', null, label), el('td', null, value));
      table.appendChild(tr);
    }
    body.appendChild(table);

    const history = S.allVotes.filter((v) => v.voter === person.uid).sort((a, b) => a.day - b.day);
    body.appendChild(el('h3', null, 'Ses votes'));
    if (!history.length) body.appendChild(el('p', 'muted', "Elle ou il n'a encore voté aucun jour."));
    for (const vote of history) {
      const target = S.secrets.get(vote.secretId);
      const author = S.authorOf.get(vote.secretId);
      const correct = Boolean(author && vote.guess === author);
      const line = el('div', 'histline');
      line.appendChild(el('span', 'day', 'J' + vote.day));
      line.appendChild(el('span', 'what',
        'secret ' + (target ? target.code : '?') + ' → ' + nameOf(vote.guess)));
      line.appendChild(el('span', 'pill' + (correct ? '' : ' bad'), correct ? 'juste' : 'faux'));
      const undo = el('button', 'linkbtn', 'annuler');
      undo.type = 'button';
      undo.onclick = async () => {
        if (!window.confirm('Annuler le vote de ' + person.name + ' pour la journée ' + vote.day +
          " ?\n\nS'il s'agit de la journée en cours, la personne pourra revoter.")) return;
        try { await cancelVote(vote.id); say('sheetMsg', 'Vote annulé.', 'ok'); }
        catch (error) { say('sheetMsg', humanError(error)); }
      };
      line.appendChild(undo);
      body.appendChild(line);
    }

    body.appendChild(el('h3', null, 'Agir sur cette personne'));
    const form = el('div', 'row');

    const bonusInput = document.createElement('input');
    bonusInput.type = 'number'; bonusInput.step = '1'; bonusInput.className = 'tiny';
    bonusInput.value = String(score && score.bonus ? score.bonus : 0);
    bonusInput.setAttribute('aria-label', 'Points à ajouter ou retirer à ' + person.name);
    const applyBonus = el('button', 'btn small ghost', 'Ajuster les points');
    applyBonus.type = 'button';
    applyBonus.onclick = async () => {
      try {
        await adjustPoints(person.uid, bonusInput.value);
        say('sheetMsg', 'Points ajustés pour ' + person.name + '.', 'ok');
      } catch (error) { say('sheetMsg', humanError(error)); }
    };
    form.append(bonusInput, applyBonus);

    if (secret) {
      const dropSecret = el('button', 'btn small ghost', 'Supprimer son secret');
      dropSecret.type = 'button';
      dropSecret.onclick = async () => {
        if (!window.confirm('Supprimer le secret de ' + person.name + ' ?\n\n' +
          "Les votes qui le visaient seront effacés. Si la partie n'est pas lancée, la personne pourra en déposer un autre.")) return;
        try { await deleteSecret(secret.id); say('sheetMsg', 'Secret supprimé.', 'ok'); }
        catch (error) { say('sheetMsg', humanError(error)); }
      };
      form.appendChild(dropSecret);
    }

    if (person.uid !== S.user.uid) {
      if (S.admins.has(person.uid)) {
        const revoke = el('button', 'btn small ghost', "Retirer le rôle d'animateur");
        revoke.type = 'button';
        revoke.onclick = async () => {
          if (!window.confirm('Retirer le rôle d’animateur à ' + person.name +
            " ?\n\nCette personne ne verra plus les secrets ni les votes.")) return;
          try { await revokeAdmin(person.uid); say('sheetMsg', 'Rôle retiré.', 'ok'); }
          catch (error) { say('sheetMsg', humanError(error)); }
        };
        form.appendChild(revoke);
      } else {
        const grant = el('button', 'btn small ghost', 'Nommer animateur');
        grant.type = 'button';
        grant.onclick = async () => {
          if (!window.confirm('Nommer ' + person.name + " animateur ?\n\n" +
            'Cette personne verra tous les secrets, leur auteur et tous les votes, et pourra piloter la partie.')) return;
          try { await grantAdmin(person.uid); say('sheetMsg', person.name + ' est animateur.', 'ok'); }
          catch (error) { say('sheetMsg', humanError(error)); }
        };
        form.appendChild(grant);
      }

      const remove = el('button', 'btn small bad', 'Retirer de la partie');
      remove.type = 'button';
      remove.onclick = async () => {
        if (!window.confirm('Retirer ' + person.name + ' ? Son secret et ses votes seront effacés.')) return;
        try { S.openSheet = null; await removePlayer(person.uid); }
        catch (error) { say('sheetMsg', humanError(error)); }
      };
      form.appendChild(remove);
    }
    body.appendChild(form);
    const msg = el('div'); msg.id = 'sheetMsg'; body.appendChild(msg);

    box.appendChild(body);
    card.appendChild(box);
  }
  screen.appendChild(card);
}

/* ── l'historique complet ──────────────────────────────────────────────── */

function renderHistory(screen) {
  const g = game();
  const card = el('div', 'card');
  card.appendChild(el('h2', null, 'Historique complet'));
  card.appendChild(el('p', 'muted',
    'Toutes les journées, tous les votes depuis le début, avec la vérité en face.'));

  const days = [...new Set(S.allVotes.map((v) => v.day))].sort((a, b) => b - a);
  if (!days.length) {
    card.appendChild(el('p', 'muted', "Aucun vote n'a encore été enregistré."));
    return screen.appendChild(card);
  }

  for (const day of days) {
    const votes = S.allVotes.filter((v) => v.day === day)
      .sort((a, b) => nameOf(a.voter).localeCompare(nameOf(b.voter), 'fr'));
    const right = votes.filter((v) => S.authorOf.get(v.secretId) === v.guess).length;
    card.appendChild(el('h3', null, 'Journée ' + day +
      (day === g.day && g.roundStatus === 'open' ? ' — en cours' : '') +
      ' · ' + right + ' juste' + (right > 1 ? 's' : '') + ' sur ' + votes.length));
    for (const vote of votes) card.appendChild(adminVoteRow(vote));
  }
  screen.appendChild(card);
}

/* ── les réglages ──────────────────────────────────────────────────────── */

function renderAdminSettings(screen) {
  const g = game();

  const team = el('div', 'card');
  team.appendChild(el('h2', null, 'Les animateurs'));
  team.appendChild(el('p', 'muted',
    "Un animateur voit tout et pilote la partie. Tu peux en nommer d'autres, et leur retirer ce droit — depuis la fiche de la personne, dans l'onglet Participants."));
  const list = el('div', 'chips');
  for (const uid of S.admins) {
    const chip = el('span', 'chip violet',
      (S.players.get(uid) ? S.players.get(uid).name : 'compte inconnu') +
      (uid === S.user.uid ? ' (toi)' : ''));
    list.appendChild(chip);
  }
  team.appendChild(list);
  team.appendChild(el('p', 'muted',
    "Tu ne peux pas te retirer toi-même le rôle : c'est ce qui garantit qu'une partie n'est jamais orpheline. Demande-le à un autre animateur."));
  screen.appendChild(team);

  const settings = el('div', 'card');
  settings.appendChild(el('h2', null, 'Nom et barème'));
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
      say('setMsg', 'Réglages enregistrés. Les points sont recalculés.', 'ok');
    } catch (error) { say('setMsg', humanError(error)); }
    save.disabled = false;
  };
  settings.appendChild(form);

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
  const smsg = el('div'); smsg.id = 'setMsg'; settings.appendChild(smsg);
  settings.appendChild(el('p', 'muted',
    "« Tout effacer » supprime les comptes dans la base, mais pas dans Firebase Authentication : " +
    "pour repartir totalement de zéro, vide aussi la liste des utilisateurs depuis la console Firebase."));
  screen.appendChild(settings);
}

const ANIM_PANELS = [
  ['pilotage', 'Pilotage', renderPilotage],
  ['participants', 'Participants', renderParticipants],
  ['historique', 'Historique', renderHistory],
  ['reglages', 'Réglages', renderAdminSettings],
];

function renderAnim(screen) {
  if (!S.isAdmin) return renderAdminBootstrap(screen);

  const switcher = el('div', 'segments');
  for (const [id, label] of ANIM_PANELS) {
    const button = el('button', null, label);
    button.type = 'button';
    button.setAttribute('aria-selected', String(S.animPanel === id));
    button.onclick = () => { S.animPanel = id; render(true); };
    switcher.appendChild(button);
  }
  screen.appendChild(switcher);

  const panel = ANIM_PANELS.find(([id]) => id === S.animPanel) || ANIM_PANELS[0];
  panel[2](screen);
}

boot();
