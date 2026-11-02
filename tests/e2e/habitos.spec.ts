import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("Hábitos (marco 3): cria na cadeia, reordena e aparece no Hoje", async ({ page }) => {
  await ir(page, "/habitos");
  await page.getByRole("button", { name: "Hábito", exact: true }).click();
  await page.fill("#h-nome", "Revisar flashcards");
  await page.getByRole("combobox", { name: "Em qual cadeia entra?" }).click();
  await page.getByRole("option", { name: "Manhã", exact: true }).click();
  await page.fill("#h-gatilho", "Depois do Estudo Tech");
  await page.fill("#h-min", "5 cartões");
  await expect(page.getByText("Depois do Estudo Tech, eu vou revisar flashcards.")).toBeVisible();
  await page.getByRole("button", { name: "Criar hábito" }).click();
  await expect(page.getByText("Hábito criado.")).toBeVisible();

  await page.getByRole("tab", { name: "Cadeias" }).click();
  const manha = page.locator("section", { has: page.getByRole("heading", { name: "Manhã", exact: true }) });
  await expect(manha.locator("ol li").last()).toContainText("Revisar flashcards");
  await page.getByRole("button", { name: "Reordenar Revisar flashcards" }).focus();
  for (const tecla of ["Space", "ArrowUp", "ArrowUp", "Space"]) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(200); // dnd-kit anima cada passo
  }
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByRole("tab", { name: "Cadeias" }).click();
  await expect(manha.locator("ol li").nth(2)).toContainText("Revisar flashcards");

  await ir(page, "/hoje?data=2026-10-14");
  // Fica no bloco da Manhã
  await expect(page.locator('[data-grupo="Manhã"]').locator("[data-item]", { hasText: "Revisar flashcards" })).toHaveCount(1);
});

test("Hábitos: antes do início, o progresso não inventa números", async ({ page }) => {
  await ir(page, "/habitos?data=2026-10-12");
  await expect(page.getByText("o acompanhamento começa em 13/10")).toBeVisible();
  await expect(page.getByText("aparece após o primeiro dia completo")).toBeVisible();
});
