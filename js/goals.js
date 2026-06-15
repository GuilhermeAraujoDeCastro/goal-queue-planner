// CRUD de metas, dashboard, carrossel e o cálculo de sequenciamento por
// prioridade.

import { db, FieldValue } from './firebase-config.js';
import { state, categoryOf, CATEGORIES, fmtR, saveGoalsCache, loadGoalsCache } from './state.js';
import { showLoading, hideLoading, showToast, showScreen, openModal, closeModal } from './ui.js';
import { celebrateGoal } from './celebrate.js';
import { switchImgTab, getImgFinal } from './images.js';
import { renderEvolutionChart } from './chart.js';

// =============================================
//  DASHBOARD / CARREGAMENTO
// =============================================
export function loadDashboard() {
  hideLoading();
  showScreen('screen-dashboard');

  const name = state.currentUser.displayName || state.currentUser.email.split('@')[0];
  document.getElementById('user-name-display').textContent = name;

  // Mostra o cache local na hora, antes do Firestore responder, pra tela
  // nunca ficar em branco enquanto carrega (ou se o Firestore falhar).
  const cached = loadGoalsCache(state.currentUser.uid);
  if (cached && cached.length > 0) {
    state.goals = cached;
    renderGoals();
  }

  if (state.unsubscribeGoals) state.unsubscribeGoals();

  state.unsubscribeGoals = db
    .collection('users').doc(state.currentUser.uid)
    .collection('goals')
    .orderBy('prio', 'asc')
    .onSnapshot(snapshot => {
      state.goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      saveGoalsCache(state.currentUser.uid, state.goals);
      renderGoals();
    }, err => {
      console.error('Firestore error:', err);
      if (state.goals.length > 0) {
        showToast('Sem conexão. Mostrando os últimos dados salvos.', 'error');
      } else {
        showToast('Erro ao carregar metas', 'error');
        renderGoals();
      }
    });
}

// =============================================
//  SEQUENCIAMENTO POR PRIORIDADE
// =============================================
// Cada meta tem uma prioridade (1 = primeira a receber aportes). O app
// calcula em que mês cada meta *começa* a ser financiada, assumindo que
// elas são pagas em sequência: a meta 1 começa no mês configurado por
// ela mesma, a meta 2 começa quando a 1 termina, e assim por diante.
//
// Esse cálculo só faz sentido se cada prioridade for única. Se duas
// metas dividissem a mesma prioridade, as duas cairiam no mesmo ponto do
// loop abaixo e receberiam a mesma data de início, o que não reflete
// nenhuma ordem real de pagamento. Por isso compileNewGoal() e
// updateGoal() recusam salvar uma meta com uma prioridade já usada por
// outra meta (ver validatePrioUnique).
function calcGoalStartDate(goalPrio, sortedGoals) {
  const main = sortedGoals.find(g => g.prio === 1);
  if (!main || !main.startMonth) return null;

  const [yr, mo] = main.startMonth.split('-').map(Number);
  if (!yr || !mo) return null;

  let cursor = new Date(yr, mo - 1, 1);

  for (const g of sortedGoals) {
    if (g.prio === goalPrio) return cursor;
    const rem = g.total - g.saved;
    const months = g.monthly > 0 ? Math.ceil(rem / g.monthly) : 0;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + months, 1);
  }
  return cursor;
}

function validatePrioUnique(prio, excludeId) {
  return !state.goals.some(g => g.id !== excludeId && g.prio === prio);
}

