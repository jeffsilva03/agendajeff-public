import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("Freelas (marco 6): cadastra, registra horas, prazo na Agenda e sugestão de portfólio", async ({ page }) => {
  await ir(page, "/freelas?data=2026-10-13");
  await expect(page.getByText("Nenhum freela ainda")).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar freela" }).click();
  await page.fill("#f-cliente", "Cliente E2E");
  await page.fill("#f-titulo", "Site institucional");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Em andamento" }).click();
  await page.fill("#f-prazo", "2026-10-20");
  await page.fill("#f-valor", "800");
  await page.fill("#f-horas", "8");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(page.getByText("Freela cadastrado.")).toBeVisible();

  await ir(page, "/agenda?data=2026-10-20");
  await expect(page.locator("section[aria-label='Segunda, 19 de outubro']")).toContainText("Entrega: Site institucional");
  await expect(page.locator("section[aria-label='Terça, 20 de outubro']")).toContainText("vence hoje");

  await ir(page, "/freelas?data=2026-10-13");
  await page.locator("article", { hasText: "Site institucional" }).getByRole("button").click();
  await page.getByRole("textbox", { name: "Horas" }).fill("1,5");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Horas registradas.")).toBeVisible();
  await expect(page.getByRole("dialog").locator("dl")).toContainText("1,5 h");

  await page.getByRole("dialog").getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Entregue" }).click();
  await expect(page.getByText("Vale virar portfólio?")).toBeVisible();
  await page.getByRole("button", { name: "Já registrei" }).click();
  await expect(page.getByText("Marcado como registrado no portfólio.")).toBeVisible();
});
