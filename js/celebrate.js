// Comemorações: meta concluída (card em imagem ou vídeo, depois arquivar) e confete nos marcos.

import { state } from './state.js';
import { showToast } from './ui.js';
import { apagarMetaComHistorico } from './metas-db.js';
import { escapeHtml, fmtR } from './planejamento.js';

let pendingGoalId = null;
let pendingGoalTitle = null;

// Pedacinhos de papel caindo (CSS puro, somem sozinhos).
export function soltarConfete(quantidade = 60) {
  const cores = ['#4f46e5', '#7c3aed', '#c026d3', '#10b981', '#f59e0b', '#06b6d4'];
  for (let i = 0; i < quantidade; i++) {
    const peca = document.createElement('div');
    peca.className = 'confete';
    peca.style.left = Math.random() * 100 + 'vw';
    peca.style.background = cores[i % cores.length];
    peca.style.animationDelay = Math.random() * 0.6 + 's';
    document.body.appendChild(peca);
    setTimeout(() => peca.remove(), 3200);
  }
}

export function celebrateGoal(id, title) {
  pendingGoalId = id;
  pendingGoalTitle = title;
  soltarConfete();
  const overlay = document.createElement('div');
  overlay.className = 'celebrate-overlay';
  overlay.id = 'celebrate-overlay';
  overlay.innerHTML = `
    <div class="celebrate-box" id="celebrate-card">
      <div class="celebrate-emoji">🏆</div>
      <div class="celebrate-title">Meta concluída!</div>
      <div class="celebrate-sub">${escapeHtml(title)}</div>
      <div class="celebrate-msg">Parabéns, você chegou lá!</div>
    </div>
    <div class="celebrate-actions">
      <button class="btn-secondary" onclick="exportCelebrationCard()">⬇ Imagem</button>
      <button class="btn-secondary" onclick="exportarVideoMeta('${escapeHtml(id)}')">🎬 Vídeo</button>
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
    const canvas = await html2canvas(card, { backgroundColor: null, scale: 2 });
    baixar(canvas.toDataURL('image/png'), 'meta-concluida.png');
  } catch (err) {
    console.error('Erro ao exportar card de conquista:', err);
    showToast('Não foi possível gerar a imagem agora', 'error');
  }
}

function baixar(url, nome) {
  const link = document.createElement('a');
  link.download = nome;
  link.href = url;
  link.click();
}

// Vídeo curto (4s, formato Stories 9:16) da barra enchendo até o progresso atual.
// Desenha num canvas e grava com MediaRecorder: sem biblioteca e sem servidor.
async function exportarVideoMeta(id) {
  const meta = state.goals.find(g => g.id === id);
  if (!meta) return;
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    showToast('Este navegador não grava vídeo. Use a imagem.', 'error');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  const pctFinal = Math.min(100, ((meta.saved || 0) / meta.total) * 100);
  const tipo = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const gravador = new MediaRecorder(canvas.captureStream(30), { mimeType: tipo });
  const pedacos = [];
  gravador.ondataavailable = e => { if (e.data.size) pedacos.push(e.data); };
  const terminou = new Promise(resolve => { gravador.onstop = resolve; });

  showToast('Gerando o vídeo...', '');
  gravador.start();
  const duracao = 4000;
  const inicio = performance.now();
  await new Promise(resolve => {
    function quadro(agora) {
      const t = Math.min(1, (agora - inicio) / duracao);
      desenharQuadro(ctx, meta, pctFinal * easeOut(Math.min(1, t * 1.4)));
      if (t < 1) requestAnimationFrame(quadro); else resolve();
    }
    requestAnimationFrame(quadro);
  });
  gravador.stop();
  await terminou;
  baixar(URL.createObjectURL(new Blob(pedacos, { type: 'video/webm' })), 'progresso-meta.webm');
  showToast('Vídeo pronto!', 'success');
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function desenharQuadro(ctx, meta, pct) {
  const { width: w, height: h } = ctx.canvas;
  const fundo = ctx.createLinearGradient(0, 0, w, h);
  fundo.addColorStop(0, '#4338ca');
  fundo.addColorStop(0.6, '#7c3aed');
  fundo.addColorStop(1, '#c026d3');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '700 44px Sora, sans-serif';
  quebrarTexto(ctx, meta.title, w / 2, 300, w - 80, 54);
  ctx.font = '700 120px Sora, sans-serif';
  ctx.fillText(Math.round(pct) + '%', w / 2, 540);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(60, 600, w - 120, 26);
  ctx.fillStyle = '#fff';
  ctx.fillRect(60, 600, ((w - 120) * pct) / 100, 26);
  ctx.font = '500 28px Inter, sans-serif';
  ctx.fillText(`${fmtR(meta.saved)} de ${fmtR(meta.total)}`, w / 2, 690);
  ctx.font = '500 22px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('feito com o Metas 🎯', w / 2, h - 60);
}

function quebrarTexto(ctx, texto, x, y, largura, alturaLinha) {
  const palavras = String(texto).split(' ');
  let linha = '';
  for (const palavra of palavras) {
    const teste = linha ? linha + ' ' + palavra : palavra;
    if (ctx.measureText(teste).width > largura && linha) {
      ctx.fillText(linha, x, y);
      linha = palavra;
      y += alturaLinha;
    } else {
      linha = teste;
    }
  }
  ctx.fillText(linha, x, y);
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
    await apagarMetaComHistorico(id);
    showToast('Meta "' + title + '" concluída e arquivada!', 'success');
  } catch (err) {
    showToast('Erro ao arquivar: ' + err.message, 'error');
  }
  pendingGoalId = null;
  pendingGoalTitle = null;
}

Object.assign(window, { exportCelebrationCard, archiveCelebratedGoal, exportarVideoMeta });
