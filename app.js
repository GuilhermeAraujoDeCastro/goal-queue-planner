// =============================================
//  METAS — app.js
//  Firebase Auth + Firestore
// =============================================

// ── Firebase config ──────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDJ_BFKLNdzdmbtdbT4SfWXVCnTQ8MC0T0",
  authDomain:        "web-metas-40842.firebaseapp.com",
  projectId:         "web-metas-40842",
  storageBucket:     "web-metas-40842.firebasestorage.app",
  messagingSenderId: "52337039380",
  appId:             "1:52337039380:web:69345d5af457af7e9c2f01"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── State ────────────────────────────────────
let currentUser  = null;
let goals        = [];
let carouselIndex = 0;
let unsubscribeGoals = null;   // Firestore listener cleanup

// =============================================
//  LOADING
// =============================================
function showLoading()  { document.getElementById('loading-overlay').classList.add('visible');    }
function hideLoading()  { document.getElementById('loading-overlay').classList.remove('visible'); }

// =============================================
//  SCREENS
// =============================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// =============================================
//  AUTH STATE OBSERVER
// =============================================
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    loadDashboard();
  } else {
    currentUser = null;
    if (unsubscribeGoals) { unsubscribeGoals(); unsubscribeGoals = null; }
    showScreen('screen-login');
  }
});

// =============================================
//  AUTH — Login
// =============================================
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  if (!email || !pass) { showToast('Preencha todos os campos', 'error'); return; }

  showLoading();
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged cuida do redirect
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

// =============================================
//  AUTH — Register
// =============================================
async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;

  if (!name || !email || !pass) { showToast('Preencha todos os campos', 'error'); return; }
  if (pass.length < 8) { showToast('Senha deve ter no mínimo 8 caracteres', 'error'); return; }

  showLoading();
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    currentUser = cred.user;
    hideLoading();
    showToast('Conta criada com sucesso!', 'success');
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

// =============================================
//  AUTH — Forgot Password
// =============================================
async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('Informe seu e-mail', 'error'); return; }

  showLoading();
  try {
    await auth.sendPasswordResetEmail(email);
    hideLoading();
    showToast('Link de recuperação enviado para ' + email, 'success');
    setTimeout(() => showScreen('screen-login'), 2000);
  } catch (err) {
    hideLoading();
    showToast(firebaseErrorMsg(err.code), 'error');
  }
}

// =============================================
//  AUTH — Logout
// =============================================
async function doLogout() {
  if (unsubscribeGoals) { unsubscribeGoals(); unsubscribeGoals = null; }
  await auth.signOut();
}

// =============================================
//  Firebase error messages in Portuguese
// =============================================
function firebaseErrorMsg(code) {
  const msgs = {
    'auth/user-not-found':      'E-mail não encontrado.',
    'auth/wrong-password':      'Senha incorreta.',
    'auth/invalid-email':       'E-mail inválido.',
    'auth/email-already-in-use':'E-mail já cadastrado.',
    'auth/weak-password':       'Senha muito fraca.',
    'auth/too-many-requests':   'Muitas tentativas. Tente mais tarde.',
    'auth/network-request-failed': 'Erro de conexão.',
    'auth/invalid-credential':  'E-mail ou senha incorretos.',
  };
  return msgs[code] || 'Erro: ' + code;
}

// =============================================
//  DASHBOARD
// =============================================
function loadDashboard() {
  hideLoading();
  showScreen('screen-dashboard');

  const name = currentUser.displayName || currentUser.email.split('@')[0];
  document.getElementById('user-name-display').textContent = name;

  // Realtime listener no Firestore
  if (unsubscribeGoals) unsubscribeGoals();

  unsubscribeGoals = db
    .collection('users').doc(currentUser.uid)
    .collection('goals')
    .orderBy('prio', 'asc')
    .onSnapshot(snapshot => {
      goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGoals();
    }, err => {
      console.error('Firestore error:', err);
      showToast('Erro ao carregar metas', 'error');
    });
}

