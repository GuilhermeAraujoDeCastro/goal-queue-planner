// Firebase "de mentira" pros testes automáticos: auth + Firestore em memória, imitando
// só o pedaço do SDK compat que o app usa. Os testes servem este arquivo no lugar do SDK.
(function () {
  const contas = {};
  const docs = {};               // caminho completo -> dados
  const ouvintesAuth = [];
  const ouvintesColecao = [];    // { caminho, ordem, fn }
  let atual = null;
  let proximoId = 1;

  function usuario(uid, email, nome) {
    return {
      uid, email, displayName: nome, isAnonymous: false,
      updateProfile(p) { this.displayName = p.displayName; contas[email].nome = p.displayName; return Promise.resolve(); },
    };
  }
  const avisarAuth = () => ouvintesAuth.forEach((fn) => setTimeout(() => fn(atual), 0));
  const falha = (code) => Promise.reject({ code, message: code });

  const auth = {
    get currentUser() { return atual; },
    onAuthStateChanged(fn) { ouvintesAuth.push(fn); setTimeout(() => fn(atual), 0); return () => {}; },
    createUserWithEmailAndPassword(email, senha) {
      if (contas[email]) return falha('auth/email-already-in-use');
      if (senha.length < 6) return falha('auth/weak-password');
      contas[email] = { uid: 'uid_' + proximoId++, senha, nome: null };
      atual = usuario(contas[email].uid, email, null);
      avisarAuth();
      return Promise.resolve({ user: atual });
    },
    signInWithEmailAndPassword(email, senha) {
      const c = contas[email];
      if (!c || c.senha !== senha) return falha('auth/invalid-credential');
      atual = usuario(c.uid, email, c.nome);
      avisarAuth();
      return Promise.resolve({ user: atual });
    },
    sendPasswordResetEmail() { window.__resetEnviado = true; return Promise.resolve(); },
    signOut() { atual = null; avisarAuth(); return Promise.resolve(); },
  };

  // Regra igual à do firestore.rules: users/{uid}/** só pro dono; meta pública pode ser lida por todos.
  function podeLer(caminho) {
    const p = caminho.split('/');
    if (p[0] !== 'users') return true;
    if (atual && p[1] === atual.uid) return true;
    return p.length === 4 && p[2] === 'goals' && docs[caminho] && docs[caminho].publico === true;
  }
  function podeGravar(caminho) {
    const p = caminho.split('/');
    return p[0] !== 'users' || (atual && p[1] === atual.uid);
  }
  function resolver(valor) {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = v && v.__servidor ? { toDate: () => new Date(), seconds: Date.now() / 1000 } : v;
    return out;
  }
  function notificar() {
    ouvintesColecao.forEach((o) => setTimeout(() => o.fn(snapshotColecao(o.caminho, o.ordem)), 0));
  }
  function filhosDe(caminho) {
    const prof = caminho.split('/').length + 1;
    return Object.keys(docs).filter((k) => k.startsWith(caminho + '/') && k.split('/').length === prof);
  }
  function snapshotDoc(caminho) {
    const dados = docs[caminho];
    return { id: caminho.split('/').pop(), exists: dados !== undefined, data: () => (dados ? { ...dados } : undefined) };
  }
  function snapshotColecao(caminho, ordem) {
    let lista = filhosDe(caminho).map(snapshotDoc);
    if (ordem) lista.sort((a, b) => (a.data()[ordem] > b.data()[ordem] ? 1 : -1));
    return { docs: lista, empty: lista.length === 0, forEach: (fn) => lista.forEach(fn), size: lista.length };
  }

  function doc(caminho) {
    return {
      id: caminho.split('/').pop(),
      collection: (nome) => colecao(caminho + '/' + nome),
      get() { return podeLer(caminho) ? Promise.resolve(snapshotDoc(caminho)) : falha('permission-denied'); },
      set(valor) { if (!podeGravar(caminho)) return falha('permission-denied'); docs[caminho] = resolver(valor); notificar(); return Promise.resolve(); },
      update(valor) {
        if (!podeGravar(caminho) || !docs[caminho]) return falha('permission-denied');
        docs[caminho] = { ...docs[caminho], ...resolver(valor) }; notificar(); return Promise.resolve();
      },
      delete() { if (!podeGravar(caminho)) return falha('permission-denied'); delete docs[caminho]; notificar(); return Promise.resolve(); },
    };
  }
  function colecao(caminho, ordem = null) {
    return {
      doc: (id) => doc(caminho + '/' + (id || 'auto' + proximoId++)),
      add(valor) { const d = doc(caminho + '/auto' + proximoId++); return d.set(valor).then(() => d); },
      orderBy: (campo) => colecao(caminho, campo),
      limit: () => colecao(caminho, ordem),
      get() { return podeLer(caminho + '/x') || podeGravar(caminho) ? Promise.resolve(snapshotColecao(caminho, ordem)) : falha('permission-denied'); },
      onSnapshot(fn) {
        const o = { caminho, ordem, fn };
        ouvintesColecao.push(o);
        setTimeout(() => fn(snapshotColecao(caminho, ordem)), 0);
        return () => ouvintesColecao.splice(ouvintesColecao.indexOf(o), 1);
      },
    };
  }
  const firestore = {
    collection: (nome) => colecao(nome),
    batch() {
      const ops = [];
      return {
        update: (ref, v) => ops.push(() => ref.update(v)),
        set: (ref, v) => ops.push(() => ref.set(v)),
        delete: (ref) => ops.push(() => ref.delete()),
        commit: () => Promise.all(ops.map((op) => op())),
      };
    },
  };
  const firestoreFn = () => firestore;
  firestoreFn.FieldValue = { serverTimestamp: () => ({ __servidor: true }) };

  window.firebase = {
    initializeApp() {},
    auth: () => auth,
    firestore: firestoreFn,
  };
  window.__fakeFirebase = { contas, docs };
})();
