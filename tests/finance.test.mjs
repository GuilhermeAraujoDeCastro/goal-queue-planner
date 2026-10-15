import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cents, depositResult, blockedBy, budgetPlan } from '../js/finance-domain.js';
import { commitDeposit } from '../js/transactions.js';
import { validateBackup, mergeGoal, previewBackup, fingerprint } from '../js/backup.js';
const goal = (id = 'g', overrides = {}) => ({ id, title: 'Meta fictícia', total: 1000, saved: 0, monthly: 100, prio: 1, ...overrides });
const read = name => readFileSync(new URL('../js/' + name, import.meta.url), 'utf8');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replaceAll('export ', '');
test('centavos: arredondamento e valores não finitos', () => {
  assert.equal(cents(1.005), 101);
  for (const value of [Infinity, NaN, -1, 'abc']) assert.throws(() => cents(value));
  assert.deepEqual(depositResult(goal('g', { total: 10, saved: 9.99 }), 100), { before: 9.99, total: 10, amount: .01, completed: true });
});
test('P02 arquivar apenas atualiza status e preserva aportes', async () => {
  const updates = [];
  const c = vm.createContext({ metasRef: () => ({ doc: id => ({ update: data => updates.push({ id, data }) }) }), Date });
  vm.runInContext(section(read('metas-db.js'), 'export function arquivarMeta(', 'export async function restaurarMeta('), c);
  await c.arquivarMeta('g');
  assert.equal(updates[0].data.status, 'archived'); assert.equal(updates[0].data.publico, false);
  assert.match(read('celebrate.js'), /await arquivarMeta\(id\)/);
});
function storeFixture(initial) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)])); let queue = Promise.resolve();
  return { data, run: fn => {
    const run = queue.then(async () => {
      const writes = [];
      const result = await fn({ get: async ref => ({ exists: data.has(ref), data: () => structuredClone(data.get(ref)) }), update: (ref, values) => writes.push(() => data.set(ref, { ...data.get(ref), ...values })), set: (ref, values) => writes.push(() => data.set(ref, values)) });
      writes.forEach(write => write()); return result;
    }); queue = run.catch(() => {}); return run;
  } };
}
test('P03 dois aportes concorrentes preservam saldo, teto e acumulados', async () => {
  const db = storeFixture({ g: goal('g', { total: 150 }) });
  const results = await Promise.all([commitDeposit(db.run, 'g', 'a', 100, () => 1), commitDeposit(db.run, 'g', 'b', 100, () => 2)]);
  assert.equal(db.data.get('g').saved, 150);
  assert.deepEqual(results.map(r => r.amount), [100, 50]);
  assert.deepEqual([db.data.get('a').total, db.data.get('b').total], [100, 150]);
  assert.equal(db.data.get('a').amount + db.data.get('b').amount, 150);
});
test('P03 repetição do mesmo recibo é idempotente e falha não grava', async () => {
  const db = storeFixture({ g: goal() });
  await commitDeposit(db.run, 'g', 'receipt', 100, () => 1);
  assert.equal((await commitDeposit(db.run, 'g', 'receipt', 100, () => 2)).repeated, true);
  assert.equal(db.data.get('g').saved, 100);
  await assert.rejects(commitDeposit(async () => { throw new Error('offline'); }, 'g', 'other', 100, () => 2));
  assert.equal(db.data.size, 2);
});
test('P04 limpar sessão esvazia dados, cards, modais e invalida callbacks', () => {
  const elements = []; let unsub = 0, cleared = 0;
  const state = { session: 0, goals: [goal()], allGoals: [goal()], unsubscribeGoals: () => unsub++ };
  const c = vm.createContext({ state, clearCelebrationSession() {}, document: { getElementById: () => ({ replaceChildren: () => elements.push(1) }), querySelectorAll: () => [{ classList: { remove: name => assert.equal(name, 'open') } }] }, clearPlanning: () => cleared++ });
  vm.runInContext(section(read('goals.js'), 'export function clearGoalSession()', 'export function loadDashboard()'), c); c.clearGoalSession();
  assert.equal(state.session, 1); assert.equal(state.goals.length, 0); assert.equal(state.allGoals.length, 0); assert.equal(unsub, 1); assert.equal(cleared, 1); assert.equal(elements.length, 4);
});
test('P04 callback antigo não grava cache nem repõe metas em outra sessão', () => {
  let callback, accepted = 0, cached = 0;
  const state = { currentUser: { uid: 'A', email: 'a@demo.test' }, session: 1 };
  const c = vm.createContext({ state, hideLoading() {}, showScreen() {}, document: { getElementById: () => ({}) }, renderGoals() {}, loadGoalsCache: () => null, acceptGoals: () => accepted++, saveGoalsCache: () => cached++, metasRef: () => ({ orderBy: () => ({ onSnapshot: fn => { callback = fn; } }) }) });
  vm.runInContext(section(read('goals.js'), 'export function loadDashboard()', 'function acceptGoals('), c); c.loadDashboard(); state.currentUser = { uid: 'B' }; state.session++;
  callback({ docs: [{ id: 'secret-A', data: () => goal() }] }); assert.equal(accepted, 0); assert.equal(cached, 0); assert.equal(state.goals.length, 0);
});
test('P05 prazo bloqueado não mostra mensagem positiva ou zero', () => {
  const hint = {}; const first = goal('first', { monthly: 0 });
  const c = vm.createContext({ state: { goals: [first] }, document: { getElementById: () => hint }, lerFormulario: () => goal('new', { deadline: '2027-12', prio: 2 }), cronograma: () => ({ nova: { inicio: null } }), aporteNecessario: () => null, blockedBy });
  vm.runInContext(section(read('goals.js'), 'function atualizarDicaAporte(', 'function openModalNew()'), c); c.atualizarDicaAporte('new');
  assert.match(hint.textContent, /Fila bloqueada/); assert.ok(!hint.textContent.includes('Dá tempo!'));
});
test('M09/M10 orçamento e prioridade, sem mutar a fonte', () => {
  const goals = [goal('a', { total: 100 }), goal('b', { total: 100, prio: 2 })]; const before = fingerprint(goals);
  const plan = budgetPlan(goals, 150, new Date(2026, 10, 1));
  assert.deepEqual(plan.months.map(m => m.total), [150, 50]);
  assert.deepEqual(plan.months[0].allocations.map(a => a.amount), [100, 50]);
  assert.ok(plan.months.every(m => m.total <= 150)); assert.equal(fingerprint(goals), before);
  assert.equal(budgetPlan(goals, 0).unresolved[0].reason, 'Orçamento mensal zerado.');
  assert.match(budgetPlan([goal('a', { monthly: 0 }), goal('b')], 100).unresolved[0].reason, /zerado/);
});
const contribution = (id, amount, total) => ({ id, amount, total, date: '2026-11-01T12:00:00.000Z' });
test('M11 backup versionado preserva ordem, arquivadas e histórico', () => {
  const goals = [goal('b', { prio: 2, status: 'archived', contributions: [contribution('cb', 10, 20)], saved: 20 }), goal('a', { contributions: [] })];
  const parsed = validateBackup(JSON.stringify({ format: 'web-metas', version: 1, goals }));
  assert.equal(parsed.goals[0].status, 'archived'); assert.equal(parsed.goals[0].prio, 2); assert.equal(parsed.goals[0].contributions[0].amount, 10);
  assert.throws(() => validateBackup({ format: 'web-metas', version: 2, goals }));
});
test('M11 prévia detecta conflitos, mescla sem perder aportes e sem mutar originais', () => {
  const old = goal('a', { saved: 100, contributions: [contribution('one', 100, 100)] });
  const incoming = goal('a', { saved: 50, contributions: [contribution('two', 50, 50)] });
  const before = fingerprint(old), preview = previewBackup([old], [incoming]);
  assert.equal(preview[0].kind, 'Conflito');
  const merged = mergeGoal(old, incoming, 'current'); assert.equal(merged.saved, 150); assert.equal(merged.contributions.length, 2); assert.equal(fingerprint(old), before);
  assert.equal(mergeGoal(old, incoming, 'skip').saved, 100);
  assert.throws(() => mergeGoal({ ...old, total: 120 }, incoming, 'current'));
});
