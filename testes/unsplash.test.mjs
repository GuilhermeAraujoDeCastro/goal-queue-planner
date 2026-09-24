import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { resumirFotos, urlDeDownloadValida } from '../api/unsplash-search.js';

// Resposta falsa no formato do objeto res da Vercel.
function respostaFalsa() {
  return {
    statusCode: 200, corpo: null, cabecalhos: {},
    status(c) { this.statusCode = c; return this; },
    json(c) { this.corpo = c; return this; },
    setHeader(k, v) { this.cabecalhos[k] = v; },
  };
}

const fetchOriginal = globalThis.fetch;
let chamadas = [];
beforeEach(() => { process.env.UNSPLASH_ACCESS_KEY = 'chave-teste'; chamadas = []; });
afterEach(() => { globalThis.fetch = fetchOriginal; delete process.env.UNSPLASH_ACCESS_KEY; });

test('só aceita avisar download pra api.unsplash.com (não vaza a chave pra outro site)', () => {
  assert.equal(urlDeDownloadValida('https://api.unsplash.com/photos/abc/download?ixid=1'), true);
  assert.equal(urlDeDownloadValida('https://site-malicioso.com/download'), false);
  assert.equal(urlDeDownloadValida('http://api.unsplash.com/photos/abc/download'), false);
  assert.equal(urlDeDownloadValida('nem-url'), false);
});

test('trackDownload pra outro domínio é recusado sem fazer fetch', async () => {
  globalThis.fetch = async (...args) => { chamadas.push(args); return { ok: true }; };
  const res = respostaFalsa();
  await handler({ query: { trackDownload: 'https://site-malicioso.com/x/download' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(chamadas.length, 0);
});

test('busca devolve as fotos resumidas e cache de 1 dia na borda', async () => {
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push([url, opcoes]);
    return {
      ok: true, status: 200,
      headers: { get: (k) => (k === 'x-ratelimit-remaining' ? '42' : null) },
      json: async () => ({ results: [{ urls: { thumb: 't', regular: 'r' }, user: { name: 'Ana', links: { html: 'https://unsplash.com/@ana' } }, links: { download_location: 'd' } }] }),
    };
  };
  const res = respostaFalsa();
  await handler({ query: { query: 'praia' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo.photos[0].authorName, 'Ana');
  assert.equal(res.corpo.remaining, 42);
  assert.match(res.cabecalhos['Cache-Control'], /s-maxage=86400/);
  assert.equal(chamadas[0][1].headers.Authorization, 'Client-ID chave-teste');
});

test('limite da Unsplash vira 429 com código próprio', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403, headers: { get: () => '0' } });
  const res = respostaFalsa();
  await handler({ query: { query: 'praia' } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.corpo.code, 'rate_limited');
});

test('sem a variável de ambiente responde erro claro', async () => {
  delete process.env.UNSPLASH_ACCESS_KEY;
  const res = respostaFalsa();
  await handler({ query: { query: 'praia' } }, res);
  assert.equal(res.corpo.code, 'missing_env');
});

test('resumirFotos coloca o UTM exigido pela Unsplash no link do autor', () => {
  const [foto] = resumirFotos({ results: [{ urls: { thumb: 't', regular: 'r' }, user: { name: 'Ana', links: { html: 'https://unsplash.com/@ana' } }, links: { download_location: 'd' } }] });
  assert.equal(foto.authorLink, 'https://unsplash.com/@ana?utm_source=web-metas&utm_medium=referral');
});
