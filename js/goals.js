// Metas: painel, criar/editar/excluir, depósito, reordenação, linha do tempo e compartilhamento.

import { db, FieldValue } from './firebase-config.js';
import { apagarMetaComHistorico, metasRef } from './metas-db.js';
import { state, categoryOf, CATEGORIES, saveGoalsCache, loadGoalsCache } from './state.js';
import { showLoading, hideLoading, showToast, showScreen, openModal, closeModal } from './ui.js';
import { celebrateGoal, soltarConfete } from './celebrate.js';
import { switchImgTab, getImgFinal } from './images.js';
import { renderEvolutionChart, renderHistorico } from './chart.js';
import {
  aporteNecessario, cronograma, escapeHtml, fmtR, marcosCruzados, mesPorExtenso,
  parseValorBR, prioridadesDaOrdem, urlImagemSegura, vaiAtrasar,
} from './planejamento.js';

// =============================================
//  PAINEL
// =============================================
export function loadDashboard() {
  hideLoading();
  showScreen('screen-dashboard');
  const nome = state.currentUser.displayName || state.currentUser.email.split('@')[0];
  document.getElementById('user-name-display').textContent = nome;

  // Mostra o cache local na hora, antes do Firestore responder.
  const cache = loadGoalsCache(state.currentUser.uid);
  if (cache && cache.length > 0) {
    state.goals = cache;
    renderGoals();
  }

  if (state.unsubscribeGoals) state.unsubscribeGoals();
  state.unsubscribeGoals = metasRef().orderBy('prio', 'asc').onSnapshot(snapshot => {
    state.goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    saveGoalsCache(state.currentUser.uid, state.goals);
    renderGoals();
  }, err => {
    console.error('Firestore error:', err);
    showToast(state.goals.length ? 'Sem conexão. Mostrando os últimos dados salvos.' : 'Erro ao carregar metas', 'error');
    if (!state.goals.length) renderGoals();
  });
}

// Prioridade repetida quebraria a fila (duas metas começariam no mesmo mês).
function validatePrioUnique(prio, excludeId) {
  return !state.goals.some(g => g.id !== excludeId && g.prio === prio);
}

