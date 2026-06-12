// Ponto de entrada. Liga a autenticação ao carregamento do dashboard e
// importa os módulos que só registram funções em window (goals.js,
// images.js, celebrate.js), pra ficarem disponíveis pros onclick do HTML.

import { initAuth } from './auth.js';
import { loadDashboard } from './goals.js';
import { showScreen } from './ui.js';
import './images.js';
import './celebrate.js';

initAuth(
  () => loadDashboard(),
  () => showScreen('screen-login')
);
