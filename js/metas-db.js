// Acesso às metas no Firestore: users/{uid}/goals/{id} e o histórico em .../contributions.

import { db } from './firebase-config.js';
import { state } from './state.js';

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
