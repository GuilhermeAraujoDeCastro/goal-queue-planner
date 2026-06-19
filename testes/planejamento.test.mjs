import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aporteNecessario, cronograma, escapeHtml, fmtR, marcosCruzados, mesesParaTerminar,
  parseValorBR, prioridadesDaOrdem, urlImagemSegura, vaiAtrasar,
} from '../js/planejamento.js';

const HOJE = new Date(2026, 8, 23); // 23/09/2026

test('fmtR sempre mostra centavos', () => {
  assert.equal(fmtR(1234.5), 'R$ 1.234,50');
  assert.equal(fmtR(null), 'R$ 0,00');
});

test('parseValorBR entende 1.234,56 e 1234.56', () => {
  assert.equal(parseValorBR('1.234,56'), 1234.56);
  assert.equal(parseValorBR('1234.56'), 1234.56);
  assert.equal(parseValorBR('150'), 150);
  assert.equal(parseValorBR('1.000'), 1000); // mil, como se escreve no Brasil
  assert.equal(parseValorBR('12.500.000'), 12500000);
  assert.equal(parseValorBR('1.5'), 1.5);
  assert.equal(parseValorBR('R$ 2.000,50'), 2000.5);
  assert.ok(Number.isNaN(parseValorBR('')));
});

test('escapeHtml neutraliza tags e aspas', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('urlImagemSegura barra javascript: e aceita http e data:image', () => {
  assert.equal(urlImagemSegura('javascript:alert(1)'), '');
  assert.equal(urlImagemSegura('https://exemplo.com/a.jpg'), 'https://exemplo.com/a.jpg');
  assert.equal(urlImagemSegura('data:image/jpeg;base64,AAA'), 'data:image/jpeg;base64,AAA');
});

test('mesesParaTerminar arredonda pra cima e trata aporte zero', () => {
  assert.equal(mesesParaTerminar({ total: 1000, saved: 0, monthly: 300 }), 4);
  assert.equal(mesesParaTerminar({ total: 1000, saved: 1000, monthly: 0 }), 0);
  assert.equal(mesesParaTerminar({ total: 1000, saved: 0, monthly: 0 }), null);
});

test('cronograma encadeia as metas pela prioridade', () => {
  const plano = cronograma([
    { id: 'b', prio: 2, total: 1200, saved: 0, monthly: 400 },
    { id: 'a', prio: 1, total: 1000, saved: 0, monthly: 500, startMonth: '2026-10' },
  ], HOJE);
  assert.deepEqual([plano.a.inicio.getMonth(), plano.a.fim.getMonth()], [9, 11]); // out -> dez
  assert.deepEqual([plano.b.inicio.getMonth(), plano.b.fim.getMonth(), plano.b.fim.getFullYear()], [11, 2, 2027]); // dez -> mar/27
});

test('cronograma sem mês de início parte do mês atual', () => {
  const plano = cronograma([{ id: 'a', prio: 1, total: 100, saved: 0, monthly: 100 }], HOJE);
  assert.equal(plano.a.inicio.getMonth(), 8);
});

test('meta sem aporte trava a fila: as seguintes ficam sem data', () => {
  const plano = cronograma([
    { id: 'a', prio: 1, total: 100, saved: 0, monthly: 0 },
    { id: 'b', prio: 2, total: 100, saved: 0, monthly: 50 },
  ], HOJE);
  assert.equal(plano.a.fim, null);
  assert.equal(plano.b.inicio, null);
});

test('aporteNecessario calcula o mínimo pra bater a data alvo', () => {
  const meta = { total: 1200, saved: 0, deadline: '2027-09' };
  assert.equal(aporteNecessario(meta, new Date(2026, 8, 1)), 100); // 12 meses
  assert.equal(aporteNecessario({ ...meta, deadline: '2026-08' }, new Date(2026, 8, 1)), Infinity);
  assert.equal(aporteNecessario({ total: 1, saved: 0 }, new Date()), null);
});

test('vaiAtrasar compara a previsão com a data alvo', () => {
  const meta = { deadline: '2027-01' };
  assert.equal(vaiAtrasar(meta, { fim: new Date(2027, 0, 1) }), false);
  assert.equal(vaiAtrasar(meta, { fim: new Date(2027, 1, 1) }), true);
  assert.equal(vaiAtrasar(meta, { fim: null }), true);
  assert.equal(vaiAtrasar({}, { fim: null }), false);
});

test('marcosCruzados só devolve os marcos passados neste depósito', () => {
  assert.deepEqual(marcosCruzados(200, 600, 1000), [25, 50]);
  assert.deepEqual(marcosCruzados(600, 700, 1000), []);
  assert.deepEqual(marcosCruzados(0, 1000, 1000), [25, 50, 75]);
});

test('prioridadesDaOrdem numera a partir de 1', () => {
  assert.deepEqual(prioridadesDaOrdem(['x', 'y', 'z']), { x: 1, y: 2, z: 3 });
});