// =============================================
//  RENDER
// =============================================
function renderGoals() {
  const sorted = [...state.goals].sort((a, b) => a.prio - b.prio);
  const count = sorted.length;

  document.getElementById('meta-count-display').textContent =
    `STATUS: ${count} META${count !== 1 ? 'S' : ''} ATIVA${count !== 1 ? 'S' : ''} NO SISTEMA`;

  const po = document.getElementById('priority-order');
  po.innerHTML = sorted.map(g =>
    `<div class="prio-chip">⚡ <span>PRIO ${g.prio}</span> ${g.title}</div>`
  ).join('');

  const grid = document.getElementById('goals-grid');

  if (count === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>Nenhuma meta cadastrada ainda.<br>Clique em "Inicializar Nova Meta" para começar.</p>
      </div>`;
    return;
  }

  grid.innerHTML = sorted.map(g => {
    const pct = Math.min(100, Math.round((g.saved / g.total) * 100));
    const remaining = Math.max(0, g.total - g.saved);
    const months = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
    const monthsText = months !== null ? months + ' meses' : '∞';
    const cat = categoryOf(g);

    const startDate = calcGoalStartDate(g.prio, sorted);
    let startText = '';
    if (g.prio === 1 && g.startMonth) {
      const [yr, mo] = g.startMonth.split('-').map(Number);
      const d = new Date(yr, mo - 1, 1);
      startText = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } else if (startDate) {
      startText = startDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }

    const imgContent = g.img
      ? `<img src="${g.img}" alt="${g.title}" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
      : `<div class="goal-img-placeholder" style="background:linear-gradient(135deg, ${cat.color}22, ${cat.color}55)">${cat.icon}</div>`;

    return `
      <div class="goal-card" id="card-${g.id}" style="--cat-color:${cat.color}">
        <div class="goal-img">
          ${imgContent}
          <div class="goal-img-overlay"></div>
          <div class="goal-prio">⚡ PRIO ${g.prio}</div>
          <div class="goal-category" title="${cat.label}">${cat.icon} ${cat.label}</div>
          <button class="goal-menu-btn" onclick="openModalEdit('${g.id}', event)" title="Editar">···</button>
        </div>
        <div class="goal-body">
          <div class="goal-name">${g.title}</div>
          ${startText ? `<div class="goal-start-badge">📅 Início: ${startText}</div>` : ''}
          <div class="sync-label">SINCRONIZAÇÃO <span class="sync-pct">${pct}%</span></div>
          <div class="progress-track">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="progress-values">
            <span>${fmtR(g.saved)}</span>
            <span>${fmtR(g.total)}</span>
          </div>
          <div class="goal-stats">
            <div class="goal-stat">
              <div class="goal-stat-label">📅 APORTE MENSAL</div>
              <div class="goal-stat-val">${fmtR(g.monthly)}</div>
            </div>
            <div class="goal-stat">
              <div class="goal-stat-label">⏰ FALTAM</div>
              <div class="goal-stat-val">${monthsText}</div>
            </div>
          </div>
          <button class="btn-details" onclick="openDetail('${g.id}')">VER DETALHES DO PROJETO ↗</button>
          <button class="btn-deposit" onclick="openDeposit('${g.id}')">💰 ADICIONAR DINHEIRO</button>
        </div>
      </div>`;
  }).join('');

  state.carouselIndex = 0;
  updateCarousel();
}

// =============================================
//  DEPÓSITO
// =============================================
// Aceita "1234.56" e também o formato brasileiro "1.234,56": remove os
// pontos de milhar antes de trocar a vírgula decimal por ponto. Sem isso,
// "1.234,56" virava "1.234.56" e o parseFloat entendia só "1.234" (R$
// 1.234,56 salvo silenciosamente como R$ 1,234).
function parseValorBR(str) {
  return parseFloat(str.trim().replace(/\./g, '').replace(',', '.'));
}

// Adicionar dinheiro usava prompt() nativo do navegador. Trocado por um
// modal do proprio app (modal-deposit) porque a caixinha nativa nao
// combina com o visual do site e, em navegadores/automacoes que bloqueiam
// dialogs nativos, travava a tela inteira sem dar nenhum feedback.
function openDeposit(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;

  document.getElementById('deposit-id').value = id;
  document.getElementById('deposit-info').innerHTML =
    `<strong>${g.title}</strong><br>Valor atual: ${fmtR(g.saved)} · Meta total: ${fmtR(g.total)}`;
  const input = document.getElementById('deposit-amount');
  input.value = '';
  openModal('modal-deposit');
  setTimeout(() => input.focus(), 50);
}

function confirmDeposit() {
  const id = document.getElementById('deposit-id').value;
  const g = state.goals.find(x => x.id === id);
  if (!g) return;

  const val = parseValorBR(document.getElementById('deposit-amount').value);
  if (isNaN(val) || val <= 0) { showToast('Valor inválido', 'error'); return; }

  const newSaved = Math.min(g.total, g.saved + val);
  const isComplete = newSaved >= g.total;

  closeModal('modal-deposit');
  showLoading();
  const goalRef = db.collection('users').doc(state.currentUser.uid).collection('goals').doc(id);

  goalRef.update({ saved: newSaved })
    .then(() => goalRef.collection('contributions').add({
      amount: val,
      total: newSaved,
      date: FieldValue.serverTimestamp()
    }))
    .then(() => {
      hideLoading();
      if (isComplete) {
        celebrateGoal(id, g.title);
      } else {
        showToast(`+${fmtR(val)} adicionado! Total: ${fmtR(newSaved)}`, 'success');
      }
    })
    .catch(err => { hideLoading(); showToast('Erro: ' + err.message, 'error'); });
}

