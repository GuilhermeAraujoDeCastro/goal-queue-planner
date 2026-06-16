// Ponto de entrada: liga o login ao painel, abre a visão pública (?meta=uid/id) e registra o PWA.

import { initAuth } from './auth.js';
import { loadDashboard, mostrarMetaPublica } from './goals.js';
import { showScreen, sincronizarIconeTema } from './ui.js';
import './images.js';
import './celebrate.js';

sincronizarIconeTema();

const metaCompartilhada = new URLSearchParams(location.search).get('meta');
if (metaCompartilhada && metaCompartilhada.includes('/')) {
  const [uid, goalId] = metaCompartilhada.split('/');
  mostrarMetaPublica(uid, goalId);
} else {
  initAuth(
    () => loadDashboard(),
    () => showScreen('screen-login'),
  );
}

// App instalável/offline (só em http(s); abrir o arquivo direto não aceita service worker).
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker não registrou:', err));
}
