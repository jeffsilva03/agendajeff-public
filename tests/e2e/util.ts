import { expect, type Page } from "@playwright/test";

export const ir = async (page: Page, rota: string) => {
  await page.goto(rota);
  await page.waitForLoadState("networkidle");
};

/** Abre todos os blocos recolhidos do Hoje (cadeias, registrados, tarefas e agenda no celular). */
export const abrirTudo = async (page: Page) => {
  const fechados = page.locator('[data-alternar][aria-expanded="false"]');
  for (let n = await fechados.count(); n > 0; n = await fechados.count()) await fechados.first().click();
};

/** Hábito no Hoje (cartão do "agora" ou linha de um bloco). O status fica em data-status. */
export const cartao = (page: Page, habito: string) =>
  page.locator("[data-item]", { has: page.locator("h3", { hasText: habito }) });
export const tarefa = (page: Page, titulo: string) =>
  page.locator("[data-tarefa]", { has: page.locator("h3", { hasText: titulo }) });

type Status = "pendente" | "completo" | "minimo" | "nao_feito" | "nao_se_aplica";
export const statusDe = (page: Page, habito: string, status: Status, opcoes?: { timeout?: number }) =>
  expect(cartao(page, habito)).toHaveAttribute("data-status", status, opcoes);

/** Blocos de hábitos do dia, na ordem da tela (o da vez primeiro). */
export const gruposDoDia = (page: Page) =>
  page.locator("[data-grupo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-grupo")));