// =============================================
//  RENDER GOALS
// =============================================
function renderGoals() {
  const sorted = [...goals].sort((a, b) => a.prio - b.prio);
  const count  = sorted.length;

  document.getElementById('meta-count-display').textContent =
    `STATUS: ${count} META${count !== 1 ? 'S' : ''} ATIVA${count !== 1 ? 'S' : ''} NO SISTEMA`;

  // Priority chips
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
    const pct        = Math.min(100, Math.round((g.saved / g.total) * 100));
    const remaining  = g.total - g.saved;
    const months     = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
    const monthsText = months !== null ? months + ' meses' : '∞';

    const imgContent = g.img
      ? `<img src="${g.img}" alt="${g.title}" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
      : `<div class="goal-img-placeholder">🎯</div>`;

    return `
      <div class="goal-card">
        <div class="goal-img">
          ${imgContent}
          <div class="goal-img-overlay"></div>
          <div class="goal-prio">⚡ PRIO ${g.prio}</div>
          <button class="goal-menu-btn" onclick="openModalEdit('${g.id}', event)" title="Editar">···</button>
        </div>
        <div class="goal-body">
          <div class="goal-name">${g.title}</div>
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
        </div>
      </div>`;
  }).join('');

  carouselIndex = 0;
  updateCarousel();
}

function fmtR(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
}

// =============================================
//  CAROUSEL
// =============================================
function carouselNext() {
  const max = Math.max(0, goals.length - getVisible());
  if (carouselIndex < max) { carouselIndex++; updateCarousel(); }
}
function carouselPrev() {
  if (carouselIndex > 0) { carouselIndex--; updateCarousel(); }
}
function getVisible() {
  const w = window.innerWidth;
  if (w > 1200) return 3;
  if (w > 800)  return 2;
  return 1;
}
function updateCarousel() {
  const grid  = document.getElementById('goals-grid');
  const cardW = 340 + 20;
  grid.style.transform = `translateX(-${carouselIndex * cardW}px)`;
}
window.addEventListener('resize', updateCarousel);

// =============================================
//  MODALS
// =============================================
function openModal(id)  { document.getElementById(id).classList.add('open');    }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

// =============================================
//  NEW GOAL
// =============================================
function openModalNew() {
  // reset fields
  ['new-title','new-img-url','new-img-search-input','new-img-final',
   'new-total','new-saved','new-monthly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('new-prio').value = goals.length + 1;
  document.getElementById('new-specs').innerHTML =
    '<div class="spec-empty">Nenhuma especificação adicionada.</div>';
  document.getElementById('new-img-preview').style.display = 'none';
  document.getElementById('new-img-results').innerHTML = '';
  switchImgTab('new', 'url');
  openModal('modal-new');
}

async function compileNewGoal() {
  const title   = document.getElementById('new-title').value.trim();
  const img     = getImgFinal('new');
  const total   = parseFloat(document.getElementById('new-total').value)   || 0;
  const saved   = parseFloat(document.getElementById('new-saved').value)   || 0;
  const monthly = parseFloat(document.getElementById('new-monthly').value) || 0;
  const prio    = parseInt(document.getElementById('new-prio').value)      || goals.length + 1;
  const specs   = getSpecs('new-specs');

  if (!title || !total) { showToast('Título e valor total são obrigatórios', 'error'); return; }

  showLoading();
  try {
    await db.collection('users').doc(currentUser.uid).collection('goals').add({
      title, img, total, saved, monthly, prio, specs,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
//  EDIT GOAL
// =============================================
function openModalEdit(id, e) {
  if (e) e.stopPropagation();
  const g = goals.find(x => x.id === id);
  if (!g) return;

  document.getElementById('edit-id').value       = id;
  document.getElementById('edit-title').value    = g.title   || '';
  document.getElementById('edit-img-url').value  = g.img     || '';
  document.getElementById('edit-img-final').value= g.img     || '';
  document.getElementById('edit-total').value    = g.total   || '';
  document.getElementById('edit-saved').value    = g.saved   || '';
  document.getElementById('edit-monthly').value  = g.monthly || '';
  document.getElementById('edit-prio').value     = g.prio    || 1;

  // Preview da imagem existente
  const previewBox = document.getElementById('edit-img-preview');
  if (g.img) {
    document.getElementById('edit-img-preview-img').src = g.img;
    previewBox.style.display = 'block';
  } else {
    previewBox.style.display = 'none';
  }

  // Specs
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
  const id      = document.getElementById('edit-id').value;
  const title   = document.getElementById('edit-title').value.trim();
  const img     = getImgFinal('edit');
  const total   = parseFloat(document.getElementById('edit-total').value)   || 0;
  const saved   = parseFloat(document.getElementById('edit-saved').value)   || 0;
  const monthly = parseFloat(document.getElementById('edit-monthly').value) || 0;
  const prio    = parseInt(document.getElementById('edit-prio').value)      || 1;
  const specs   = getSpecs('edit-specs');

  if (!title || !total) { showToast('Título e valor total são obrigatórios', 'error'); return; }

  showLoading();
  try {
    await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).update({
      title, img, total, saved, monthly, prio, specs
    });
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta atualizada!', 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao atualizar: ' + err.message, 'error');
  }
}

async function deleteGoal() {
  const id = document.getElementById('edit-id').value;
  if (!confirm('Tem certeza que deseja excluir esta meta?')) return;

  showLoading();
  try {
    await db.collection('users').doc(currentUser.uid).collection('goals').doc(id).delete();
    closeModal('modal-edit');
    hideLoading();
    showToast('Meta excluída', 'error');
  } catch (err) {
    hideLoading();
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// =============================================
//  DETAIL MODAL
// =============================================
function openDetail(id) {
  const g = goals.find(x => x.id === id);
  if (!g) return;

  const pct       = Math.min(100, Math.round((g.saved / g.total) * 100));
  const remaining = g.total - g.saved;
  const months    = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  const monthsText = months !== null ? months + ' meses' : '—';

  let dateText = '—';
  if (months !== null) {
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
        <div class="detail-stat-label">Conquista em</div>
        <div class="detail-stat-val" style="font-size:16px">${dateText}</div>
      </div>
    </div>

    ${specsHtml}

    <button class="btn-submit" style="margin-top:20px;width:100%"
      onclick="closeModal('modal-detail');openModalEdit('${g.id}', null)">
      ✏ EDITAR ESTA META
    </button>`;

  openModal('modal-detail');
}

