// Estado compartilhado entre os módulos do app.

export const state = {
  currentUser: null,
  goals: [],
  carouselIndex: 0,
  unsubscribeGoals: null
};

// Categorias disponíveis para uma meta: ícone e cor de destaque de cada uma.
// "outro" também é o valor padrão para metas antigas, criadas antes de
// existir este campo.
export const CATEGORIES = {
  eletronicos: { label: 'Eletrônicos', icon: '💻', color: '#1a6fff' },
  viagem:      { label: 'Viagem',      icon: '✈️', color: '#00c8ff' },
  casa:        { label: 'Casa',        icon: '🏠', color: '#00e5a0' },
  veiculo:     { label: 'Veículo',     icon: '🚗', color: '#ff8a3d' },
  educacao:    { label: 'Educação',    icon: '🎓', color: '#b388ff' },
  outro:       { label: 'Outro',       icon: '🎯', color: '#8aa3c1' }
};

export function categoryOf(goal) {
  return CATEGORIES[goal && goal.category] || CATEGORIES.outro;
}

export function fmtR(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
}

// Chave do cache local é por usuário, pra não misturar dados se mais de
// uma conta já usou o mesmo navegador.
export function cacheKey(uid) {
  return 'metas_cache_' + uid;
}

export function saveGoalsCache(uid, goals) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(goals));
  } catch (e) {
    // localStorage indisponível (modo privado, quota cheia etc). Sem
    // cache local esta sessão, mas o app continua funcionando com o
    // Firestore normalmente.
    console.warn('Não foi possível salvar o cache local:', e);
  }
}

export function loadGoalsCache(uid) {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