// =============================================
//  CARROSSEL
// =============================================
function carouselNext() {
  const max = Math.max(0, state.goals.length - getVisible());
  if (state.carouselIndex < max) { state.carouselIndex++; updateCarousel(); }
}
function carouselPrev() {
  if (state.carouselIndex > 0) { state.carouselIndex--; updateCarousel(); }
}
function getVisible() {
  const w = window.innerWidth;
  if (w > 1200) return 3;
  if (w > 800) return 2;
  return 1;
}
function updateCarousel() {
  const grid = document.getElementById('goals-grid');
  const cardW = 340 + 20;
  grid.style.transform = `translateX(-${state.carouselIndex * cardW}px)`;
}
window.addEventListener('resize', updateCarousel);

// =============================================
//  SELETOR DE CATEGORIA
// =============================================
function renderCategoryPicker(prefix, selected) {
  const box = document.getElementById(`${prefix}-category-picker`);
  if (!box) return;
  box.innerHTML = Object.entries(CATEGORIES).map(([key, c]) => `
    <button type="button" class="category-option ${key === selected ? 'active' : ''}"
      style="--cat-color:${c.color}" data-key="${key}"
      onclick="selectCategory('${prefix}', '${key}')">
      <span>${c.icon}</span> ${c.label}
    </button>`).join('');
}

function selectCategory(prefix, key) {
  document.getElementById(`${prefix}-category`).value = key;
  document.querySelectorAll(`#${prefix}-category-picker .category-option`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === key);
  });
}

