// UI genérica: telas, loading, toast e modais.

export function showLoading() {
  document.getElementById('loading-overlay').classList.add('visible');
}
export function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('visible');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

export function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = type === 'success' ? '✓ ' + msg : type === 'error' ? '✕ ' + msg : msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}

export function openModal(id) {
  document.getElementById(id).classList.add('open');
}
export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

// Tema claro/escuro: guarda a escolha e troca o ícone dos botões.
export function alternarTema() {
  const escuro = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  try { localStorage.setItem('metas-tema', escuro ? 'dark' : 'light'); } catch { /* só não lembra no próximo acesso */ }
  sincronizarIconeTema();
}

export function sincronizarIconeTema() {
  const escuro = document.documentElement.dataset.theme === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(b => { b.textContent = escuro ? '☀️' : '🌙'; });
}

document.addEventListener('DOMContentLoaded', sincronizarIconeTema);

window.alternarTema = alternarTema;
window.showScreen = showScreen;
window.openModal = openModal;
window.closeModal = closeModal;
