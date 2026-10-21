import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { budgetTimeline, budgetPlan, blockedBy } from '../js/finance-domain.js';
import { validateBackup, fingerprint, cleanGoal } from '../js/backup.js';
import { aporteNecessario, vaiAtrasar, fmtR } from '../js/planejamento.js';
const read = name => readFileSync(new URL('../js/' + name, import.meta.url), 'utf8');
const pick = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replaceAll('export ', '');
const base = { id: 'g', title: 'Meta', total: 1200, saved: 0, monthly: 100, prio: 1, startMonth: '2026-01', deadline: '2026-12' };
test('P04 comemoração e pendências são removidas ao encerrar sessão', () => {
  let removed = 0;
  const ctx = vm.createContext({ document: { getElementById: () => ({ remove: () => removed++ }), querySelectorAll: () => [{ remove: () => removed++ }] } });
  vm.runInContext(pick(read('celebrate.js'), 'let pendingGoalId', '// Pedacinhos'), ctx);
  vm.runInContext("pendingGoalId='old'; pendingOwner='A'; pendingGoalTitle='Privada'; clearCelebrationSession();", ctx);
  assert.deepEqual(Array.from(vm.runInContext('[pendingGoalId,pendingOwner,pendingGoalTitle]', ctx)), [null,null,null]); assert.equal(removed, 2);
});
test('P05/M10 dica e detalhe respeitam orçamento global', () => {
  const hint = {}; const state = { goals: [], monthlyBudget: 50 };
  const ctx = vm.createContext({ state, document: { getElementById: () => hint }, lerFormulario: () => ({ ...base }), budgetTimeline, cronograma() { throw new Error('Não deveria ignorar o orçamento.'); }, aporteNecessario, blockedBy, vaiAtrasar, fmtR });
  vm.runInContext(pick(read('goals.js'), 'function atualizarDicaAporte(', 'function openModalNew()'), ctx); ctx.atualizarDicaAporte('new');
  assert.ok(!hint.textContent.includes('Dá tempo!')); assert.match(hint.textContent, /não dá tempo/);
  let detail;
  state.goals = [base]; ctx.detalheHtml = (_, plan) => { detail = plan; return ''; }; ctx.openModal = () => {}; ctx.renderEvolutionChart = () => {}; ctx.renderHistorico = () => {};
  vm.runInContext(pick(read('goals.js'), 'function openDetail(', '// Visão pública'), ctx); ctx.openDetail('g');
  assert.equal(detail.conclusao.getFullYear(), 2027); assert.equal(detail.conclusao.getMonth(), 11);
});
test('M09 aplicação recusa meta ou orçamento alterados durante a transação', async () => {
  const source = pick(read('planning-ui.js'), 'async function applyScenario()', 'const dateText');
  for (const altered of ['goal', 'budget']) {
    const state = { goals: [{ ...base }] }, messages = []; let writes = 0;
    const { id, ...data } = base;
    const scenario = { uid: 'A', goals: [{ ...base, monthly: 150 }], budget: 150, expected: fingerprint(state.goals), expectedDocs: [data], expectedBudget: 100 };
    const reference = path => ({ path, collection: name => ({ doc: id => reference(path + '/' + name + '/' + id) }) });
    const db = { collection: name => ({ doc: id => reference(name + '/' + id) }), runTransaction: async fn => fn({ get: async ref => {
      if (ref.path === 'users/A') return { exists: true, data: () => ({ monthlyBudget: altered === 'budget' ? 200 : 100 }) };
      state.goals[0].monthly = altered === 'goal' ? 200 : 100;
      return { exists: true, data: () => ({ ...data, monthly: altered === 'goal' ? 200 : 100 }) };
    }, update: () => writes++, set: () => writes++ }) };
    const ctx = vm.createContext({ scenario, state, currentUid: () => 'A', navigator: { onLine: true }, el: () => ({}), fingerprint, db, showToast: msg => messages.push(msg), refreshGoals() {} });
    vm.runInContext(source, ctx); await ctx.applyScenario(); assert.equal(writes, 0); assert.ok(messages.some(msg => msg.includes('mudou')));
  }
});
test('M11 backup rejeita mês inválido e previsão nunca produz NaN', () => {
  assert.throws(() => validateBackup({ format: 'web-metas', version: 1, goals: [{ ...base, startMonth: '2026-99', contributions: [] }] }), /inválido/);
  const plan = budgetPlan([{ ...base, startMonth: '2026-99' }], 100);
  assert.equal(plan.months.length, 0); assert.match(plan.unresolved[0].reason, /inválido/); assert.ok(!JSON.stringify(plan).includes('NaN'));
});
test('M11 leitura concorrente de saldo e aportes recusa exportar/preparar prévia', async () => {
  let reads = 0;
  const hist = { docs: [{ id: 'a', data: () => ({ amount: 150, total: 150, date: new Date('2026-11-01T12:00:00Z') }) }] };
  const goalRef = { collection: () => ({ get: async () => hist }) };
  const query = { orderBy: () => ({ get: async () => { reads++; const saved = reads === 1 ? 100 : 150; return { docs: [{ id: 'g', ref: goalRef, data: () => ({ ...base, saved }) }] }; } }) };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };
  const ctx = vm.createContext({ db, cleanGoal, fingerprint, Date });
  vm.runInContext(pick(read('planning-ui.js'), 'const dateText', 'async function exportBackup()'), ctx);
  await assert.rejects(ctx.snapshot('A'), /mudaram durante a leitura/);
});
