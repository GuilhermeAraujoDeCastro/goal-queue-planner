// Gráfico e lista do histórico de aportes de uma meta (subcoleção "contributions").

import { metasRef } from './metas-db.js';
import { escapeHtml, fmtR } from './planejamento.js';

let evolutionChart = null;

function buscarAportes(goalId) {
  return metasRef().doc(goalId).collection('contributions').orderBy('date', 'asc').get();
}

function dataDoAporte(v) {
  return v.date && v.date.toDate ? v.date.toDate() : new Date();
}

// Cor de uma variável do tema atual (claro/escuro).
function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export async function renderEvolutionChart(goalId) {
  const canvas = document.getElementById('evolution-chart');
  const vazio = document.getElementById('evolution-empty');
  if (!canvas) return;
  if (evolutionChart) { evolutionChart.destroy(); evolutionChart = null; }

  let snapshot;
  try {
    snapshot = await buscarAportes(goalId);
  } catch (err) {
    console.error('Erro ao carregar histórico de aportes:', err);
    canvas.style.display = 'none';
    vazio.style.display = 'block';
    vazio.textContent = 'Não foi possível carregar o histórico agora.';
    return;
  }

  if (snapshot.empty) {
    canvas.style.display = 'none';
    vazio.style.display = 'block';
    vazio.textContent = 'Ainda sem histórico. Cada depósito novo entra nesse gráfico.';
    return;
  }

  const pontos = snapshot.docs.map(d => ({ data: dataDoAporte(d.data()), total: d.data().total }));
  canvas.style.display = 'block';
  vazio.style.display = 'none';
  evolutionChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: pontos.map(p => p.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Valor guardado',
        data: pontos.map(p => p.total),
        borderColor: cor('--primary'),
        backgroundColor: cor('--primary-soft'),
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: cor('--text3'), maxTicksLimit: 6 }, grid: { color: cor('--border') } },
        y: { ticks: { color: cor('--text3') }, grid: { color: cor('--border') } },
      },
    },
  });
}

// Lista dos aportes, o mais recente primeiro.
export async function renderHistorico(goalId) {
  const lista = document.getElementById('historico-aportes');
  if (!lista) return;
  try {
    const snapshot = await buscarAportes(goalId);
    if (snapshot.empty) {
      lista.innerHTML = '<li>Nenhum aporte registrado ainda.</li>';
      return;
    }
    lista.innerHTML = snapshot.docs.slice().reverse().map(d => {
      const v = d.data();
      return `<li><span>${escapeHtml(dataDoAporte(v).toLocaleDateString('pt-BR'))}</span><span>+${fmtR(v.amount)}</span></li>`;
    }).join('');
  } catch {
    lista.innerHTML = '<li>Não foi possível carregar o histórico.</li>';
  }
}