// =============================================
//  RENDER
// =============================================
function renderGoals() {
  const ordenadas = [...state.goals].sort((a, b) => a.prio - b.prio);
  const plano = cronograma(ordenadas);
  const qtd = ordenadas.length;
  document.getElementById('meta-count-display').textContent =
    qtd === 0 ? 'Nenhuma meta ainda' : `${qtd} meta${qtd > 1 ? 's' : ''} em andamento`;

  renderResumo(ordenadas, plano);
  renderLinhaDoTempo(ordenadas, plano);

  const grid = document.getElementById('goals-grid');
  if (qtd === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>Nenhuma meta cadastrada ainda.<br>Clique em "Nova meta" pra começar.</p>
      </div>`;
    return;
  }
  grid.innerHTML = ordenadas.map(g => cardHtml(g, plano[g.id])).join('');
}

function cardHtml(g, previsao) {
  const pct = Math.min(100, Math.round(((g.saved || 0) / g.total) * 100));
  const cat = categoryOf(g);
  const img = urlImagemSegura(g.img);
  const titulo = escapeHtml(g.title);
  const meses = previsao && previsao.meses !== null ? previsao.meses : null;
  const atrasa = vaiAtrasar(g, previsao);
  const imagem = img
    ? `<img src="${escapeHtml(img)}" alt="${titulo}" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
    : `<div class="goal-img-placeholder" style="background:linear-gradient(135deg, ${cat.color}22, ${cat.color}55)">${cat.icon}</div>`;

  return `
    <article class="goal-card" id="card-${escapeHtml(g.id)}" style="--cat-color:${cat.color}">
      <div class="goal-img">
        ${imagem}
        <div class="goal-img-overlay"></div>
        <div class="goal-prio">#${g.prio}</div>
        <div class="goal-category">${cat.icon} ${cat.label}</div>
        <button class="goal-menu-btn" onclick="openModalEdit('${escapeHtml(g.id)}', event)" title="Editar" aria-label="Editar ${titulo}">✎</button>
        ${atrasa ? `<div class="goal-alert">⚠ No ritmo atual passa de ${mesPorExtenso(mesDoTexto(g.deadline))}</div>` : ''}
      </div>
      <div class="goal-body">
        <div class="goal-name">${titulo}</div>
        ${previsao && previsao.inicio ? `<div class="goal-start-badge">📅 ${mesPorExtenso(previsao.inicio)} → ${previsao.fim ? mesPorExtenso(previsao.fim) : 'sem previsão'}</div>` : ''}
        <div class="sync-label">Progresso <span class="sync-pct">${pct}%</span></div>
        <div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="progress-values"><span>${fmtR(g.saved)}</span><span>${fmtR(g.total)}</span></div>
        <div class="goal-stats">
          <div class="goal-stat"><div class="goal-stat-label">Por mês</div><div class="goal-stat-val">${fmtR(g.monthly)}</div></div>
          <div class="goal-stat"><div class="goal-stat-label">Faltam</div><div class="goal-stat-val">${meses === null ? '∞' : meses === 0 ? 'pronta!' : meses + ' meses'}</div></div>
        </div>
        <div class="goal-actions">
          <button class="btn-details" onclick="openDetail('${escapeHtml(g.id)}')">Detalhes</button>
          <button class="btn-deposit" onclick="openDeposit('${escapeHtml(g.id)}')">+ Dinheiro</button>
        </div>
      </div>
    </article>`;
}

function mesDoTexto(texto) {
  const [ano, mes] = String(texto || '').split('-').map(Number);
  return ano && mes ? new Date(ano, mes - 1, 1) : null;
}

function renderResumo(metas, plano) {
  const guardado = metas.reduce((s, g) => s + (g.saved || 0), 0);
  const falta = metas.reduce((s, g) => s + Math.max(0, g.total - (g.saved || 0)), 0);
  const mensal = metas.reduce((s, g) => s + (g.monthly || 0), 0);
  const fins = metas.map(g => plano[g.id] && plano[g.id].fim);
  const ultimo = fins.length && fins.every(Boolean) ? fins.reduce((a, b) => (b > a ? b : a)) : null;
  document.getElementById('resumo-guardado').textContent = fmtR(guardado);
  document.getElementById('resumo-falta').textContent = fmtR(falta);
  document.getElementById('resumo-mensal').textContent = fmtR(mensal);
  document.getElementById('resumo-fim').textContent = metas.length ? (ultimo ? mesPorExtenso(ultimo) : 'sem previsão') : '—';
}

// Barras em escala de meses: cada meta começa onde a anterior terminou.
function renderLinhaDoTempo(metas, plano) {
  const caixa = document.getElementById('priority-order');
  const comData = metas.filter(g => plano[g.id] && plano[g.id].inicio && plano[g.id].fim);
  if (!comData.length) {
    caixa.innerHTML = '<p class="timeline-empty">Coloque um aporte mensal nas metas pra ver quando cada uma fica pronta.</p>';
    return;
  }
  const inicio = plano[comData[0].id].inicio;
  const mesesEntre = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const totalMeses = Math.max(1, ...comData.map(g => mesesEntre(inicio, plano[g.id].fim)));
  caixa.innerHTML = metas.map(g => {
    const p = plano[g.id];
    const cat = categoryOf(g);
    if (!p || !p.inicio || !p.fim) {
      return `<div class="timeline-row"><span class="timeline-name">${escapeHtml(g.title)}</span><div class="timeline-track"><span class="timeline-empty" style="padding:4px 8px;display:block">sem previsão (aporte mensal zerado)</span></div></div>`;
    }
    const esquerda = (mesesEntre(inicio, p.inicio) / totalMeses) * 100;
    const largura = Math.max(2, (Math.max(1, p.meses) / totalMeses) * 100);
    return `
      <div class="timeline-row">
        <span class="timeline-name" title="${escapeHtml(g.title)}">#${g.prio} ${escapeHtml(g.title)}</span>
        <div class="timeline-track">
          <div class="timeline-bar ${vaiAtrasar(g, p) ? 'atrasa' : ''}" style="left:${esquerda}%;width:${largura}%;--cat-color:${cat.color}"
            title="${escapeHtml(g.title)}: ${mesPorExtenso(p.inicio)} até ${mesPorExtenso(p.fim)}">${p.fim.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</div>
        </div>
      </div>`;
  }).join('');
}

// =============================================
//  DEPÓSITO
// =============================================
function openDeposit(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  document.getElementById('deposit-id').value = id;
  document.getElementById('deposit-info').innerHTML =
    `<strong>${escapeHtml(g.title)}</strong><br>Guardado: ${fmtR(g.saved)} de ${fmtR(g.total)}`;
  const input = document.getElementById('deposit-amount');
  input.value = '';
  openModal('modal-deposit');
  setTimeout(() => input.focus(), 50);
}

function confirmDeposit() {
  const id = document.getElementById('deposit-id').value;
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const valor = parseValorBR(document.getElementById('deposit-amount').value);
  if (isNaN(valor) || valor <= 0) { showToast('Valor inválido', 'error'); return; }

  const antes = g.saved || 0;
  const depois = Math.min(g.total, antes + valor);
  const entrou = depois - antes; // o que passar do total não entra (nem no histórico)
  const concluiu = depois >= g.total;
  const marcos = marcosCruzados(antes, depois, g.total);

  closeModal('modal-deposit');
  showLoading();
  const ref = metasRef().doc(id);
  ref.update({ saved: depois })
    .then(() => ref.collection('contributions').add({ amount: entrou, total: depois, date: FieldValue.serverTimestamp() }))
    .then(() => {
      hideLoading();
      if (concluiu) {
        celebrateGoal(id, g.title);
      } else {
        showToast(`+${fmtR(entrou)} guardado! Total: ${fmtR(depois)}`, 'success');
        if (marcos.length) {
          soltarConfete(40);
          showToast(`🎉 ${marcos[marcos.length - 1]}% de "${g.title}"!`, 'success');
        }
      }
      if (entrou < valor) showToast(`A meta só precisava de ${fmtR(entrou)}; o resto não foi somado.`, '');
    })
    .catch(err => { hideLoading(); showToast('Erro: ' + err.message, 'error'); });
}

// =============================================
//  CATEGORIA
// =============================================
function renderCategoryPicker(prefix, selected) {
  const box = document.getElementById(`${prefix}-category-picker`);
  if (!box) return;
  box.innerHTML = Object.entries(CATEGORIES).map(([key, c]) => `
    <button type="button" class="category-option ${key === selected ? 'active' : ''}"
      style="--cat-color:${c.color}" data-key="${key}" onclick="selectCategory('${prefix}', '${key}')">
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
//  FORMULÁRIO (nova e editar usam os mesmos campos com prefixo)
// =============================================
function lerFormulario(prefix) {
  const numero = (campo) => parseValorBR(document.getElementById(`${prefix}-${campo}`).value) || 0;
  return {
    title: document.getElementById(`${prefix}-title`).value.trim(),
    img: urlImagemSegura(getImgFinal(prefix)),
    total: numero('total'),
    saved: numero('saved'),
    monthly: numero('monthly'),
    prio: parseInt(document.getElementById(`${prefix}-prio`).value) || state.goals.length + 1,
    category: document.getElementById(`${prefix}-category`).value || 'outro',
    specs: getSpecs(`${prefix}-specs`),
    startMonth: document.getElementById(`${prefix}-start-month`).value || '',
    deadline: document.getElementById(`${prefix}-deadline`).value || '',
  };
}

function validarFormulario(dados, idAtual) {
  if (!dados.title || !dados.total) return 'Nome e valor total são obrigatórios';
  if (dados.total < 0 || dados.saved < 0 || dados.monthly < 0) return 'Valores não podem ser negativos';
  if (dados.saved > dados.total) return 'O valor guardado não pode passar do total';
  if (!validatePrioUnique(dados.prio, idAtual)) return `Já existe uma meta com prioridade ${dados.prio}. Escolha outra (ou use "Reordenar").`;
  return null;
}

// Mostra quanto por mês precisa pra bater a data alvo e avisa se o aporte não chega.
function atualizarDicaAporte(prefix) {
  const dica = document.getElementById(`${prefix}-monthly-hint`);
  const dados = lerFormulario(prefix);
  if (!dados.deadline || !dados.total) { dica.hidden = true; return; }
  const idAtual = prefix === 'edit' ? document.getElementById('edit-id').value : 'nova';
  const simuladas = [...state.goals.filter(g => g.id !== idAtual), { ...dados, id: idAtual }];
  const previsao = cronograma(simuladas)[idAtual];
  const necessario = aporteNecessario(dados, previsao && previsao.inicio);
  dica.hidden = false;
  if (necessario === Infinity) {
    dica.className = 'aporte-hint alerta';
    dica.textContent = 'Pela fila de prioridades, essa meta só começa depois dessa data. Aumente a prioridade ou mude a data.';
  } else if (necessario !== null && necessario > dados.monthly) {
    dica.className = 'aporte-hint alerta';
    dica.textContent = `Com ${fmtR(dados.monthly)} por mês não dá tempo. Precisa de pelo menos ${fmtR(necessario)} por mês.`;
  } else {
    dica.className = 'aporte-hint';
    dica.textContent = `Dá tempo! Mínimo necessário: ${fmtR(necessario || 0)} por mês.`;
  }
}

function openModalNew() {
  ['new-title', 'new-img-url', 'new-img-search-input', 'new-img-final', 'new-total', 'new-saved', 'new-monthly', 'new-start-month', 'new-deadline']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('new-prio').value = state.goals.length + 1;
  document.getElementById('new-specs').innerHTML = '<div class="spec-empty">Nenhum detalhe adicionado.</div>';
  document.getElementById('new-img-preview').style.display = 'none';
  document.getElementById('new-img-results').innerHTML = '';
  document.getElementById('new-monthly-hint').hidden = true;
  document.getElementById('new-category').value = 'outro';
  renderCategoryPicker('new', 'outro');
  updateStartMonthVisibility('new');
  switchImgTab('new', 'url');
  openModal('modal-new');
}

function updateStartMonthVisibility(prefix) {
  const prio = parseInt(document.getElementById(`${prefix}-prio`).value) || 1;
  document.getElementById(`${prefix}-start-month-field`).style.display = prio === 1 ? 'block' : 'none';
}

async function compileNewGoal() {
  const dados = lerFormulario('new');
  const erro = validarFormulario(dados, null);
  if (erro) { showToast(erro, 'error'); return; }
  showLoading();
  try {
    await metasRef().add({ ...dados, publico: false, createdAt: FieldValue.serverTimestamp() });
    closeModal('modal-new');
    hideLoading();
    showToast('Meta criada!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao criar meta: ' + err.message, 'error');
  }
}

function openModalEdit(id, e) {
  if (e) e.stopPropagation();
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const valor = (n) => (n ? String(n).replace('.', ',') : '');
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-title').value = g.title || '';
  document.getElementById('edit-img-url').value = g.img && !g.img.startsWith('data:') ? g.img : '';
  document.getElementById('edit-img-final').value = g.img || '';
  document.getElementById('edit-total').value = valor(g.total);
  document.getElementById('edit-saved').value = valor(g.saved);
  document.getElementById('edit-monthly').value = valor(g.monthly);
  document.getElementById('edit-prio').value = g.prio || 1;
  document.getElementById('edit-start-month').value = g.startMonth || '';
  document.getElementById('edit-deadline').value = g.deadline || '';
  document.getElementById('edit-publico').checked = g.publico === true;
  document.getElementById('edit-category').value = g.category || 'outro';
  renderCategoryPicker('edit', g.category || 'outro');
  updateStartMonthVisibility('edit');
  atualizarDicaAporte('edit');
  atualizarLinkPublico();

  const preview = document.getElementById('edit-img-preview');
  if (g.img) {
    document.getElementById('edit-img-preview-img').src = g.img;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  const lista = document.getElementById('edit-specs');
  lista.innerHTML = '';
  (g.specs || []).forEach(s => addSpecWithValues('edit-specs', s.k, s.v));
  if (!g.specs || !g.specs.length) lista.innerHTML = '<div class="spec-empty">Nenhum detalhe adicionado.</div>';

  switchImgTab('edit', 'url');
  openModal('modal-edit');
}

async function updateGoal() {
  const id = document.getElementById('edit-id').value;
  const dados = lerFormulario('edit');
  const erro = validarFormulario(dados, id);
  if (erro) { showToast(erro, 'error'); return; }
  dados.publico = document.getElementById('edit-publico').checked;
  showLoading();
  try {
    await metasRef().doc(id).update(dados);
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta atualizada!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao atualizar: ' + err.message, 'error');
  }
}

function deleteGoal() {
  openModal('modal-confirm-delete');
}

async function confirmDeleteGoal() {
  const id = document.getElementById('edit-id').value;
  closeModal('modal-confirm-delete');
  showLoading();
  try {
    await apagarMetaComHistorico(id);
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta excluída', '');
  } catch (err) {
    hideLoading();
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// =============================================
//  COMPARTILHAR (link só leitura de uma meta)
// =============================================
function linkPublico(id) {
  return `${location.origin}${location.pathname}?meta=${encodeURIComponent(state.currentUser.uid)}/${encodeURIComponent(id)}`;
}

function atualizarLinkPublico() {
  const id = document.getElementById('edit-id').value;
  const caixa = document.getElementById('edit-share-link');
  if (!document.getElementById('edit-publico').checked) { caixa.hidden = true; return; }
  caixa.hidden = false;
  caixa.innerHTML = `<input class="modal-input" readonly value="${escapeHtml(linkPublico(id))}" onclick="this.select()" />
    <button class="btn-secondary" onclick="copiarLinkPublico()">Copiar</button>`;
}

async function copiarLinkPublico() {
  const link = linkPublico(document.getElementById('edit-id').value);
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link copiado! Salve a meta pra ele funcionar.', 'success');
  } catch {
    showToast('Copie o link na caixinha acima', '');
  }
}

// =============================================
//  DETALHES
// =============================================
function detalheHtml(g, previsao, { somenteLeitura = false } = {}) {
  const pct = Math.min(100, Math.round(((g.saved || 0) / g.total) * 100));
  const falta = Math.max(0, g.total - (g.saved || 0));
  const cat = categoryOf(g);
  const img = urlImagemSegura(g.img);
  const atrasa = vaiAtrasar(g, previsao);
  const meses = previsao && previsao.meses !== null ? previsao.meses : null;
  const specs = (g.specs || []).length
    ? `<div class="detail-section-title">Detalhes</div>
       <div class="specs-display">${g.specs.map(s => `
         <div class="spec-display-row"><span class="spec-display-key">${escapeHtml(s.k)}</span><span class="spec-display-val">${escapeHtml(s.v)}</span></div>`).join('')}
       </div>`
    : '';
  return `
    <div class="detail-hero">
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(g.title)}" onload="this.classList.add('loaded')" onerror="this.style.display='none'">` : ''}
      <div class="detail-hero-overlay"></div>
      ${somenteLeitura ? '' : `<div class="detail-prio-badge">#${g.prio}</div>`}
      <div class="detail-category-badge">${cat.icon} ${cat.label}</div>
      <div class="detail-hero-title">${escapeHtml(g.title)}</div>
    </div>
    <div class="detail-progress-section">
      <div class="detail-pct">${pct}%</div>
      <div class="detail-pct-sub">do caminho percorrido</div>
      <div class="detail-progress-track"><div class="detail-progress-bar" style="width:${pct}%;--cat-color:${cat.color}"></div></div>
      <div class="detail-vals"><span>${fmtR(g.saved)} guardado</span><span>Meta: ${fmtR(g.total)}</span></div>
    </div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="detail-stat-label">Falta</div><div class="detail-stat-val">${fmtR(falta)}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Por mês</div><div class="detail-stat-val">${fmtR(g.monthly)}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Prazo</div><div class="detail-stat-val highlight">${meses === null ? '—' : meses + ' meses'}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Começa em</div><div class="detail-stat-val">${mesPorExtenso(previsao && previsao.inicio)}</div></div>
      <div class="detail-stat"><div class="detail-stat-label">Fica pronta em</div><div class="detail-stat-val ${atrasa ? 'alerta' : ''}">${mesPorExtenso(previsao && previsao.fim)}</div></div>
      ${g.deadline ? `<div class="detail-stat"><div class="detail-stat-label">Data alvo</div><div class="detail-stat-val ${atrasa ? 'alerta' : ''}">${mesPorExtenso(mesDoTexto(g.deadline))}</div></div>` : ''}
    </div>
    ${somenteLeitura ? '' : `
    <div class="detail-section-title">Evolução do valor guardado</div>
    <div class="evolution-chart-box"><canvas id="evolution-chart"></canvas><div id="evolution-empty" class="evolution-empty"></div></div>
    <div class="detail-section-title">Histórico de aportes</div>
    <ul id="historico-aportes" class="historico-list"><li>Carregando...</li></ul>`}
    ${specs}
    ${somenteLeitura ? '' : `
    <div class="detail-actions">
      <button class="btn-deposit" onclick="closeModal('modal-detail');openDeposit('${escapeHtml(g.id)}')">+ Dinheiro</button>
      <button class="btn-secondary" onclick="closeModal('modal-detail');openModalEdit('${escapeHtml(g.id)}', null)">✎ Editar</button>
      <button class="btn-secondary" onclick="exportarVideoMeta('${escapeHtml(g.id)}')">🎬 Vídeo do progresso</button>
    </div>`}`;
}

function openDetail(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const previsao = cronograma(state.goals)[id];
  document.getElementById('detail-content').innerHTML = detalheHtml(g, previsao);
  openModal('modal-detail');
  renderEvolutionChart(id);
  renderHistorico(id);
}

// Visão pública (?meta=uid/idDaMeta): só essa meta, sem login e sem editar.
export async function mostrarMetaPublica(uid, goalId) {
  showScreen('screen-public');
  const caixa = document.getElementById('public-content');
  caixa.innerHTML = '<p class="section-sub">Carregando...</p>';
  try {
    const doc = await db.collection('users').doc(uid).collection('goals').doc(goalId).get();
    if (!doc.exists || doc.data().publico !== true) throw new Error('não pública');
    const g = { id: doc.id, ...doc.data() };
    // Sem as outras metas não dá pra saber a fila; a previsão parte de hoje.
    const previsao = cronograma([{ ...g, prio: 1, startMonth: '' }])[g.id];
    caixa.innerHTML = `<span class="public-badge">Meta compartilhada</span>${detalheHtml(g, previsao, { somenteLeitura: true })}
      <p class="section-sub" style="margin-top:18px">Quer organizar as suas? <a href="${location.pathname}">Crie sua conta no Metas</a>.</p>`;
  } catch {
    caixa.innerHTML = '<h1 class="section-title">Meta não encontrada</h1><p class="section-sub">O link pode ter expirado ou a meta deixou de ser compartilhada.</p>';
  }
}

// =============================================
//  REORDENAR (arrastar ou setas, com prévia do cronograma)
// =============================================
let ordemRascunho = [];

function abrirReordenar() {
  if (state.goals.length < 2) { showToast('Crie pelo menos duas metas pra reordenar', ''); return; }
  ordemRascunho = [...state.goals].sort((a, b) => a.prio - b.prio).map(g => g.id);
  renderReordenar();
  openModal('modal-reorder');
}

function renderReordenar() {
  const prios = prioridadesDaOrdem(ordemRascunho);
  const simuladas = state.goals.map(g => ({ ...g, prio: prios[g.id] }));
  // A primeira da nova ordem herda o mês de início da antiga meta 1.
  const inicioAtual = (state.goals.find(g => g.prio === 1) || {}).startMonth || '';
  simuladas.forEach(g => { g.startMonth = prios[g.id] === 1 ? inicioAtual : ''; });
  const plano = cronograma(simuladas);
  const lista = document.getElementById('reorder-list');
  lista.innerHTML = ordemRascunho.map((id, i) => {
    const g = simuladas.find(x => x.id === id);
    const p = plano[id];
    const atrasa = vaiAtrasar(g, p);
    return `
      <li class="reorder-item" draggable="true" data-id="${escapeHtml(id)}">
        <span class="reorder-pos">${i + 1}</span>
        <span class="reorder-info"><strong>${escapeHtml(g.title)}</strong>
          <small class="${atrasa ? 'alerta' : ''}">${p && p.fim ? `${mesPorExtenso(p.inicio)} → ${mesPorExtenso(p.fim)}` : 'sem previsão'}${atrasa ? ' · passa da data alvo' : ''}</small></span>
        <span class="reorder-btns">
          <button onclick="moverNaOrdem(${i}, -1)" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button onclick="moverNaOrdem(${i}, 1)" aria-label="Descer" ${i === ordemRascunho.length - 1 ? 'disabled' : ''}>↓</button>
        </span>
      </li>`;
  }).join('');
  ligarArrastar(lista);
}

function moverNaOrdem(indice, direcao) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= ordemRascunho.length) return;
  [ordemRascunho[indice], ordemRascunho[destino]] = [ordemRascunho[destino], ordemRascunho[indice]];
  renderReordenar();
}

function ligarArrastar(lista) {
  let arrastado = null;
  lista.querySelectorAll('.reorder-item').forEach(item => {
    item.addEventListener('dragstart', () => { arrastado = item.dataset.id; item.classList.add('arrastando'); });
    item.addEventListener('dragend', () => item.classList.remove('arrastando'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('alvo'); });
    item.addEventListener('dragleave', () => item.classList.remove('alvo'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      const alvo = item.dataset.id;
      if (!arrastado || arrastado === alvo) return;
      ordemRascunho.splice(ordemRascunho.indexOf(arrastado), 1);
      ordemRascunho.splice(ordemRascunho.indexOf(alvo), 0, arrastado);
      renderReordenar();
    });
  });
}

async function salvarReordenacao() {
  const prios = prioridadesDaOrdem(ordemRascunho);
  const inicioAtual = (state.goals.find(g => g.prio === 1) || {}).startMonth || '';
  const lote = db.batch();
  ordemRascunho.forEach(id => {
    lote.update(metasRef().doc(id), { prio: prios[id], startMonth: prios[id] === 1 ? inicioAtual : '' });
  });
  showLoading();
  try {
    await lote.commit();
    closeModal('modal-reorder');
    hideLoading();
    showToast('Nova ordem salva!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao salvar a ordem: ' + err.message, 'error');
  }
}

// =============================================
//  DETALHES EXTRAS (specs)
// =============================================
function addSpec(listId) {
  addSpecWithValues(listId, '', '');
}

function addSpecWithValues(listId, k, v) {
  const lista = document.getElementById(listId);
  const vazio = lista.querySelector('.spec-empty');
  if (vazio) vazio.remove();
  const linha = document.createElement('div');
  linha.className = 'spec-row';
  linha.innerHTML = `
    <input class="modal-input spec-key" placeholder="Ex: Modelo" value="${escapeHtml(k)}" maxlength="40">
    <input class="modal-input spec-val" placeholder="Ex: 16 GB de RAM" value="${escapeHtml(v)}" maxlength="80">
    <button class="btn-del-spec" onclick="removeSpec(this)" aria-label="Remover detalhe">🗑</button>`;
  lista.appendChild(linha);
}

function removeSpec(btn) {
  const linha = btn.closest('.spec-row');
  const lista = linha.parentElement;
  linha.remove();
  if (!lista.querySelectorAll('.spec-row').length) lista.innerHTML = '<div class="spec-empty">Nenhum detalhe adicionado.</div>';
}

function getSpecs(listId) {
  return Array.from(document.getElementById(listId).querySelectorAll('.spec-row'))
    .map(r => ({ k: r.querySelector('.spec-key').value.trim(), v: r.querySelector('.spec-val').value.trim() }))
    .filter(s => s.k || s.v);
}

Object.assign(window, {
  openModalNew, updateStartMonthVisibility, compileNewGoal, openModalEdit, updateGoal, deleteGoal,
  confirmDeleteGoal, openDetail, openDeposit, confirmDeposit, addSpec, removeSpec, selectCategory,
  atualizarDicaAporte, atualizarLinkPublico, copiarLinkPublico, abrirReordenar, moverNaOrdem, salvarReordenacao,
});