// =============================================
//  SPECS helpers
// =============================================
function addSpec(listId) {
  const list  = document.getElementById(listId);
  const empty = list.querySelector('.spec-empty');
  if (empty) empty.remove();
  addSpecWithValues(listId, '', '');
}

function addSpecWithValues(listId, k, v) {
  const list  = document.getElementById(listId);
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
  const row  = btn.closest('.spec-row');
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

// =============================================
//  IMAGE INPUT — tabs / upload / search
// =============================================
function switchImgTab(prefix, tab) {
  // atualiza botões
  document.querySelectorAll(`#modal-${prefix === 'new' ? 'new' : 'edit'} .img-tab`).forEach(btn => {
    btn.classList.remove('active');
  });
  event && event.target && event.target.classList.add('active');
  // fallback: encontrar pelo texto
  document.querySelectorAll(`#modal-${prefix === 'new' ? 'new' : 'edit'} .img-tab`).forEach(btn => {
    const map = { url:'🔗', upload:'📁', search:'🔍' };
    if (btn.textContent.startsWith(map[tab])) btn.classList.add('active');
  });

  // painéis
  ['url','upload','search'].forEach(t => {
    const el = document.getElementById(`${prefix}-img-${t}-panel`);
    if (el) el.classList.toggle('active', t === tab);
  });
}

// Preview ao digitar URL
function previewImg(prefix) {
  const url = document.getElementById(`${prefix}-img-url`).value.trim();
  const box = document.getElementById(`${prefix}-img-preview`);
  const img = document.getElementById(`${prefix}-img-preview-img`);
  const fin = document.getElementById(`${prefix}-img-final`);

  if (url) {
    img.src = url;
    box.style.display = 'block';
    fin.value = url;
  } else {
    box.style.display = 'none';
    fin.value = '';
  }
}

// Upload de arquivo → converte p/ base64 (ou data URL)
function handleUpload(input, prefix) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const box = document.getElementById(`${prefix}-img-preview`);
    const img = document.getElementById(`${prefix}-img-preview-img`);
    const fin = document.getElementById(`${prefix}-img-final`);

    img.src = dataUrl;
    box.style.display = 'block';
    fin.value = dataUrl;

    // Atualiza texto da upload area
    const label = document.getElementById(`${prefix}-upload-area`);
    if (label) {
      const span = label.querySelector('.upload-text');
      if (span) span.textContent = file.name;
    }
  };
  reader.readAsDataURL(file);
}

// Busca imagens via Unsplash Source (sem API key necessária)
function searchUnsplash(prefix) {
  const query   = document.getElementById(`${prefix}-img-search-input`).value.trim();
  const results = document.getElementById(`${prefix}-img-results`);
  if (!query) { showToast('Digite algo para buscar', 'error'); return; }

  results.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Buscando...</div>';

  // Usa Unsplash Source para gerar previews (não precisa de API key)
  const keywords = query.replace(/\s+/g, ',');
  const imgs = [];
  for (let i = 0; i < 6; i++) {
    imgs.push(`https://source.unsplash.com/300x200/?${encodeURIComponent(query)}&sig=${Date.now() + i}`);
  }

  results.innerHTML = imgs.map((src, i) => `
    <div class="img-result-item" onclick="pickSearchImg('${prefix}', this, '${src}')">
      <img src="${src}" alt="resultado ${i+1}" loading="lazy" />
    </div>`).join('');
}

function pickSearchImg(prefix, el, src) {
  // remove picked de outros
  document.querySelectorAll(`#${prefix}-img-results .img-result-item`).forEach(i => i.classList.remove('picked'));
  el.classList.add('picked');

  const box = document.getElementById(`${prefix}-img-preview`);
  const img = document.getElementById(`${prefix}-img-preview-img`);
  const fin = document.getElementById(`${prefix}-img-final`);

  img.src = src;
  box.style.display = 'block';
  fin.value = src;
}

function removeImgPreview(prefix) {
  document.getElementById(`${prefix}-img-preview`).style.display = 'none';
  document.getElementById(`${prefix}-img-final`).value = '';
  document.getElementById(`${prefix}-img-url`).value = '';
  // limpa resultados
  const res = document.getElementById(`${prefix}-img-results`);
  if (res) {
    res.querySelectorAll('.img-result-item').forEach(i => i.classList.remove('picked'));
  }
}

function getImgFinal(prefix) {
  return document.getElementById(`${prefix}-img-final`).value.trim();
}

// =============================================
//  TOAST
// =============================================
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = type === 'success' ? '✓ ' + msg : type === 'error' ? '✕ ' + msg : msg;
  t.className   = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}
