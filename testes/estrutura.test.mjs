// Checagens estáticas: handlers do HTML expostos em window e regras do Firestore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');
const arquivosJs = readdirSync(new URL('js/', raiz)).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const IGNORAR = new Set(['if', 'return', 'event', 'this', 'window', 'document', 'history', 'setTimeout']);

test('toda função usada em onclick/oninput/onchange está exposta em window', () => {
  const atributo = /\bon(?:click|change|input|keydown|submit)\s*=\s*(["'])([\s\S]*?)\1/g;
  const chamada = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  const chamadas = new Set();
  for (const arquivo of ['index.html', ...arquivosJs]) {
    for (const m of ler(arquivo).matchAll(atributo)) {
      // ${...} roda no template JS, não no clique: fica fora da checagem.
      for (const c of m[2].replace(/\$\{[^}]*\}/g, '').matchAll(chamada)) if (!IGNORAR.has(c[1])) chamadas.add(c[1]);
    }
  }
  const expostas = new Set();
  for (const arquivo of arquivosJs) {
    const codigo = ler(arquivo);
    for (const m of codigo.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) expostas.add(m[1]);
    for (const m of codigo.matchAll(/Object\.assign\(window,\s*\{([^}]*)\}/g)) {
      m[1].split(',').map(n => n.trim()).filter(Boolean).forEach(n => expostas.add(n));
    }
  }
  assert.deepEqual([...chamadas].filter(n => !expostas.has(n)), []);
});

test('regras do Firestore: dono lê e grava, meta compartilhada só pode ser lida (get)', () => {
  const regras = ler('firestore.rules');
  assert.match(regras, /request\.auth\.uid == userId/);
  assert.match(regras, /allow get: if dono\(userId\) \|\| resource\.data\.publico == true/);
  assert.doesNotMatch(regras, /allow (read|list|write|create|update)[^;]*publico == true/, 'meta pública não pode liberar list nem escrita');
  // Um {document=**} com write anularia a validação das metas (regras somam permissões).
  assert.doesNotMatch(regras, /\{document=\*\*\}/);
  assert.match(regras, /allow create, update: if dono\(userId\) && metaValida\(request\.resource\.data\)/);
});

test('nada aponta mais pra Netlify', () => {
  const codigo = ['index.html', ...arquivosJs].map(ler).join('\n');
  assert.doesNotMatch(codigo, /netlify/i);
});
