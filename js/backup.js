import { cents, validateGoal } from './finance-domain.js';
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const fields = ['title', 'total', 'saved', 'monthly', 'prio', 'publico', 'specs', 'img', 'category', 'startMonth', 'deadline', 'status', 'archivedAt', 'createdAt'];
export const cleanGoal = g => Object.fromEntries(fields.filter(k => g[k] !== undefined).map(k => [k, g[k]?.toDate ? g[k].toDate().toISOString() : g[k] instanceof Date ? g[k].toISOString() : g[k]]));
export function validateBackup(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data?.format !== 'web-metas' || data.version !== 1 || !Array.isArray(data.goals) || data.goals.length > 150) throw new Error('Backup Web Metas v1 inválido (máximo de 150 metas).');
  const seen = new Set(); let count = 0;
  const goals = data.goals.map(item => {
    if (!ID.test(item.id) || seen.has(item.id)) throw new Error('Identificador de meta inválido ou repetido.');
    seen.add(item.id); const goal = validateGoal(cleanGoal(item));
    if (!Array.isArray(item.contributions)) throw new Error('Histórico ausente.');
    const ids = new Set();
    const contributions = item.contributions.map(c => {
      if (!ID.test(c.id) || ids.has(c.id) || !cents(c.amount) || !Number.isFinite(Date.parse(c.date))) throw new Error('Aporte inválido ou repetido.');
      ids.add(c.id); count++;
      return { id: c.id, amount: cents(c.amount) / 100, total: cents(c.total) / 100, date: new Date(c.date).toISOString() };
    });
    if (count + data.goals.length > 450) throw new Error('Este importador atômico aceita até 450 documentos por backup. Divida o backup por metas, preservando cada histórico completo.');
    return { id: item.id, ...goal, contributions };
  });
  return { format: 'web-metas', version: 1, goals };
}
export function fingerprint(data) {
  const stable = value => value?.toDate ? value.toDate().toISOString() : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
  return JSON.stringify(stable(data));
}
export function mergeGoal(current, incoming, choice = 'skip') {
  if (!current || choice === 'copy') return structuredClone(incoming);
  if (choice === 'skip') return structuredClone(current);
  if (!['current', 'backup'].includes(choice)) throw new Error('Escolha de conflito inválida.');
  const preferred = choice === 'backup' ? incoming : current;
  const other = choice === 'backup' ? current : incoming;
  const map = new Map(other.contributions.map(c => [c.id, { ...c }]));
  preferred.contributions.forEach(c => map.set(c.id, { ...c }));
  const contributions = [...map.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
  let balance = cents(preferred.saved || 0) - preferred.contributions.reduce((s, c) => s + cents(c.amount), 0);
  for (const c of contributions) {
    balance += cents(c.amount);
    if (balance < 0) throw new Error('Ajuste inicial negativo no histórico. Preserve a meta atual ou importe uma cópia separada.');
    c.total = balance / 100;
  }
  const goal = { ...cleanGoal(preferred), id: current.id, saved: balance / 100, contributions };
  validateGoal(goal);
  return goal;
}
export function previewBackup(current, incoming) {
  const known = new Map(current.map(g => [g.id, g]));
  return incoming.map(goal => {
    const old = known.get(goal.id);
    const conflict = old && (JSON.stringify(cleanGoal(old)) !== JSON.stringify(cleanGoal(goal)) || old.contributions.some(c => goal.contributions.some(x => x.id === c.id && JSON.stringify(x) !== JSON.stringify(c))));
    return { id: goal.id, title: goal.title, kind: !old ? 'Inclusão' : conflict ? 'Conflito' : 'Mesclagem', old, incoming: goal };
  });
}
