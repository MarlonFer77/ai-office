import { expect, test } from '@playwright/test';

/**
 * Full demo flow through the real UI, API, queue and worker:
 * sign up → create project → add two agents → define mission → approve plan →
 * tasks run → handoff → artifact → approve final deliverable → mission completed.
 */
test('demo mission end-to-end', async ({ page }) => {
  const email = `e2e-${Date.now()}@aioffice.dev`;

  // 1. Sign up
  await page.goto('/signup');
  await page.getByLabel('Nome').fill('Diretora E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('senha-super-segura');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL('**/projects/new**');

  // 2. Create an empty demo project with the wizard
  await page.getByLabel('Nome').fill('Projeto E2E');
  await page.getByLabel('Objetivo').fill('Validar o fluxo completo');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /Demonstração/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /Começar vazio/ }).click();
  await page.getByRole('button', { name: /Criar e entrar no escritório/ }).click();
  await page.waitForURL('**/office');
  await expect(page.getByRole('region', { name: 'Equipe do projeto' })).toBeVisible();

  // 3. Add two agents (independent sessions)
  for (const [name, role] of [
    ['Claude Estrategista', 'strategist'],
    ['Claude Pesquisador', 'researcher'],
  ] as const) {
    await page
      .getByRole('button', { name: /Adicionar agente/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nome').fill(name);
    await dialog.getByLabel('Função').selectOption(role);
    await dialog.getByRole('button', { name: 'Adicionar agente' }).click();
    await expect(page.getByRole('button', { name: `Abrir ${name}` })).toBeVisible();
  }

  // 4. Define a mission
  await page.getByRole('button', { name: 'Definir missão' }).click();
  await page
    .getByLabel('Objetivo')
    .fill('Crie uma estratégia de lançamento para um novo software de gestão financeira.');
  await page.getByRole('button', { name: /Iniciar planejamento/ }).click();

  // 5. Human approval of the plan (shown in the live feed)
  const feed = page.getByRole('complementary', { name: 'Atividades em tempo real' });
  await expect(feed.getByText('Plano da missão')).toBeVisible({ timeout: 60_000 });
  await feed.getByRole('button', { name: 'Aprovar' }).first().click();

  // 6. Tasks execute, the strategist hands off to the researcher, artifacts are created,
  //    and the final deliverable waits for approval.
  await expect(feed.getByText('Entrega final')).toBeVisible({ timeout: 90_000 });
  await expect(feed.getByText(/enviou "Definir estratégia" para Claude Pesquisador/)).toBeVisible();
  await feed.getByRole('button', { name: 'Aprovar' }).first().click();
  await expect(feed.getByText(/Missão concluída/)).toBeVisible({ timeout: 30_000 });

  // 7. Verify persisted state after a full reload
  await page.goto('/tasks');
  await expect(page.getByText('Concluída').first()).toBeVisible();
  await expect(page.getByText(/Claude Estrategista.*→.*Claude Pesquisador/)).toBeVisible();
  await expect(page.getByText('2/2 concluídas')).toBeVisible();

  await page.goto('/library');
  await expect(page.getByRole('button', { name: /Definir estratégia\.md/ })).toBeVisible();
  await page.getByRole('button', { name: /Pesquisa de mercado\.md/ }).click();
  await expect(page.getByText('Relatório de pesquisa')).toBeVisible();

  // 8. Chat history of each agent persists independently across reloads
  await page.goto('/office');
  await page.getByRole('button', { name: 'Abrir Claude Pesquisador' }).click();
  await expect(page.getByText(/Briefing do orquestrador/)).toBeVisible();
  await page
    .getByLabel(/Mensagem para Claude Pesquisador/)
    .fill('Mensagem exclusiva do pesquisador');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/interação nº/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Claude Estrategista' }).click();
  await expect(
    page.getByRole('dialog').getByText('Mensagem exclusiva do pesquisador', { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Abrir Claude Pesquisador' }).click();
  await expect(
    page.getByRole('dialog').getByText('Mensagem exclusiva do pesquisador', { exact: true }),
  ).toBeVisible();
});

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/office');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'Entrar no escritório' })).toBeVisible();
});
