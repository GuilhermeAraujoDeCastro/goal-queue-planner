// Gráfico de evolução do valor guardado ao longo do tempo, por meta.
// Alimentado pela subcoleção "contributions", criada a cada depósito
// (veja goals.js). Metas antigas, criadas antes desse histórico existir,
// simplesmente não têm pontos ainda: o gráfico some e um aviso aparece
// no lugar até o primeiro depósito novo.

import { db } from './firebase-config.js';
import { state } from './state.js';

let evolutionChart = null;

export async function renderEvolutionChart(goalId) {
  const canvas = document.getElementById('evolution-chart');
  const emptyMsg = document.getElementById('evolution-empty');
  if (!canvas) return;

  if (evolutionChart) { evolutionChart.destroy(); evolutionChart = null; }

  let snapshot;
  try {
    snapshot = await db
      .collection('users').doc(state.currentUser.uid)
      .collection('goals').doc(goalId)
      .collection('contributions')
      .orderBy('date', 'asc')
      .get();
  } catch (err) {
    console.error('Erro ao carregar histórico de aportes:', err);
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'Não foi possível carregar o histórico agora.';
    return;
  }

  if (snapshot.empty) {
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'Ainda sem histórico. Cada depósito novo entra nesse gráfico.';
    return;
  }

  const points = snapshot.docs.map(d => {
    const v = d.data();
    const date = v.date && v.date.toDate ? v.date.toDate() : new Date();
    return { date, total: v.total };
  });

  canvas.style.display = 'block';
  emptyMsg.style.display = 'none';

  evolutionChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: points.map(p => p.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Valor guardado',
        data: points.map(p => p.total),
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0,200,255,0.12)',
        borderWidth: 2,
        pointBackgroundColor: '#1a6fff',
        pointRadius: 3,
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8aa3c1', maxTicksLimit: 6 }, grid: { color: '#1a2d47' } },
        y: { ticks: { color: '#8aa3c1' }, grid: { color: '#1a2d47' } }
      }
    }
  });
}
