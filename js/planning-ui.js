import { db } from './firebase-config.js';
import { state } from './state.js';
import { budgetPlan, cents } from './finance-domain.js';
import { cleanGoal, validateBackup, previewBackup, mergeGoal, fingerprint } from './backup.js';
import { escapeHtml as esc, fmtR, parseValorBR } from './planejamento.js';
import { showToast } from './ui.js';
let owner = null, preview = null, scenario = null;
let refreshGoals = () => {};
let unsubscribeBudget = null, budgetSession = 0;
const el = id => document.getElementById(id);
const currentUid = () => state.currentUser?.uid;
export function clearPlanning() {
  budgetSession++;
  if (unsubscribeBudget) unsubscribeBudget();
  unsubscribeBudget = null;
  owner = null; preview = null; scenario = null;
  el('planning-tools')?.replaceChildren();
}
export function renderPlanning(refresh = () => {}) {
  refreshGoals = refresh;
  const box = el('planning-tools'); if (!box || !currentUid() || owner === currentUid()) return;
  owner = currentUid();
  const initialUid = owner, generation = budgetSession;
  unsubscribeBudget = db.collection('users').doc(owner).onSnapshot(snap => {
    if (initialUid !== currentUid() || generation !== budgetSession) return;
    const budget = snap.data()?.monthlyBudget;
    state.monthlyBudget = typeof budget === 'number' ? budget : null;
    refreshGoals();
  }, () => { if (initialUid === currentUid() && generation === budgetSession) showToast('Orçamento não carregado. Abra o comparador quando a conexão voltar.', 'error'); });
  box.innerHTML = `<details><summary>Planejamento, orçamento e backup</summary>
    <p>Simulações não gravam dados. Aportes e aplicação de mudanças exigem conexão.</p>
    <button class="btn-secondary" id="open-scenario">Comparar cenários de aporte</button>
    <div id="scenario-editor"></div>
    <hr><h3>Backup de metas e aportes</h3>
    <p>Arquivo JSON v1. A importação mostra inclusões, mesclagens e conflitos antes de gravar. Os dados existentes são preservados.</p>
    <button class="btn-secondary" id="export-goals">Exportar backup</button>
    <label class="modal-label" for="import-goals">Selecionar backup JSON para prévia</label>
    <input id="import-goals" type="file" accept="application/json,.json">
    <div id="backup-preview" aria-live="polite"></div>
  </details>`;
  el('open-scenario').onclick = openScenario;
  el('export-goals').onclick = exportBackup;
  el('import-goals').onchange = importPreview;
}
async function openScenario() {
  const uid = currentUid();
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (uid !== currentUid()) return;
    const serverBudget = snap.data()?.monthlyBudget ?? null;
    const budget = serverBudget ?? state.goals.reduce((sum, g) => sum + (g.monthly || 0), 0);
    el('scenario-editor').innerHTML = `<h3>Comparação de cenários</h3><label class="modal-label" for="global-budget">Orçamento mensal global (R$)</label><input class="modal-input" id="global-budget" inputmode="decimal" value="${budget.toFixed(2)}">
      <p>A fila usa o valor pretendido de cada meta até o limite global. O restante do mês pode seguir para a próxima meta quando a anterior termina.</p>
      ${state.goals.map(g => `<label class="modal-label" for="scenario-${esc(g.id)}">${esc(g.title)}: aporte pretendido por mês</label><input class="modal-input" id="scenario-${esc(g.id)}" data-scenario-goal="${esc(g.id)}" inputmode="decimal" value="${Number(g.monthly || 0).toFixed(2)}">`).join('')}
      <button class="btn-secondary" id="simulate-goals">Simular sem gravar</button><div id="scenario-result" aria-live="polite"></div>`;
    el('simulate-goals').onclick = () => simulate(uid, budget, serverBudget);
    el('scenario-editor').querySelectorAll('input').forEach(input => input.addEventListener('input', () => { scenario = null; el('scenario-result').replaceChildren(); }));
  } catch { showToast('Não foi possível carregar o orçamento.', 'error'); }
}
function simulate(uid, oldBudget, expectedBudget) {
  try {
    const budget = parseValorBR(el('global-budget').value); cents(budget);
    const goals = state.goals.map(g => ({ ...g, monthly: parseValorBR(el(`scenario-${g.id}`).value) }));
    goals.forEach(g => cents(g.monthly));
    const original = budgetPlan(state.goals, oldBudget), proposed = budgetPlan(goals, budget);
    scenario = { uid, goals, budget, expected: fingerprint(state.goals), expectedDocs: state.goals.map(g => JSON.parse(fingerprint(cleanComparable(g)))), expectedBudget };
    el('scenario-result').innerHTML = `<h4>Prévia: ${fmtR(budget)} disponíveis por mês</h4><div class="table-scroll"><table><thead><tr><th>Meta</th><th>Cenário atual</th><th>Cenário simulado</th></tr></thead><tbody>${goals.map(g => `<tr><td>${esc(g.title)}</td><td>${original.dates[g.id] || 'Sem previsão'}</td><td>${proposed.dates[g.id] || 'Sem previsão'}</td></tr>`).join('')}</tbody></table></div>
      ${proposed.unresolved.map(g => `<p>${esc(g.title)}: ${esc(g.reason)}</p>`).join('')}
      <h4>Alocação mensal (primeiros 12 meses)</h4><ul>${proposed.months.slice(0, 12).map(m => `<li>${m.month}: ${fmtR(m.total)} de ${fmtR(budget)}. ${m.allocations.map(a => `${esc(a.title)}: ${fmtR(a.amount)}`).join('; ') || 'Sem capacidade de aporte para a fila.'}</li>`).join('')}</ul>
      <p>Aplicar salva o orçamento e os aportes pretendidos exibidos. Não cria depósitos nem altera o saldo.</p><button class="btn-primary" id="apply-scenario">Aplicar este cenário</button>`;
    el('apply-scenario').onclick = applyScenario;
  } catch { scenario = null; showToast('Use valores monetários finitos e não negativos em todos os campos.', 'error'); }
}
async function applyScenario() {
  const chosen = scenario;
  if (!chosen || chosen.uid !== currentUid()) return;
  const button = el('apply-scenario'); button.disabled = true;
  try {
    if (navigator.onLine === false) throw new Error('Conecte-se antes de aplicar.');
    if (fingerprint(state.goals) !== chosen.expected) throw new Error('As metas mudaram. Gere outra simulação.');
    if (chosen.goals.length > 150) throw new Error('A aplicação atômica aceita até 150 metas.');
    await db.runTransaction(async tx => {
      const refs = chosen.goals.map(g => db.collection('users').doc(chosen.uid).collection('goals').doc(g.id));
      const [userSnap, ...snaps] = await Promise.all([tx.get(db.collection('users').doc(chosen.uid)), ...refs.map(r => tx.get(r))]);
      if ((userSnap.data()?.monthlyBudget ?? null) !== chosen.expectedBudget) throw new Error('O orçamento mudou em outro aparelho. Simule novamente.');
      snaps.forEach((snap, i) => { if (!snap.exists || fingerprint(snap.data()) !== fingerprint(chosen.expectedDocs[i])) throw new Error('Uma meta mudou em outro aparelho. Simule novamente.'); });
      refs.forEach((ref, i) => tx.update(ref, { monthly: chosen.goals[i].monthly }));
      tx.set(db.collection('users').doc(chosen.uid), { monthlyBudget: chosen.budget }, { merge: true });
    });
    if (chosen.uid === currentUid()) { state.monthlyBudget = chosen.budget; refreshGoals(); scenario = null; showToast('Cenário aplicado. Saldos preservados.', 'success'); el('scenario-result').textContent = 'Cenário aplicado.'; }
  } catch (err) { showToast(err.message || 'Não foi possível aplicar.', 'error'); button.disabled = false; }
}
function cleanComparable(goal) { const { id, ...data } = goal; return data; }
const dateText = date => date?.toDate ? date.toDate().toISOString() : new Date(date).toISOString();
async function snapshotOnce(uid) {
  const ref = db.collection('users').doc(uid).collection('goals');
  const goals = await ref.orderBy('prio').get({ source: 'server' });
  return Promise.all(goals.docs.map(async g => {
    const history = await g.ref.collection('contributions').get({ source: 'server' });
    const data = cleanGoal(g.data());
    if (data.archivedAt?.toDate) data.archivedAt = dateText(data.archivedAt);
    return { id: g.id, ...data, contributions: history.docs.map(c => ({ id: c.id, amount: c.data().amount, total: c.data().total, date: dateText(c.data().date) })).sort((a, b) => a.id.localeCompare(b.id)) };
  }));
}
async function snapshot(uid) {
  const first = await snapshotOnce(uid), second = await snapshotOnce(uid);
  if (fingerprint(first) !== fingerprint(second)) throw new Error('Os dados mudaram durante a leitura. Tente novamente quando os aportes e outras alterações terminarem.');
  return second;
}
async function exportBackup() {
  const uid = currentUid();
  try {
    const goals = await snapshot(uid); if (uid !== currentUid()) return;
    const content = JSON.stringify({ format: 'web-metas', version: 1, exportedAt: new Date().toISOString(), goals }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'web-metas-backup.json'; link.click(); URL.revokeObjectURL(url);
  } catch { showToast('Backup não exportado. Conecte-se para incluir todo o histórico do servidor.', 'error'); }
}
async function importPreview(event) {
  const file = event.target.files[0]; event.target.value = ''; preview = null;
  if (!file) return;
  const uid = currentUid();
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo excede 20 MB.');
    const imported = validateBackup(await file.text());
    const current = await snapshot(uid); if (uid !== currentUid()) return;
    const rows = previewBackup(current, imported.goals);
    preview = { uid, current, rows };
    el('backup-preview').innerHTML = `<h4>Prévia de importação</h4><p>${rows.filter(r => r.kind === 'Inclusão').length} inclusões; ${rows.filter(r => r.kind === 'Mesclagem').length} mesclagens; ${rows.filter(r => r.kind === 'Conflito').length} conflitos. Nenhuma gravação feita.</p><p>Metas novas entram ao fim da fila quando já existem metas nesta conta. Mesclas mantêm a posição atual. Nunca apagamos aportes ausentes do backup.</p>
      ${rows.map((r, i) => `<fieldset><legend>${esc(r.title)}: ${r.kind}</legend><p>Saldo atual: ${fmtR(r.old?.saved || 0)}. Backup: ${fmtR(r.incoming.saved)}; ${r.incoming.contributions.length} aportes.</p><label for="merge-${i}">Ação</label><select id="merge-${i}" data-merge="${i}">${r.old ? '<option value="skip">Preservar atual, não importar esta meta</option><option value="current">Mesclar aportes, preferir campos e saldo inicial atuais</option><option value="backup">Mesclar aportes, preferir campos e saldo inicial do backup</option><option value="copy">Importar como outra meta, sem substituir a atual</option>' : '<option value="new">Incluir meta e histórico</option><option value="skip">Ignorar esta meta</option>'}</select><p id="merge-result-${i}"></p></fieldset>`).join('')}
      <button class="btn-primary" id="apply-backup">Confirmar importação da prévia</button><button class="btn-ghost" id="cancel-backup">Cancelar</button>`;
    el('apply-backup').onclick = applyBackup;
    el('cancel-backup').onclick = () => { preview = null; el('backup-preview').replaceChildren(); };
    el('backup-preview').querySelectorAll('select').forEach(select => { select.onchange = updateMergePreview; }); updateMergePreview();
  } catch (err) { if (uid === currentUid()) el('backup-preview').textContent = 'Importação não preparada: ' + err.message; }
}
function buildPlan() {
  let priority = Math.max(0, ...preview.current.map(g => g.prio));
  return preview.rows.flatMap((r, i) => {
    const choice = el(`merge-${i}`).value;
    if (choice === 'skip') return [];
    const merged = mergeGoal(r.old, r.incoming, choice === 'new' ? 'copy' : choice);
    merged.id = choice === 'copy' ? crypto.randomUUID() : r.id;
    if (!r.old || choice === 'copy') { if (preview.current.length) merged.prio = ++priority; }
    else merged.prio = r.old.prio;
    return [{ row: i, old: choice === 'copy' ? null : r.old, goal: merged }];
  });
}
function updateMergePreview() {
  try {
    const plan = buildPlan();
    preview.rows.forEach((_, i) => { const change = plan.find(p => p.row === i); el(`merge-result-${i}`).textContent = change ? `Após importar: ${fmtR(change.goal.saved)}, ${change.goal.contributions.length} aportes; prioridade ${change.goal.prio}.` : 'Dados atuais preservados.'; });
    el('apply-backup').disabled = plan.length === 0;
  } catch (err) { el('apply-backup').disabled = true; showToast('Combinação inválida: ' + err.message, 'error'); }
}
async function applyBackup() {
  const prepared = preview; if (!prepared || prepared.uid !== currentUid()) return;
  const button = el('apply-backup'); button.disabled = true;
  try {
    if (navigator.onLine === false) throw new Error('Conecte-se para importar.');
    const plan = buildPlan();
    const fresh = await snapshot(prepared.uid);
    if (fingerprint(fresh) !== fingerprint(prepared.current)) throw new Error('Dados alterados em outro aparelho. Selecione o arquivo novamente para revisar uma nova prévia.');
    const writes = plan.reduce((sum, p) => sum + 1 + p.goal.contributions.length, 0);
    if (writes > 450) throw new Error('A mescla excede 450 documentos. Importe menos metas por vez.');
    await db.runTransaction(async tx => {
      const checks = [];
      for (const item of plan) {
        const ref = db.collection('users').doc(prepared.uid).collection('goals').doc(item.goal.id);
        checks.push({ ref, expected: item.old ? cleanGoal(item.old) : null, goal: item.goal });
        for (const c of item.goal.contributions) {
          checks.push({ ref: ref.collection('contributions').doc(c.id), expected: item.old?.contributions.find(old => old.id === c.id) || null, contribution: c });
        }
      }
      const snaps = await Promise.all(checks.map(c => tx.get(c.ref)));
      snaps.forEach((snap, i) => {
        const c = checks[i];
        if (!!snap.exists !== !!c.expected) throw new Error('Dados mudaram após a prévia. Reabra o backup.');
        if (snap.exists) {
          const data = c.goal ? cleanGoal(snap.data()) : { id: snap.id, ...snap.data(), date: dateText(snap.data().date) };
          if (fingerprint(data) !== fingerprint(c.expected)) throw new Error('Dados mudaram após a prévia. Reabra o backup.');
        }
      });
      for (const c of checks) {
        if (c.goal) tx.set(c.ref, cleanGoal(c.goal), { merge: true });
        else { const { id, ...data } = c.contribution; tx.set(c.ref, { ...data, date: new Date(data.date) }); }
      }
    });
    if (prepared.uid === currentUid()) { preview = null; el('backup-preview').textContent = 'Importação concluída. Metas e aportes preservados.'; }
  } catch (err) { showToast('Nenhuma importação confirmada: ' + err.message, 'error'); button.disabled = false; }
}
