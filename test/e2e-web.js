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
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright',
                 '/opt/node22/lib/node_modules/playwright',
                 '/usr/lib/node_modules/playwright'].filter(Boolean);
  for (const where of tries) {
    try { return require(where); } catch (e) { /* on essaie le suivant */ }
  }
  console.error(
    "Playwright est introuvable. Installe-le une fois :\n" +
    "  npm install -g playwright && npx playwright install chromium\n" +
    "puis relance npm run test:web.");
  process.exit(1);
}
const { chromium } = loadPlaywright();

/* ── la console Firebase, simulée ───────────────────────────────────────
 * L'émulateur accepte le jeton « owner » : il écrit alors sous l'identité du
 * projet, exactement comme la console web, sans passer par les règles de
 * sécurité. C'est le seul chemin par lequel le premier animateur peut être
 * nommé — et ce test le prouve autant qu'il s'en sert.
 */
const { firebaseConfig } = (() => {
  // On lit le même fichier que la page : l'émulateur range les données sous
  // l'identifiant de projet que le navigateur lui annonce, pas sous celui
  // passé en ligne de commande. Se tromper ici reviendrait à inspecter une
  // base vide en croyant que le jeu ne marche pas.
  const source = require('fs').readFileSync(path.join(__dirname, '..', 'web', 'js', 'config.js'), 'utf8');
  const block = source.match(/const firebaseConfig = (\{[\s\S]*?\});/);
  return { firebaseConfig: eval('(' + block[1] + ')') };
})();
const EMU = 'http://127.0.0.1:' + (process.env.FIRESTORE_EMULATOR_PORT || 8080) +
  '/v1/projects/' + firebaseConfig.projectId + '/databases/(default)/documents';

