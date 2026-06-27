// Contas das metas, sem DOM nem Firebase (testadas em testes/*.test.mjs).

// "R$ 1.234,56"
export function fmtR(valor) {
  return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aceita "1.234,56", "1.000" (mil) e "1234.56": ponto só é decimal quando não tem cara de milhar.
export function parseValorBR(texto) {
  const limpo = String(texto ?? '').trim().replace(/^R\$\s*/, '');
  // O texto todo tem que ser número: "10abc" e "1e309" viravam 10 e Infinity com o parseFloat solto.
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$|^\d+\.\d+$/.test(limpo)) return NaN;
  if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ''));
  return Number(limpo);
}

// Texto seguro pra colocar dentro de innerHTML ou de atributo.
export function escapeHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Só aceita imagem http(s) ou data:image (evita "javascript:" no src).
export function urlImagemSegura(url) {
  const u = String(url ?? '').trim();
  return /^(https?:\/\/|data:image\/)/i.test(u) ? u : '';
}

function mesesParaTerminar(meta) {
  const falta = Math.max(0, (meta.total || 0) - (meta.saved || 0));
  if (falta === 0) return 0;
  return meta.monthly > 0 ? Math.ceil(falta / meta.monthly) : null;
}

// Primeiro dia do mês "AAAA-MM".
function inicioDoMes(texto) {
  const [ano, mes] = String(texto || '').split('-').map(Number);
  return ano && mes ? new Date(ano, mes - 1, 1) : null;
}

function somarMeses(data, meses) {
  return new Date(data.getFullYear(), data.getMonth() + meses, 1);
}

// Metas pagas em sequência por prioridade: cada uma começa quando a anterior termina.
// Devolve { [id]: { inicio, fim, conclusao, meses } }. fim é o mês em que a próxima começa;
// conclusao é o mês do último aporte, o que aparece como "fica pronta em" (null sem aporte mensal).
export function cronograma(metas, hoje = new Date()) {
  const ordenadas = [...metas].sort((a, b) => a.prio - b.prio);
  const principal = ordenadas[0];
  let cursor = (principal && inicioDoMes(principal.startMonth)) || new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const resultado = {};
  for (const meta of ordenadas) {
    const meses = mesesParaTerminar(meta);
    const inicio = cursor;
    const fim = meses === null ? null : somarMeses(inicio, meses);
    const conclusao = meses === null ? null : somarMeses(inicio, Math.max(0, meses - 1));
    resultado[meta.id] = { inicio, fim, conclusao, meses };
    // Meta sem aporte trava a fila: as seguintes ficam sem data.
    cursor = fim || cursor;
    if (fim === null) cursor = null;
    if (cursor === null) break;
  }
  for (const meta of ordenadas) {
    if (!resultado[meta.id]) resultado[meta.id] = { inicio: null, fim: null, conclusao: null, meses: mesesParaTerminar(meta) };
  }
  return resultado;
}

// Quanto por mês seria preciso pra terminar até a data alvo ("AAAA-MM"), começando em `inicio`.
export function aporteNecessario(meta, inicio) {
  const alvo = inicioDoMes(meta.deadline);
  if (!alvo || !inicio) return null;
  const falta = Math.max(0, (meta.total || 0) - (meta.saved || 0));
  // Conta o mês do início e o da data alvo: começar em outubro com alvo em outubro dá um aporte.
  const meses = (alvo.getFullYear() - inicio.getFullYear()) * 12 + (alvo.getMonth() - inicio.getMonth()) + 1;
  if (falta === 0) return 0;
  if (meses <= 0) return Infinity;
  return Math.ceil((falta / meses) * 100) / 100;
}

// true quando a previsão de término passa da data alvo.
export function vaiAtrasar(meta, previsao) {
  const alvo = inicioDoMes(meta.deadline);
  if (!alvo) return false;
  if (!previsao || !previsao.conclusao) return true;
  return previsao.conclusao.getTime() > alvo.getTime();
}

// Marcos (25/50/75%) que um depósito acabou de cruzar.
export function marcosCruzados(antes, depois, total) {
  if (!total) return [];
  const pctAntes = (antes / total) * 100;
  const pctDepois = (depois / total) * 100;
  return [25, 50, 75].filter((m) => pctAntes < m && pctDepois >= m);
}

// Nova ordem (lista de ids) -> prioridades 1..n.
export function prioridadesDaOrdem(ids) {
  return Object.fromEntries(ids.map((id, i) => [id, i + 1]));
}

// "outubro de 2026"
export function mesPorExtenso(data) {
  return data ? data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
}
