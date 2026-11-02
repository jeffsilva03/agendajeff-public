import { expect, test } from "@playwright/test";
import { cartao, ir, statusDe } from "./util";

test("iPhone: cartão do agora, marcação com um toque, blocos recolhidos e navegação inferior", async ({ page }) => {
  await ir(page, "/hoje?data=2026-10-14");
  const agora = page.getByRole("region", { name: /^Agora:/ });
  await expect(agora).toBeVisible();
  const primeiro = (await agora.locator("[data-item] h3 > span").first().innerText()).trim();
  await page.getByRole("button", { name: `Marcar ${primeiro} como feito` }).first().tap();
  await statusDe(page, primeiro, "completo");
  // Tarefas ficam recolhidas no celular: abrem com um toque
  await expect(page.getByRole("textbox", { name: "Nova tarefa" })).toBeHidden();
  await page.getByRole("region", { name: "Tarefas" }).getByRole("button", { expanded: false }).tap();
  await expect(page.getByRole("textbox", { name: "Nova tarefa" })).toBeVisible();
  await page.getByRole("region", { name: "Registrados hoje" }).getByRole("button", { expanded: false }).tap();
  await page.getByRole("button", { name: `Desfazer ${primeiro}` }).tap();
  await expect(cartao(page, primeiro)).toHaveAttribute("data-status", "pendente");
  await page.getByRole("navigation", { name: "Principal" }).last().getByRole("link", { name: "Hábitos" }).tap();
  await expect(page).toHaveURL(/\/habitos/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Hábitos" })).toBeVisible({ timeout: 20_000 });
});
