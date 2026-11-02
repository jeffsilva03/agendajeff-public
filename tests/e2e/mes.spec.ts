import { expect, test, type Page } from "@playwright/test";
import { ir } from "./util";

// Mês simulado: ?data= fixa "hoje" em 19/10/2026 no modo de desenvolvimento.
const HOJE = "2026-10-19";

/** Ajusta uma régua (input range) pelo teclado, como uma pessoa faria. */
async function regua(page: Page, rotulo: string, area: string, valor: number) {
  const r = page.locator(`[data-area="${area}"]`).getByRole("slider", { name: rotulo });
  await r.focus();
  await page.keyboard.press("Home");
  for (let i = 1; i < valor; i++) await page.keyboard.press("ArrowRight");
  await expect(r).toHaveValue(String(valor));
}

test("Mês: Raio-X (avaliação, plano, foco, diagnóstico), metas e revisão", async ({ page }) => {
  test.setTimeout(120_000); // fluxo longo: dezenas de ajustes de régua pelo teclado
  await ir(page, `/mes?aba=raiox&data=${HOJE}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro de 2026");
  // Primeira vez: as áreas sugeridas são criadas.
  await expect(page.locator("[data-area]")).toHaveCount(10, { timeout: 15_000 });

  const notas: [string, number, number][] = [["Lazer e hobbies", 8, 2], ["Autocuidado", 10, 5], ["Amizades", 8, 4], ["Família", 9, 6], ["Trabalho e carreira", 8, 10]];
  for (const [area, imp, acao] of notas) {
    await regua(page, "importância", area, imp);
    await regua(page, "ação", area, acao);
  }
  await expect(page.locator('[data-area="Lazer e hobbies"]')).toContainText("gap +6");

  // Passo 2: as 3 maiores lacunas e a área com energia demais.
  const plano = page.locator("#plano");
  await expect(plano).toContainText("Lazer e hobbies");
  await expect(plano).toContainText("gap -2 · excesso");
  const compromisso = plano.locator("li", { hasText: "Lazer e hobbies" }).getByPlaceholder(/domingo à tarde/);
  await compromisso.fill("Domingo à tarde sem tela");
  await compromisso.blur();

  // Passo 3: foco em duas áreas, com como medir.
  const foco = page.locator("#foco");
  await foco.getByRole("button", { name: /^Lazer e hobbies/ }).click();
  await foco.getByRole("button", { name: /^Autocuidado/ }).click();
  await expect(foco.getByText(/2\s*→\s*4/)).toBeVisible(); // meta sugerida: ação + 2
  const medir = foco.locator("li", { hasText: "Lazer e hobbies" }).getByPlaceholder(/domingos livres/);
  await medir.fill("3 domingos livres no mês");
  await medir.blur();

  // Resultado: gráficos e plano de ação.
  const diag = page.locator("#diagnostico");
  await expect(diag.getByRole("heading", { name: "Onde está o gap" })).toBeVisible();
  await expect(diag.getByRole("button", { name: /Lazer e hobbies: importância 8, ação 2/ })).toBeVisible();
  await expect(diag.locator("table").last()).toContainText("Domingo à tarde sem tela");

  // Persistiu (salvamento automático).
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator('[data-area="Autocuidado"]').getByRole("slider", { name: "importância" })).toHaveValue("10");
  await expect(page.locator("#foco").getByRole("button", { name: /^Lazer e hobbies/ })).toHaveAttribute("aria-pressed", "true");

  // Leva o foco para as metas.
  await page.getByRole("button", { name: "Levar o foco para as metas do mês" }).click();
  await expect(page.getByText(/Metas criadas/)).toBeVisible();

  await ir(page, `/mes?data=${HOJE}`);
  await expect(page.locator("[data-meta]")).toHaveCount(2);
  await expect(page.locator("[data-meta]", { hasText: "Lazer e hobbies: ação 2 → 4" })).toContainText("3 domingos livres no mês");

  // Meta de número: cria e soma progresso.
  await page.getByRole("button", { name: "Meta", exact: true }).click();
  await page.fill("#m-titulo", "Ler livros");
  await page.fill("#m-alvo", "4");
  await page.fill("#m-unidade", "livros");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await expect(page.getByText("Meta criada.")).toBeVisible();
  const ler = page.locator("[data-meta]", { hasText: "Ler livros" });
  await ler.getByRole("button", { name: "Aumentar Ler livros" }).click();
  await expect(ler).toContainText("1 de 4 livros");
  await expect(ler).toContainText("Atrás do ritmo"); // dia 19 de 31: o esperado é ~2,5
  await ler.getByRole("button", { name: "Aumentar Ler livros" }).click();
  await expect(ler).toContainText("2 de 4 livros");
  await ler.getByRole("button", { name: "Aumentar Ler livros" }).click();
  await expect(ler).toContainText("3 de 4 livros");
  await expect(ler).toContainText("No caminho");
  await page.reload();
  await expect(page.locator("[data-meta]", { hasText: "Ler livros" })).toContainText("3 de 4 livros");

  // Marco: marcar como feito.
  const marco = page.locator("[data-meta]", { hasText: "Autocuidado" });
  await marco.getByRole("checkbox").check();
  await expect(marco).toContainText("Concluída");

  // Hoje mostra as metas do mês.
  await ir(page, `/hoje?data=${HOJE}`);
  await expect(page.getByRole("region", { name: "Metas do mês" })).toContainText("Ler livros");

  // Revisão: números e reflexão com salvamento automático.
  await ir(page, `/mes?aba=revisao&data=${HOJE}`);
  await expect(page.getByText("Metas do mês")).toBeVisible();
  await page.getByRole("radio", { name: "8", exact: true }).click();
  await page.getByPlaceholder("O que você quer repetir no próximo mês?").fill("Acordar cedo nos dias de aula");
  await page.getByPlaceholder("Uma frase. Ela pode virar meta ou foco no Raio-X.").fill("Treinar 3x por semana");
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.getByRole("radio", { name: "8", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByPlaceholder("O que você quer repetir no próximo mês?")).toHaveValue("Acordar cedo nos dias de aula");
  await expect(page.getByPlaceholder("Uma frase. Ela pode virar meta ou foco no Raio-X.")).toHaveValue("Treinar 3x por semana");
});
