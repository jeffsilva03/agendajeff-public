import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("Faculdade: disciplina com horário aparece na grade, no Hoje e na Agenda; prova vira prazo com lembretes", async ({ page }) => {
  await ir(page, "/faculdade?data=2026-10-20");
  await expect(page.getByRole("combobox", { name: "Semestre" })).toContainText("2º semestre de 2026");
  await expect(page.getByText("Sua grade aparece aqui")).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar disciplina" }).click();
  await page.fill("#d-nome", "Banco de Dados");
  await page.fill("#d-sala", "Sala 12");
  await page.getByRole("combobox", { name: "Dia da semana" }).selectOption("3"); // quarta
  await page.getByRole("textbox", { name: "Início" }).fill("18:30");
  await page.getByRole("textbox", { name: "Fim" }).fill("20:30");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(page.getByText("Disciplina cadastrada.")).toBeVisible();
  await expect(page.getByRole("region", { name: /Grade/ }).or(page.locator("section[aria-labelledby=t-grade]"))).toContainText("Banco de Dados");

  // Prova
  await page.getByRole("button", { name: "Prova ou trabalho" }).click();
  await page.fill("#a-titulo", "P1");
  await page.fill("#a-data", "2026-10-28");
  await page.fill("#a-hora", "19:00");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(page.getByText("Cadastrado. Já aparece na agenda.")).toBeVisible();
  await expect(page.locator("section[aria-labelledby=t-avaliacoes]")).toContainText("em 8 dias");

  // Hoje de quarta: aula na faixa do topo
  await ir(page, "/hoje?data=2026-10-21");
  await expect(page.getByRole("region", { name: "Agenda e prazos" })).toContainText("Banco de Dados");

  // Agenda: aula na semana e a prova (com lembrete na véspera)
  await ir(page, "/agenda?data=2026-10-28");
  await expect(page.locator("section[aria-label='Quarta, 28 de outubro']")).toContainText("Banco de Dados");
  await expect(page.locator("section[aria-label='Quarta, 28 de outubro']")).toContainText("Prova: P1 (Banco de Dados)");
  await expect(page.locator("section[aria-label='Terça, 27 de outubro']")).toContainText("prazo em 28/10"); // lembrete na véspera

  // Feriado: a aula some (02/11 é segunda; usa a quarta 21/10 com "Sem aula")
  await ir(page, "/agenda?data=2026-10-21");
  await page.getByRole("button", { name: "Evento", exact: true }).click();
  await page.getByRole("radio", { name: "Sem aula" }).click();
  await page.fill("#e-data", "2026-10-21");
  await page.getByRole("button", { name: "Criar evento" }).click();
  await expect(page.getByText("Evento criado.")).toBeVisible();
  await expect(page.locator("section[aria-label='Quarta, 21 de outubro']")).not.toContainText("Banco de Dados");

  // Marcar a prova como feita tira dos prazos
  await ir(page, "/faculdade?data=2026-10-20");
  await page.getByRole("button", { name: "Marcar P1 como feita" }).click();
  await expect(page.getByText("P1: feita.")).toBeVisible();
  await ir(page, "/agenda?data=2026-10-28");
  await expect(page.locator("section[aria-label='Quarta, 28 de outubro']")).not.toContainText("Prova: P1");
});