async function asProjectOwner(method, pathPart, body) {
  const res = await fetch(EMU + pathPart, {
    method,
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(method + ' ' + pathPart + ' → ' + res.status + ' ' + (await res.text()));
  return res.json();
}

/** L'identifiant Firebase d'un joueur, retrouvé par son prénom. */
async function uidOf(name) {
  const { documents = [] } = await asProjectOwner('GET', '/players?pageSize=300');
  const found = documents.find((d) => d.fields && d.fields.name && d.fields.name.stringValue === name);
  if (!found) throw new Error("aucun compte au nom de " + name);
  return found.name.split('/').pop();
}

/** Ce que le formateur fait une fois, à la main, dans la console Firebase. */
async function nameAdminFromConsole(uid) {
  await asProjectOwner('PATCH', '/admins/' + uid, { fields: { since: { integerValue: '1' } } });
}

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

  /* ── 1. le rôle d'animateur ne se réclame pas ──────────────────────── */
  const alice = await pageFor('Alice');
  await signIn(alice, 'Alice', 'register');
  await tab(alice, 'Animateur');
  await alice.waitForSelector('.copyline input', { timeout: 20000 });

  // Aucun bouton ne permet de s'emparer du rôle : c'est tout l'intérêt.
  assert.strictEqual(await alice.locator('button:text-is("Devenir animateur")').count(), 0,
    "aucun bouton ne doit permettre de se nommer animateur soi-même");

  const aliceUid = await alice.inputValue('.copyline input');
  assert.ok(aliceUid && aliceUid.length > 10, "la page doit afficher l'identifiant à recopier");

  // Le formateur le fait une fois dans la console Firebase…
  await nameAdminFromConsole(aliceUid);
  // …et la page bascule toute seule, sans rechargement : le temps réel sert
  // aussi à ça.
  await alice.waitForSelector('button:text("Lancer la partie")', { timeout: 20000 });
  console.log('  ✓ le rôle se donne depuis la console, et la page le voit sans recharger');

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
  await alice.click('.segments button:text-is("Participants")');
  await alice.waitForSelector('.sheet', { timeout: 20000 });
  const codeByName = Object.fromEntries(await alice.$$eval('.sheet', (boxes) =>
    boxes.map((box) => {
      const who = box.querySelector('.sheet__name');
      const pill = box.querySelector('.sheet__badges .pill');
      return [who ? who.firstChild.textContent.trim() : '',
              pill ? pill.textContent.replace('Secret ', '') : ''];
    })));
  assert.strictEqual(Object.keys(codeByName).length, 5, 'la vue animateur doit lister les 5 participants');
  for (const [name] of PLAYERS) {
    assert.ok(codeByName[name] && codeByName[name].length === 3,
      `l'animateur doit voir le secret de ${name}`);
  }

  // La fiche dépliée montre bien le texte du secret, en clair.
  await alice.click('.sheet__head:has-text("Nour")');
  await alice.waitForSelector('.sheet.open .sheet__body', { timeout: 20000 });
  const fiche = await alice.textContent('.sheet.open .sheet__body');
  assert.ok(fiche.includes('Prune'), "la fiche doit montrer le secret en clair : " + fiche.slice(0, 120));
  await alice.click('.sheet.open .sheet__head');
  console.log('  ✓ une fiche par participant, secret en clair et historique');

  await alice.click('.segments button:text-is("Pilotage")');
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
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
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
    // on attend la confirmation du serveur, pas l'affichage optimiste :
    // fermer l'onglet avant l'accusé de réception perdrait le vote.
    await page.waitForSelector('#voteDone', { timeout: 20000 });
    if (voter !== 'Alice' && voter !== 'Bruno') await page.close();
  }
  console.log('  ✓ quatre votes enregistrés');

  /* ── 5 bis. le poste de commande pendant la journée ────────────────── */
  await signIn(alice, 'Alice', 'login');
  await tab(alice, 'Animateur');
  await alice.click('.segments button:text-is("Pilotage")');
  await alice.waitForSelector('.chips .chip', { timeout: 20000 });

  // Qui relancer, nommément : seul Diego n'a pas voté.
  const aRelancer = await alice.$$eval('.chips .chip', (els) => els.map((e) => e.textContent.trim()));
  assert.deepStrictEqual(aRelancer, ['Diego'],
    "l'animateur doit voir nommément qui n'a pas voté, or : " + JSON.stringify(aRelancer));

  // Les votes en direct, avec la vérité en face, avant que quiconque ne les voie.
  const enDirect = await alice.$$eval('.vote', (rows) => rows.map((r) => r.textContent.trim()));
  assert.strictEqual(enDirect.length, 4,
    "l'animateur doit voir les 4 votes en direct, or " + enDirect.length);
  assert.strictEqual(enDirect.filter((v) => v.includes('Juste')).length, 2,
    'deux votes justes attendus en direct : ' + JSON.stringify(enDirect));
  assert.ok(enDirect.some((v) => v.includes("Faux — c'est")),
    "les votes faux doivent nommer le vrai auteur pour l'animateur");
  console.log('  ✓ à relancer : ' + JSON.stringify(aRelancer) + ' · 4 votes visibles en direct');

  // Pendant ce temps, Bruno ne voit toujours rien de ces votes.
  const brunoVoit = await bruno.$$eval('.vote', (rows) => rows.length);
  assert.strictEqual(brunoVoit, 0, 'un stagiaire ne doit voir aucun vote avant le reveal');
  const seen = await alice.evaluate(async (password) => {
    const fb = await import('/js/firebase.js');
    const { firebaseConfig, ACCOUNT_DOMAIN } = await import('/js/config.js');
    const app = fb.initializeApp(firebaseConfig, 'anim-' + Date.now());
    const auth = fb.getAuth(app);
    const db = fb.getFirestore(app);
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    await fb.signInWithEmailAndPassword(auth, 'alice@' + ACCOUNT_DOMAIN, password);
    const snap = await fb.getDocs(fb.collection(db, 'votes'));
    return snap.docs.map((d) => d.id);
  }, PASSWORD);
  assert.strictEqual(seen.length, 4,
    "l'animateur doit voir les 4 votes en base, or il en voit " + seen.length + ' : ' + JSON.stringify(seen));
  console.log('  ✓ les quatre votes sont bien en base');

  /* ── 6. le reveal ─────────────────────────────────────────────────── */
  await tab(alice, 'Animateur');
  await alice.click('button:text("Clôturer & révéler")');
  await alice.waitForSelector('#pilotMsg .msg.ok', { timeout: 20000 });

  await tab(alice, 'Résultats');
  await alice.waitForSelector('.vote', { timeout: 20000 });
  const verdicts = await alice.$$eval('.vote', (rows) => rows.map((r) => r.textContent));
  assert.strictEqual(verdicts.length, 4,
    'les quatre votes doivent être publiés, or on en voit ' + verdicts.length + ' : ' +
    JSON.stringify(verdicts.map((v) => v.slice(0, 90))));
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

  /* ── 7 bis. l'animateur ajuste des points à la main ─────────────────── */
  await tab(alice, 'Animateur');
  await alice.click('.segments button:text-is("Participants")');
  await alice.click('.sheet__head:has-text("Diego")');
  await alice.waitForSelector('.sheet.open input.tiny', { timeout: 20000 });
  await alice.fill('.sheet.open input.tiny', '5');
  await alice.click('.sheet.open button:text-is("Ajuster les points")');
  await alice.waitForSelector('#sheetMsg .msg.ok', { timeout: 20000 });

  await tab(alice, 'Classement');
  await alice.waitForSelector('.rank', { timeout: 20000 });
  const apres = Object.fromEntries(await alice.$$eval('.rank', (rows) => rows.map((r) => [
    r.querySelector('.who').firstChild.textContent.trim(),
    parseInt(r.querySelector('.pts').textContent, 10),
  ])));
  assert.strictEqual(apres.Diego, 5, 'Diego doit avoir les 5 points ajoutés à la main : ' + JSON.stringify(apres));
  assert.strictEqual(apres.Alice, 4, "l'ajustement ne doit toucher que la personne visée");
  console.log('  ✓ ajustement manuel des points : ' + JSON.stringify(apres));

  /* ── 7 ter. un second animateur, nommé puis révoqué ─────────────────── */
  const peutLireLesAuteurs = async (page, prenom) => page.evaluate(async ([password, prenom]) => {
    const fb = await import('/js/firebase.js');
    const { firebaseConfig, ACCOUNT_DOMAIN } = await import('/js/config.js');
    const email = prenom.toLowerCase() + '@' + ACCOUNT_DOMAIN;
    const app = fb.initializeApp(firebaseConfig, 'role-' + Date.now() + Math.random());
    const auth = fb.getAuth(app);
    const db = fb.getFirestore(app);
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    await fb.signInWithEmailAndPassword(auth, email, password);
    try { await fb.getDocs(fb.collection(db, 'authorOf')); return true; }
    catch (e) { return false; }
  }, [PASSWORD, prenom]);

  assert.strictEqual(await peutLireLesAuteurs(bruno, 'Bruno'), false,
    'avant nomination, Bruno ne doit rien lire des auteurs');

  await tab(alice, 'Animateur');
  await alice.click('.segments button:text-is("Participants")');
  await alice.click('.sheet__head:has-text("Bruno")');
  await alice.waitForSelector('.sheet.open button:text-is("Nommer animateur")', { timeout: 20000 });
  await alice.click('.sheet.open button:text-is("Nommer animateur")');
  await alice.waitForSelector('#sheetMsg .msg.ok', { timeout: 20000 });
  assert.strictEqual(await peutLireLesAuteurs(bruno, 'Bruno'), true,
    'une fois nommé, Bruno doit voir les liens auteur↔secret');

  await alice.click('.sheet.open button:text-is("Retirer le rôle d\'animateur")');
  await alice.waitForSelector('#sheetMsg .msg.ok', { timeout: 20000 });
  assert.strictEqual(await peutLireLesAuteurs(bruno, 'Bruno'), false,
    'le rôle retiré, Bruno ne doit plus rien lire des auteurs');
  console.log('  ✓ un second animateur se nomme et se révoque depuis la page');

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
