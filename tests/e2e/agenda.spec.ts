import { expect, test } from "@playwright/test";
import { cartao, gruposDoDia, ir } from "./util";

test("Agenda (marco 4): 'Sem aula' tira os trajetos e a bolsa aparece em novembro", async ({ page }) => {
  await ir(page, "/hoje?data=2026-10-15");
  expect(await gruposDoDia(page)).toContain("Trajeto de ida");

  await ir(page, "/agenda?data=2026-10-13");
  await page.getByRole("button", { name: "Evento", exact: true }).click();
  await page.getByRole("radio", { name: "Sem aula" }).click();
  await page.fill("#e-data", "2026-10-15");
  await page.getByRole("button", { name: "Criar evento" }).click();
  await expect(page.getByText("Evento criado.")).toBeVisible();

  await ir(page, "/hoje?data=2026-10-15");
  const grupos = await gruposDoDia(page);
  expect(grupos).toContain("Flexíveis");
  expect(grupos).not.toContain("Trajeto de ida");
  expect(grupos).not.toContain("Trajeto de volta");
  for (const h of ["Praticar inglês", "Leitura", "Alongamento"])
    await expect(cartao(page, h)).toHaveCount(1);

  await ir(page, "/agenda?data=2026-11-03");
  await page.getByRole("radio", { name: "Mês" }).click();
  for (const d of ["1 de novembro", "9 de novembro", "10 de novembro"])
    await expect(page.locator(`button[aria-label*="${d},"]`).first()).toContainText("enviar certificado do curso da bolsa");
});
