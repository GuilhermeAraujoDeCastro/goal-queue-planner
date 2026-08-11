import { depositResult } from './finance-domain.js';
// Compatível com adaptadores de testes e com a transação do SDK compat.
export async function commitDeposit(runTransaction, goalRef, contributionRef, amount, timestamp) {
  return runTransaction(async tx => {
    const [goalSnap, receipt] = await Promise.all([tx.get(goalRef), tx.get(contributionRef)]);
    if (receipt.exists) return { ...receipt.data(), repeated: true };
    if (!goalSnap.exists) throw new Error('Meta não encontrada.');
    const result = depositResult(goalSnap.data(), amount);
    if (!result.amount) return result;
    tx.update(goalRef, { saved: result.total });
    tx.set(contributionRef, { amount: result.amount, total: result.total, date: timestamp() });
    return result;
  });
}
