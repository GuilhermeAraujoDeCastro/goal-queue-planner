// Comemoração ao concluir uma meta. A versão original mostrava um overlay
// por 3 segundos e arquivava a meta sozinha, sem nenhuma forma de guardar
// aquele momento. Agora o overlay fica na tela até a pessoa decidir: dá
// pra baixar um card em imagem (via html2canvas) antes de arquivar, ou só
// arquivar direto.

import { db } from './firebase-config.js';
import { state } from './state.js';
import { showToast } from './ui.js';

let pendingGoalId = null;
let pendingGoalTitle = null;

export function celebrateGoal(id, title) {
  pendingGoalId = id;
  pendingGoalTitle = title;

  const overlay = document.createElement('div');
  overlay.className = 'celebrate-overlay';
  overlay.id = 'celebrate-overlay';
  overlay.innerHTML = `
    <div class="celebrate-box" id="celebrate-card">
      <div class="celebrate-emoji">🏆</div>
      <div class="celebrate-title">META CONCLUÍDA!</div>
      <div class="celebrate-sub">${title}</div>
      <div class="celebrate-msg">Parabéns! Você atingiu seu objetivo!</div>
    </div>
    <div class="celebrate-actions">
      <button class="btn-submit" onclick="exportCelebrationCard()">⬇️ Baixar imagem</button>
      <button class="btn-primary" onclick="archiveCelebratedGoal()">Arquivar meta</button>
    </div>`;
  document.body.appendChild(overlay);

  const card = document.getElementById('card-' + id);
  if (card) card.classList.add('goal-card-complete');
}

async function exportCelebrationCard() {
  const card = document.getElementById('celebrate-card');
  if (!card || typeof html2canvas !== 'function') {
    showToast('Não foi possível gerar a imagem agora', 'error');
    return;
  }
  try {
    const canvas = await html2canvas(card, { backgroundColor: '#0d1828', scale: 2 });
    const link = document.createElement('a');
    link.download = 'meta-concluida.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Erro ao exportar card de conquista:', err);
    showToast('Não foi possível gerar a imagem agora', 'error');
  }
}

async function archiveCelebratedGoal() {
  const id = pendingGoalId;
  const title = pendingGoalTitle;
  if (!id) return;

  const overlay = document.getElementById('celebrate-overlay');
  if (overlay) {
    overlay.classList.add('celebrate-fade-out');
    setTimeout(() => overlay.remove(), 500);
  }

  try {
    await db.collection('users').doc(state.currentUser.uid).collection('goals').doc(id).delete();
    showToast('Meta "' + title + '" concluída e arquivada!', 'success');
  } catch (err) {
    showToast('Erro ao arquivar: ' + err.message, 'error');
  }

  pendingGoalId = null;
  pendingGoalTitle = null;
}

window.exportCelebrationCard = exportCelebrationCard;
window.archiveCelebratedGoal = archiveCelebratedGoal;
