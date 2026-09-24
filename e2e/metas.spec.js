import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// SDK do Firebase trocado por um falso em memória (testes/fake-firebase.js): nada toca no projeto real.
const FIREBASE_FALSO = readFileSync(new URL('../testes/fake-firebase.js', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.route('**/firebasejs/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: route.request().url().includes('app-compat') ? FIREBASE_FALSO : '' }));
});

async function entrar(page) {
  await page.goto('/');
  await page.getByText('Criar conta').first().click();
  await page.fill('#reg-name', 'Ana');
  await page.fill('#reg-email', 'ana@exemplo.com');
  await page.fill('#reg-password', 'segredo123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.locator('#screen-dashboard')).toBeVisible();
}

async function criarMeta(page, { titulo, total, guardado = '', mensal, prio }) {
  await page.getByRole('button', { name: '+ Nova meta' }).click();
  await page.fill('#new-title', titulo);
  await page.fill('#new-total', total);
  if (guardado) await page.fill('#new-saved', guardado);
  await page.fill('#new-monthly', mensal);
  await page.fill('#new-prio', String(prio));
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.locator('.goal-card', { hasText: titulo })).toBeVisible();
}

test('criar metas mostra resumo e linha do tempo em ordem', async ({ page }) => {
  await entrar(page);
  await criarMeta(page, { titulo: 'Notebook', total: '6.000,00', guardado: '1.000', mensal: '500', prio: 1 });
  await criarMeta(page, { titulo: 'Viagem', total: '3000', mensal: '300', prio: 2 });
  await expect(page.locator('#resumo-guardado')).toHaveText('R$ 1.000,00');
  await expect(page.locator('#resumo-falta')).toHaveText('R$ 8.000,00');
  await expect(page.locator('.timeline-row')).toHaveCount(2);
});

test('prioridade repetida é recusada', async ({ page }) => {
  await entrar(page);
  await criarMeta(page, { titulo: 'Notebook', total: '6000', mensal: '500', prio: 1 });
  await page.getByRole('button', { name: '+ Nova meta' }).click();
  await page.fill('#new-title', 'Outra');
  await page.fill('#new-total', '100');
  await page.fill('#new-prio', '1');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.locator('#toast')).toContainText('Já existe uma meta com prioridade 1');
});

test('título com HTML aparece como texto (sem XSS)', async ({ page }) => {
  const alertas = [];
  page.on('dialog', (d) => { alertas.push(d.message()); d.dismiss(); });
  await entrar(page);
  await criarMeta(page, { titulo: '<img src=x onerror=alert(1)>', total: '100', mensal: '10', prio: 1 });
  await expect(page.locator('.goal-name')).toHaveText('<img src=x onerror=alert(1)>');
  expect(alertas).toEqual([]);
});

test('depósito que passa do total registra só o que faltava e comemora', async ({ page }) => {
  await entrar(page);
  await criarMeta(page, { titulo: 'Fone', total: '500', guardado: '400', mensal: '50', prio: 1 });
  await page.getByRole('button', { name: '+ Dinheiro' }).click();
  await page.fill('#deposit-amount', '1.000,00');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.locator('#celebrate-overlay')).toBeVisible();
  const aportes = await page.evaluate(() => Object.entries(window.__fakeFirebase.docs).filter(([k]) => k.includes('/contributions/')).map(([, v]) => v.amount));
  expect(aportes).toEqual([100]);
});

test('reordenar pelas setas salva as novas prioridades', async ({ page }) => {
  await entrar(page);
  await criarMeta(page, { titulo: 'Primeira', total: '100', mensal: '10', prio: 1 });
  await criarMeta(page, { titulo: 'Segunda', total: '100', mensal: '10', prio: 2 });
  await page.getByRole('button', { name: '↕ Reordenar' }).click();
  await page.locator('.reorder-item').nth(1).getByRole('button', { name: 'Subir' }).click();
  await page.getByRole('button', { name: 'Salvar nova ordem' }).click();
  await expect(page.locator('.goal-card').first()).toContainText('Segunda');
});
