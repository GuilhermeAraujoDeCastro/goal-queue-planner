// Regras puras: valores monetários são calculados em centavos.
export function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error('Valor monetário inválido.');
  return Math.round((n + Number.EPSILON) * 100);
}
export function depositResult(goal, amount) {
  if (goal.status === 'archived') throw new Error('Restaure a meta antes de aportar.');
  const before = cents(goal.saved || 0), target = cents(goal.total), wanted = cents(amount);
  if (!wanted) throw new Error('Informe um aporte maior que zero.');
  const applied = Math.min(wanted, Math.max(0, target - before));
  return { before: before / 100, total: (before + applied) / 100, amount: applied / 100, completed: before + applied >= target };
}
export function blockedBy(goals, id) {
  const ordered = [...goals].filter(g => g.status !== 'archived').sort((a, b) => a.prio - b.prio);
  for (const goal of ordered) {
    if (goal.id === id) return null;
    if (cents(goal.saved || 0) < cents(goal.total) && !(goal.monthly > 0)) return goal;
  }
  return null;
}
export function budgetPlan(goals, budget, today = new Date(), limit = 240) {
  const capacity = cents(budget);
  const queue = [...goals].filter(g => g.status !== 'archived').sort((a, b) => a.prio - b.prio).map(g => ({ ...g, remaining: Math.max(0, cents(g.total) - cents(g.saved || 0)), monthlyCents: cents(g.monthly || 0) }));
  const start = queue[0]?.startMonth;
  if (start && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(start)) return { months: [], dates: {}, unresolved: queue.map(g => ({ id: g.id, title: g.title, reason: 'Mês de início inválido. Corrija o mês da primeira meta.' })) };
  const parsed = /^\d{4}-\d{2}$/.test(start || '') ? new Date(start + '-01T12:00:00') : today;
  const months = [], dates = {};
  for (let i = 0; i < limit && queue.some(g => g.remaining > 0); i++) {
    const date = new Date(parsed.getFullYear(), parsed.getMonth() + i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let available = capacity;
    const allocations = [];
    for (const goal of queue) {
      if (!goal.remaining) continue;
      const amount = Math.min(available, goal.monthlyCents, goal.remaining);
      if (amount) allocations.push({ id: goal.id, title: goal.title, amount: amount / 100 });
      goal.remaining -= amount; available -= amount;
      if (!goal.remaining) dates[goal.id] = month;
      else break; // a próxima meta aguarda a prioridade anterior
    }
    months.push({ month, total: (capacity - available) / 100, available: available / 100, allocations });
    if (!capacity || queue.find(g => g.remaining > 0)?.monthlyCents === 0) break;
  }
  return { months, dates, unresolved: queue.filter(g => g.remaining > 0).map(g => ({ id: g.id, title: g.title, reason: !capacity ? 'Orçamento mensal zerado.' : !g.monthlyCents ? 'Aporte pretendido zerado bloqueia a fila.' : 'Previsão excede 240 meses ou aguarda meta anterior.' })) };
}
export function validateGoal(goal) {
  if (!goal || typeof goal !== 'object' || typeof goal.title !== 'string' || !goal.title.trim() || goal.title.length > 120) throw new Error('Nome de meta inválido.');
  if (typeof goal.total !== 'number' || typeof goal.saved !== 'number' || (goal.monthly !== undefined && typeof goal.monthly !== 'number')) throw new Error('Valores monetários devem ser números.');
  if (!cents(goal.total) || cents(goal.saved || 0) > cents(goal.total)) throw new Error('Saldo ou alvo inválido.');
  cents(goal.monthly || 0);
  if (!Number.isInteger(goal.prio) || goal.prio < 1) throw new Error('Prioridade inválida.');
  if (goal.status && !['active', 'archived'].includes(goal.status)) throw new Error('Estado de meta inválido.');
  for (const name of ['startMonth', 'deadline']) if (goal[name] && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(goal[name])) throw new Error('Mês de início ou prazo inválido.');
  if (goal.img && (typeof goal.img !== 'string' || goal.img.length > 900000 || !/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(goal.img))) throw new Error('Imagem inválida.');
  if (goal.specs && (!Array.isArray(goal.specs) || goal.specs.length > 30 || goal.specs.some(s => !s || typeof s.k !== 'string' || s.k.length > 40 || typeof s.v !== 'string' || s.v.length > 80))) throw new Error('Detalhes inválidos.');
  return goal;
}
export function budgetTimeline(goals, budget, today = new Date()) {
  const plan = budgetPlan(goals, budget, today), result = {};
  for (const goal of goals) {
    const active = plan.months.filter(month => month.allocations.some(a => a.id === goal.id));
    const completed = plan.dates[goal.id];
    const inicio = active.length ? new Date(active[0].month + '-01T12:00:00') : null;
    const conclusao = completed ? new Date(completed + '-01T12:00:00') : null;
    const fim = conclusao ? new Date(conclusao.getFullYear(), conclusao.getMonth()+1,1) : null;
    result[goal.id] = { inicio, conclusao, fim, meses: conclusao ? active.length : null };
    if (goal.saved >= goal.total) result[goal.id] = { inicio: today, conclusao: today, fim: today, meses: 0 };
  }
  return result;
}
