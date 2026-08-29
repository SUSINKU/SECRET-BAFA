'use strict';

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function showTab(which) {
  const login = which === 'login';
  tabLogin.setAttribute('aria-selected', String(login));
  tabRegister.setAttribute('aria-selected', String(!login));
  loginForm.classList.toggle('hidden', !login);
  registerForm.classList.toggle('hidden', login);
  SB.message('message', '');
}

tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));

async function submit(url, name, password, button) {
  button.disabled = true;
  SB.message('message', '');
  try {
    await SB.post(url, { name, password });
    window.location.href = 'jeu.html';
  } catch (error) {
    SB.message('message', error.message);
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(
    '/api/login',
    document.getElementById('loginName').value,
    document.getElementById('loginPassword').value,
    loginForm.querySelector('button')
  );
});

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(
    '/api/register',
    document.getElementById('regName').value,
    document.getElementById('regPassword').value,
    registerForm.querySelector('button')
  );
});

SB.get('/api/state')
  .then((state) => {
    document.getElementById('gameName').textContent = state.game.name;
    document.title = `${state.game.name} — Connexion`;
    document.getElementById('ptsCorrect').textContent = `+${state.game.pointsCorrect}`;
    document.getElementById('ptsWrong').textContent = `+${state.game.pointsWrong}`;
    if (state.me) document.getElementById('alreadyIn').classList.remove('hidden');
    if (state.game.phase !== 'lobby') showTab('login');
  })
  .catch(() => {
    SB.message('message', 'Le serveur ne répond pas. Réessaie dans un instant.');
  });
