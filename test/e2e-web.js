'use strict';

/**
 * Partie complète jouée dans un navigateur, contre les émulateurs Firebase.
 *
 * Vérifie non seulement que le jeu fonctionne, mais aussi — et surtout — qu'un
 * stagiaire ne peut pas lire ce qui doit rester caché, en tentant vraiment la
 * lecture depuis sa page.
 *
 * Lancement : npm run test:web
 */

const path = require('path');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const PASSWORD = 'motdepasse';
const PLAYERS = [
  ['Alice', "J'ai déjà dormi une nuit entière dans une cabane à outils du centre."],
  ['Bruno', 'Je connais tout Le Roi Lion par cœur, chansons comprises.'],
  ['Chloé', "J'ai une peur panique des pigeons depuis mes 8 ans, c'est ridicule."],
  ['Diego', 'Je mange absolument toutes mes pizzas avec une fourchette et un couteau.'],
  ['Nour', "Je parle encore à ma peluche de quand j'étais petite. Elle s'appelle Prune."],
];

const problems = [];
let browser;
const contexts = new Map();

async function pageFor(name) {
  if (!contexts.has(name)) {
    contexts.set(name, await browser.newContext({ viewport: { width: 400, height: 880 } }));
  }
  const page = await contexts.get(name).newPage();
  page.on('pageerror', (e) => problems.push(`${name} : ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    // Firestore journalise les refus attendus ; seuls les vrais plantages comptent.
    if (m.type() === 'error' && !text.includes('permission-denied') && !text.includes('Missing or insufficient')) {
      problems.push(`${name} [console] ${text}`);
    }
  });
  page.on('dialog', (d) => d.accept());
  return page;
}

const tab = (page, label) =>
  page.click(`nav.tabs button:text-is(${JSON.stringify(label)})`);

/** Ouvre la page et s'assure d'y être connecté — que la session existe déjà ou non. */
async function signIn(page, name, mode) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav.tabs:not(.hidden), input[autocomplete="username"]', { timeout: 20000 });
  if (await page.$('nav.tabs:not(.hidden)')) return;   // session déjà ouverte
  await page.click(mode === 'login' ? 'button:text-is("Se connecter")' : 'button:text-is("Créer mon compte")');
  await page.fill('input[autocomplete="username"]', name);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click(mode === 'login' ? 'button:text-is("Entrer dans la partie")' : 'button:text-is("Je m\'inscris")');
  await page.waitForSelector('nav.tabs:not(.hidden), #authMsg .msg', { timeout: 20000 });
  const failure = await page.$('#authMsg .msg');
  if (failure) throw new Error(name + ' : ' + (await failure.textContent()));
}

(async () => {
  browser = await chromium.launch();

  /* ── 1. l'animateur prend son rôle avant tout le monde ─────────────── */
  const alice = await pageFor('Alice');
  await signIn(alice, 'Alice', 'register');
  await tab(alice, 'Animateur');
  await alice.click('button:text-is("Devenir animateur")');
  await alice.waitForSelector('button:text("Lancer la partie")', { timeout: 20000 });

  /* ── 2. tout le monde s'inscrit et dépose son secret ───────────────── */
  for (const [name, secret] of PLAYERS) {
    const page = name === 'Alice' ? alice : await pageFor(name);
    if (name !== 'Alice') await signIn(page, name, 'register');
    else { await tab(page, 'Mon secret'); }
    await page.fill('textarea', secret);
    await page.click('button:text("Déposer mon secret")');
    await page.waitForSelector('#secretMsg .msg.ok', { timeout: 20000 });
    if (name !== 'Alice') await page.close();
  }

  /* ── 3. l'animateur voit qui a écrit quoi, et lance ────────────────── */
  await tab(alice, 'Animateur');
  await alice.waitForSelector('.secret .pill', { timeout: 20000 });
  const codeByName = Object.fromEntries(await alice.$$eval('#screen .card:nth-of-type(2) .secret', (boxes) =>
    boxes.map((box) => {
      const who = box.querySelector('strong');
      const pill = box.querySelector('.pill');
      return [who ? who.textContent : '', pill ? pill.textContent.replace('Secret ', '') : ''];
    })));
  assert.strictEqual(Object.keys(codeByName).length, 5, 'la vue animateur doit lister les 5 participants');
  for (const [name] of PLAYERS) {
    assert.ok(codeByName[name] && codeByName[name].length === 3,
      `l'animateur doit voir le secret de ${name}`);
  }

  await alice.click('button:text("Lancer la partie")');
  await alice.waitForSelector('#pilotMsg .msg.ok', { timeout: 20000 });

  /* ── 4. un stagiaire ne peut pas lire ce qui est caché ─────────────── */
  const bruno = await pageFor('Bruno');
  await signIn(bruno, 'Bruno', 'login');
  const probe = await bruno.evaluate(async (password) => {
    const fb = await import('/js/firebase.js');
    const { firebaseConfig, ACCOUNT_DOMAIN } = await import('/js/config.js');
    const app = fb.initializeApp(firebaseConfig, 'sonde-' + Date.now());
    const auth = fb.getAuth(app);
    const db = fb.getFirestore(app);
    if (firebaseConfig.useEmulators) {
      fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    await fb.signInWithEmailAndPassword(auth, 'bruno@' + ACCOUNT_DOMAIN, password);

    const attempt = async (label, fn) => {
      try { await fn(); return [label, 'LU']; }
      catch (e) { return [label, 'REFUSÉ']; }
    };
    return Object.fromEntries(await Promise.all([
      attempt('authorOf', () => fb.getDocs(fb.collection(db, 'authorOf'))),
      attempt('votes', () => fb.getDocs(fb.collection(db, 'votes'))),
      attempt('mine-des-autres', () => fb.getDoc(fb.doc(db, 'mine', 'un-autre-uid'))),
      attempt('secrets', () => fb.getDocs(fb.collection(db, 'secrets'))),
      attempt('players', () => fb.getDocs(fb.collection(db, 'players'))),
    ]));
  }, PASSWORD);

  assert.strictEqual(probe.authorOf, 'REFUSÉ', "un joueur ne doit PAS pouvoir lire les liens d'auteur");
  assert.strictEqual(probe.votes, 'REFUSÉ', 'un joueur ne doit PAS pouvoir lire les votes');
  assert.strictEqual(probe['mine-des-autres'], 'REFUSÉ', "un joueur ne doit PAS voir le secret attribué à un autre");
  assert.strictEqual(probe.secrets, 'LU', 'le texte des secrets, lui, est public');
  assert.strictEqual(probe.players, 'LU', 'la liste des joueurs est publique');
  console.log('  ✓ depuis le navigateur d\'un stagiaire : ' + JSON.stringify(probe));

  /* ── 5. les votes de la journée 1 ──────────────────────────────────── */
  // Alice et Chloé trouvent Bruno ; Bruno se trompe sur Chloé ; Nour sur Alice.
  const votes = [
    ['Alice', 'Bruno', 'Bruno'],
    ['Chloé', 'Bruno', 'Bruno'],
    ['Bruno', 'Chloé', 'Diego'],
    ['Nour', 'Alice', 'Diego'],
  ];
  for (const [voter, secretOwner, accused] of votes) {
    const page = voter === 'Alice' ? alice : (voter === 'Bruno' ? bruno : await pageFor(voter));
    await signIn(page, voter, 'login');
    await tab(page, 'Voter');
    await page.waitForSelector('button.secret', { timeout: 20000 });
    await page.click(`button.secret:has(.code:text-is("Secret ${codeByName[secretOwner]}"))`);
    await page.selectOption('select', { label: accused });
    await page.click('button:text("Valider mon vote")');
    await page.waitForSelector('.secret.flat .who', { timeout: 20000 });
    if (voter !== 'Alice' && voter !== 'Bruno') await page.close();
  }
  console.log('  ✓ quatre votes enregistrés');

  /* ── 6. le reveal ─────────────────────────────────────────────────── */
  await signIn(alice, 'Alice', 'login');
  await tab(alice, 'Animateur');
  await alice.click('button:text("Clôturer & révéler")');
  await alice.waitForSelector('#pilotMsg .msg.ok', { timeout: 20000 });

  await tab(alice, 'Résultats');
  await alice.waitForSelector('.vote', { timeout: 20000 });
  const verdicts = await alice.$$eval('.vote', (rows) => rows.map((r) => r.textContent));
  assert.strictEqual(verdicts.length, 4, 'les quatre votes doivent être publiés');
  assert.strictEqual(verdicts.filter((v) => v.includes('Trouvé !')).length, 2, 'deux personnes ont trouvé');

  // Le point clé du jeu : un vote raté ne nomme jamais un auteur encore en lice.
  const rates = verdicts.filter((v) => v.includes('Raté'));
  assert.strictEqual(rates.length, 2);
  for (const verdict of rates) {
    assert.ok(verdict.includes("reste dans l'ombre"),
      'un vote raté ne doit pas nommer l’auteur : ' + verdict);
    for (const [name] of PLAYERS) {
      if (name === 'Diego') continue;   // Diego est l'accusé, son nom est normal
      assert.ok(!verdict.includes("c'était " + name), 'auteur révélé à tort : ' + verdict);
    }
  }
  console.log('  ✓ le reveal ne grille aucun secret encore en jeu');

  /* ── 7. le classement ─────────────────────────────────────────────── */
  await tab(alice, 'Classement');
  await alice.waitForSelector('.rank', { timeout: 20000 });
  const ranking = await alice.$$eval('.rank', (rows) => rows.map((r) => ({
    name: r.querySelector('.who').firstChild.textContent.trim(),
    points: parseInt(r.querySelector('.pts').textContent, 10),
  })));
  const points = Object.fromEntries(ranking.map((r) => [r.name, r.points]));
  // Alice +3 (trouvé) +1 (Nour s'est trompée sur son secret) = 4
  // Chloé +3 (trouvé) +1 (Bruno s'est trompé sur son secret) = 4
  // Bruno, Diego, Nour : 0
  assert.deepStrictEqual(points, { Alice: 4, Chloé: 4, Bruno: 0, Diego: 0, Nour: 0 },
    'barème incorrect : ' + JSON.stringify(points));
  console.log('  ✓ barème correct : ' + JSON.stringify(points));

  /* ── 8. le secret démasqué est bien sorti du jeu ───────────────────── */
  await tab(alice, 'Les secrets');
  await alice.waitForSelector('.secret.solved', { timeout: 20000 });
  const solved = await alice.$$eval('.secret.solved .who', (els) => els.map((e) => e.textContent));
  assert.strictEqual(solved.length, 1, 'un seul secret démasqué');
  assert.ok(solved[0].includes('Bruno'), 'le secret démasqué est celui de Bruno');
  console.log('  ✓ ' + solved[0]);

  await browser.close();
  if (problems.length) {
    console.error('\nERREURS JS :\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('\nPartie complète jouée en navigateur : tout est conforme.');
})().catch(async (error) => {
  console.error('ÉCHEC :', error.message);
  if (browser) await browser.close();
  process.exit(1);
});
