'use strict';

/** Petites aides partagées par les trois pages. */
const SB = {
  async api(method, url, body) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    let data = {};
    try {
      data = await response.json();
    } catch {
      /* réponse sans corps JSON */
    }
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  },

  get(url) {
    return SB.api('GET', url);
  },
  post(url, body) {
    return SB.api('POST', url, body);
  },
  del(url) {
    return SB.api('DELETE', url);
  },

  message(container, text, kind = 'error') {
    const node = typeof container === 'string' ? document.getElementById(container) : container;
    if (!node) return;
    node.innerHTML = '';
    if (!text) return;
    const div = document.createElement('div');
    div.className = `msg ${kind}`;
    div.textContent = text;
    node.appendChild(div);
  },

  el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  },

  clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  },

  plural(n, one, many) {
    return `${n} ${n > 1 ? many : one}`;
  },
};
