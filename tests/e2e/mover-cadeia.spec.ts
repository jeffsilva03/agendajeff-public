import { expect, test } from "@playwright/test";
import { abrirTudo, ir } from "./util";

test("Cadeias: mover hábito de bloco, pelo menu, pelo detalhe do hábito, e reordenar cadeias", async ({ page }) => {
  await ir(page, "/habitos");
  await page.getByRole("tab", { name: "Cadeias" }).click();
  const volta = page.locator("section", { has: page.getByRole("heading", { name: "Trajeto de volta", exact: true }) });
  const ida = page.locator("section", { has: page.getByRole("heading", { name: "Trajeto de ida", exact: true }) });
  await expect(volta.locator("ol li")).toContainText(["Alongamento"]);

  // Pelo menu do passo: Mover para → Trajeto de ida (vai para o fim, com o mesmo gatilho e mínimo).
  await volta.getByRole("button", { name: "Mais opções para Alongamento" }).click();
  await page.getByRole("menuitem", { name: /^Trajeto de ida/ }).click();
  await expect(page.getByText("Alongamento agora está em Trajeto de ida.")).toBeVisible();
  await expect(ida.locator("ol li").last()).toContainText("Alongamento");
  await expect(ida.locator("ol li").last()).toContainText("mín. 1 dezena");
  await expect(volta.getByText("Cadeia sem passos. Adicione o primeiro hábito.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Cadeias" }).click();
  await expect(ida.locator("ol li").last()).toContainText("Alongamento");

  // No Hoje de uma quarta com aula, o Alongamento aparece no bloco do trajeto de ida.
  await ir(page, "/hoje?data=2026-10-14");
  await abrirTudo(page);
  await expect(page.locator('[data-grupo="Trajeto de ida"]')).toContainText("Alongamento");
  await expect(page.locator('[data-grupo="Trajeto de volta"]')).toHaveCount(0);

  // Pelo detalhe do hábito (aba Progresso): volta para o Trajeto de volta.
  await ir(page, "/habitos");
  await page.getByRole("button", { name: /Alongamento/ }).first().click();
  const detalhe = page.getByRole("dialog");
  await expect(detalhe.getByText("Onde aparece")).toBeVisible();
  await detalhe.getByRole("combobox", { name: "Mover Alongamento de Trajeto de ida para outra cadeia" }).selectOption({ label: "Trajeto de volta" });
  await expect(page.getByText("Movido para Trajeto de volta.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Cadeias" }).click();
  await expect(volta.locator("ol li")).toContainText(["Alongamento"]);

  // Ordem das cadeias: "Tarde" desce para depois do "Trajeto de ida".
  const titulos = () => page.locator("section h3[id^='c-']").allTextContents();
  const antes = await titulos();
  const iTarde = antes.indexOf("Tarde");
  await page.getByRole("button", { name: "Descer cadeia Tarde", exact: true }).click();
  await expect.poll(async () => (await titulos()).indexOf("Tarde")).toBe(iTarde + 1);
  await page.getByRole("button", { name: "Subir cadeia Tarde", exact: true }).click();
  await expect.poll(async () => (await titulos()).indexOf("Tarde")).toBe(iTarde);
});