// =============================================
//  NOVA META
// =============================================
function openModalNew() {
  ['new-title', 'new-img-url', 'new-img-search-input', 'new-img-final',
    'new-total', 'new-saved', 'new-monthly', 'new-start-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('new-prio').value = state.goals.length + 1;
  document.getElementById('new-specs').innerHTML =
    '<div class="spec-empty">Nenhuma especificação adicionada.</div>';
  document.getElementById('new-img-preview').style.display = 'none';
  document.getElementById('new-img-results').innerHTML = '';
  document.getElementById('new-category').value = 'outro';
  renderCategoryPicker('new', 'outro');

  updateStartMonthVisibility('new');
  switchImgTab('new', 'url');
  openModal('modal-new');
}

function updateStartMonthVisibility(prefix) {
  const prioEl = document.getElementById(`${prefix}-prio`);
  const smField = document.getElementById(`${prefix}-start-month-field`);
  if (!prioEl || !smField) return;
  const prio = parseInt(prioEl.value) || 1;
  smField.style.display = prio === 1 ? 'block' : 'none';
}

async function compileNewGoal() {
  const title = document.getElementById('new-title').value.trim();
  const img = getImgFinal('new');
  const total = parseFloat(document.getElementById('new-total').value) || 0;
  const saved = parseFloat(document.getElementById('new-saved').value) || 0;
  const monthly = parseFloat(document.getElementById('new-monthly').value) || 0;
  const prio = parseInt(document.getElementById('new-prio').value) || state.goals.length + 1;
  const category = document.getElementById('new-category').value || 'outro';
  const specs = getSpecs('new-specs');
  const smEl = document.getElementById('new-start-month');
  const startMonth = smEl ? smEl.value : '';

  if (!title || !total) { showToast('Título e valor total são obrigatórios', 'error'); return; }
  if (!validatePrioUnique(prio, null)) {
    showToast(`Já existe uma meta com prioridade ${prio}. Escolha outra.`, 'error');
    return;
  }

  showLoading();
  try {
    await db.collection('users').doc(state.currentUser.uid).collection('goals').add({
      title, img, total, saved, monthly, prio, category, specs, startMonth,
      createdAt: FieldValue.serverTimestamp()
    });
    closeModal('modal-new');
    hideLoading();
    showToast('Meta criada com sucesso!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao criar meta: ' + err.message, 'error');
  }
}

// =============================================
//  EDITAR META
// =============================================
function openModalEdit(id, e) {
  if (e) e.stopPropagation();
  const g = state.goals.find(x => x.id === id);
  if (!g) return;

  document.getElementById('edit-id').value = id;
  document.getElementById('edit-title').value = g.title || '';
  document.getElementById('edit-img-url').value = g.img || '';
  document.getElementById('edit-img-final').value = g.img || '';
  document.getElementById('edit-total').value = g.total || '';
  document.getElementById('edit-saved').value = g.saved || '';
  document.getElementById('edit-monthly').value = g.monthly || '';
  document.getElementById('edit-prio').value = g.prio || 1;
  document.getElementById('edit-category').value = g.category || 'outro';
  renderCategoryPicker('edit', g.category || 'outro');
  const editSM = document.getElementById('edit-start-month');
  if (editSM) editSM.value = g.startMonth || '';
  updateStartMonthVisibility('edit');

  const previewBox = document.getElementById('edit-img-preview');
  if (g.img) {
    document.getElementById('edit-img-preview-img').src = g.img;
    previewBox.style.display = 'block';
  } else {
    previewBox.style.display = 'none';
  }

  const sl = document.getElementById('edit-specs');
  sl.innerHTML = '';
  (g.specs || []).forEach(s => addSpecWithValues('edit-specs', s.k, s.v));
  if (!g.specs || g.specs.length === 0) {
    sl.innerHTML = '<div class="spec-empty">Nenhuma especificação adicionada.</div>';
  }

  switchImgTab('edit', 'url');
  openModal('modal-edit');
}

async function updateGoal() {
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const img = getImgFinal('edit');
  const total = parseFloat(document.getElementById('edit-total').value) || 0;
  const saved = parseFloat(document.getElementById('edit-saved').value) || 0;
  const monthly = parseFloat(document.getElementById('edit-monthly').value) || 0;
  const prio = parseInt(document.getElementById('edit-prio').value) || 1;
  const category = document.getElementById('edit-category').value || 'outro';
  const specs = getSpecs('edit-specs');
  const editSM2 = document.getElementById('edit-start-month');
  const startMonth = editSM2 ? editSM2.value : '';

  if (!title || !total) { showToast('Título e valor total são obrigatórios', 'error'); return; }
  if (!validatePrioUnique(prio, id)) {
    showToast(`Já existe uma meta com prioridade ${prio}. Escolha outra.`, 'error');
    return;
  }

  showLoading();
  try {
    await db.collection('users').doc(state.currentUser.uid).collection('goals').doc(id).update({
      title, img, total, saved, monthly, prio, category, specs, startMonth
    });
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta atualizada!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao atualizar: ' + err.message, 'error');
  }
}

// Excluir meta usava confirm() nativo do navegador, mesmo motivo do
// openDeposit acima: trocado pelo modal modal-confirm-delete.
function deleteGoal() {
  openModal('modal-confirm-delete');
}

async function confirmDeleteGoal() {
  const id = document.getElementById('edit-id').value;
  closeModal('modal-confirm-delete');

  showLoading();
  try {
    await db.collection('users').doc(state.currentUser.uid).collection('goals').doc(id).delete();
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta excluída', 'error');
  } catch (err) {
    hideLoading();
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// =============================================
//  MODAL DE DETALHES
// =============================================
function openDetail(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;

  const sorted = [...state.goals].sort((a, b) => a.prio - b.prio);
  const pct = Math.min(100, Math.round((g.saved / g.total) * 100));
  const remaining = Math.max(0, g.total - g.saved);
  const months = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  const monthsText = months !== null ? months + ' meses' : '—';
  const cat = categoryOf(g);

  const startDate = calcGoalStartDate(g.prio, sorted);
  let startText = '—';
  if (g.prio === 1 && g.startMonth) {
    const [yr, mo] = g.startMonth.split('-').map(Number);
    startText = new Date(yr, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } else if (startDate) {
    startText = startDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  let dateText = '—';
  if (months !== null && startDate) {
    const end = new Date(startDate.getFullYear(), startDate.getMonth() + months, 1);
    dateText = end.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } else if (months !== null) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    dateText = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  const imgTag = g.img
    ? `<img src="${g.img}" alt="${g.title}" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
    : '';

  const specsHtml = (g.specs || []).length > 0
    ? `<div class="detail-section-title" style="margin-top:20px">ESPECIFICAÇÕES</div>
       <div class="specs-display">
         ${g.specs.map(s => `
           <div class="spec-display-row">
             <span class="spec-display-key">${s.k}</span>
             <span class="spec-display-val">${s.v}</span>
           </div>`).join('')}
       </div>`
    : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-hero">
      ${imgTag}
      <div class="detail-hero-overlay"></div>
      <div class="detail-prio-badge">⚡ PRIO ${g.prio}</div>
      <div class="detail-category-badge" style="--cat-color:${cat.color}">${cat.icon} ${cat.label}</div>
      <div class="detail-hero-title">${g.title}</div>
    </div>

    <div class="detail-progress-section">
      <div class="detail-pct">${pct}%</div>
      <div class="detail-pct-sub">Progresso Atual</div>
      <div class="detail-progress-track">
        <div class="detail-progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="detail-vals">
        <span>${fmtR(g.saved)} guardado</span>
        <span>Meta: ${fmtR(g.total)}</span>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <div class="detail-stat-label">Falta pagar</div>
        <div class="detail-stat-val">${fmtR(remaining)}</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-label">Aporte mensal</div>
        <div class="detail-stat-val">${fmtR(g.monthly)}</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-label">Prazo estimado</div>
        <div class="detail-stat-val highlight">${monthsText}</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-label">Início previsto</div>
        <div class="detail-stat-val" style="font-size:15px">${startText}</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-label">Conquista em</div>
        <div class="detail-stat-val" style="font-size:15px">${dateText}</div>
      </div>
    </div>

    <div class="detail-section-title" style="margin-top:20px">EVOLUÇÃO DO VALOR GUARDADO</div>
    <div class="evolution-chart-box">
      <canvas id="evolution-chart"></canvas>
      <div id="evolution-empty" class="evolution-empty"></div>
    </div>

    ${specsHtml}

    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn-deposit" style="flex:1;border-radius:10px;padding:13px"
        onclick="closeModal('modal-detail');openDeposit('${g.id}')">
        💰 ADICIONAR DINHEIRO
      </button>
      <button class="btn-submit" style="flex:1"
        onclick="closeModal('modal-detail');openModalEdit('${g.id}', null)">
        ✏ EDITAR
      </button>
    </div>`;

  openModal('modal-detail');
  renderEvolutionChart(id);
}

// =============================================
//  ESPECIFICAÇÕES
// =============================================
function addSpec(listId) {
  const list = document.getElementById(listId);
  const empty = list.querySelector('.spec-empty');
  if (empty) empty.remove();
  addSpecWithValues(listId, '', '');
}

function addSpecWithValues(listId, k, v) {
  const list = document.getElementById(listId);
  const empty = list.querySelector('.spec-empty');
  if (empty) empty.remove();

  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input class="modal-input spec-key" placeholder="Ex: Processador" value="${k}">
    <input class="modal-input spec-val" placeholder="Ex: i7 13700K"   value="${v}">
    <button class="btn-del-spec" onclick="removeSpec(this)">🗑</button>`;
  list.appendChild(row);
}

function removeSpec(btn) {
  const row = btn.closest('.spec-row');
  const list = row.parentElement;
  row.remove();
  if (list.querySelectorAll('.spec-row').length === 0) {
    list.innerHTML = '<div class="spec-empty">Nenhuma especificação adicionada.</div>';
  }
}

function getSpecs(listId) {
  return Array.from(document.getElementById(listId).querySelectorAll('.spec-row'))
    .map(r => ({ k: r.querySelector('.spec-key').value.trim(), v: r.querySelector('.spec-val').value.trim() }))
    .filter(s => s.k || s.v);
}

window.openModalNew = openModalNew;
window.updateStartMonthVisibility = updateStartMonthVisibility;
window.compileNewGoal = compileNewGoal;
window.openModalEdit = openModalEdit;
window.updateGoal = updateGoal;
window.deleteGoal = deleteGoal;
window.confirmDeleteGoal = confirmDeleteGoal;
window.openDetail = openDetail;
window.openDeposit = openDeposit;
window.confirmDeposit = confirmDeposit;
window.carouselNext = carouselNext;
window.carouselPrev = carouselPrev;
window.addSpec = addSpec;
window.removeSpec = removeSpec;
window.selectCategory = selectCategory;
