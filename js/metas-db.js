// Acesso às metas no Firestore: users/{uid}/goals/{id} e o histórico em .../contributions.

import { db } from './firebase-config.js';
import { state } from './state.js';
import { FieldValue } from './firebase-config.js';
import { commitDeposit } from './transactions.js';

export const metasRef = () => db.collection('users').doc(state.currentUser.uid).collection('goals');

// Apaga a meta e os aportes dela (o Firestore não apaga subcoleção sozinho).
export async function apagarMetaComHistorico(id) {
  const ref = metasRef().doc(id);
  const aportes = await ref.collection('contributions').get();
  const lote = db.batch();
  aportes.forEach(d => lote.delete(ref.collection('contributions').doc(d.id)));
  lote.delete(ref);
  await lote.commit();
}

export function arquivarMeta(id) {
  return metasRef().doc(id).update({ status: 'archived', archivedAt: new Date().toISOString(), publico: false });
}
export async function restaurarMeta(id) {
  const next = Math.max(0, ...state.goals.map(g => g.prio || 0)) + 1;
  await metasRef().doc(id).update({ status: 'active', archivedAt: null, prio: next });
}
export function depositarMeta(id, amount, operationId) {
  const ref = metasRef().doc(id), contribution = ref.collection('contributions').doc(operationId);
  return commitDeposit(fn => db.runTransaction(fn), ref, contribution, amount, () => FieldValue.serverTimestamp());
}
