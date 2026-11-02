import { expect, test } from "@playwright/test";
import { cartao, ir, statusDe, tarefa } from "./util";

test("Candidaturas: registrar marca o hábito no dia e a entrevista entra na agenda", async ({ page }) => {
  await ir(page, "/candidaturas?data=2026-10-26");
  await expect(page.getByText("Nenhuma candidatura registrada")).toBeVisible();
  await page.getByRole("button", { name: "Registrar candidatura" }).click();
  await page.fill("#c-emp", "ACME");
  await page.fill("#c-vaga", "Estágio em desenvolvimento");
  await page.fill("#c-origem", "LinkedIn");
  await page.fill("#c-envio", "2026-10-26");
  await page.fill("#c-acao", "Entrevista com RH");
  await page.fill("#c-pdata", "2026-10-29");
  await page.fill("#c-phora", "14:00");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Enviar candidaturas: mínimo cumprido em 26/10.")).toBeVisible();
  await expect(page.locator('section[aria-label^="Enviada,"]')).toContainText("ACME");

  await ir(page, "/hoje?data=2026-10-26");
  await statusDe(page, "Enviar candidaturas", "minimo");

  await ir(page, "/agenda?data=2026-10-29");
  await expect(page.locator("section[aria-label='Quinta, 29 de outubro']")).toContainText("Entrevista com RH: ACME");

  // Mover para Entrevista pelo diálogo
  await ir(page, "/candidaturas?data=2026-10-26");
  await page.locator("article", { hasText: "ACME" }).getByRole("button").click();
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Entrevista" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator('section[aria-label^="Entrevista,"]')).toContainText("ACME");
});

test("Tarefa recorrente: aparece nos dias da regra, conclui uma vez e não acumula", async ({ page }) => {
  await ir(page, "/hoje?data=2026-10-24"); // sábado
  await page.getByRole("button", { name: "Tarefa", exact: true }).click();
  await page.fill("#t-titulo", "Organizar a semana");
  await page.getByRole("radio", { name: "Semanal" }).click();
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Tarefa recorrente criada.")).toBeVisible();
  await expect(tarefa(page, "Organizar a semana")).toBeVisible();

  await page.getByRole("button", { name: "Concluir Organizar a semana" }).click();
  await expect(tarefa(page, "Organizar a semana")).toHaveAttribute("data-status", "feita");
  await page.reload();
  await expect(tarefa(page, "Organizar a semana")).toHaveAttribute("data-status", "feita");

  await ir(page, "/hoje?data=2026-10-25"); // domingo: não vale e não acumula
  await expect(tarefa(page, "Organizar a semana")).toHaveCount(0);
  await ir(page, "/hoje?data=2026-10-31"); // sábado seguinte: nova instância pendente
  await expect(tarefa(page, "Organizar a semana")).toHaveAttribute("data-status", "pendente");

  page.once("dialog", (d) => d.accept()); // confirmação de "Parar de repetir"
  await page.getByRole("button", { name: "Mais opções para a tarefa Organizar a semana" }).click();
  await page.getByRole("menuitem", { name: "Parar de repetir" }).click();
  await expect(page.getByText("Repetição encerrada.")).toBeVisible();
  await expect(tarefa(page, "Organizar a semana")).toHaveCount(0);
});

test("Planejar a semana: mostra a semana seguinte, cria tarefa num dia e define o foco", async ({ page }) => {
  await ir(page, "/semana?data=2026-10-24"); // sábado → semana de 26/10
  await expect(page.getByText(/Segunda, 26 de outubro a domingo, 1 de novembro/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "O que vem aí" })).toBeVisible();

  await page.getByRole("radiogroup", { name: "Dia da tarefa" }).getByRole("radio", { name: "qua" }).click();
  await page.getByRole("textbox", { name: "Nova tarefa da semana" }).fill("Estudar para a P1");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Tarefa para qua, 28/10.")).toBeVisible();

  await page.getByRole("button", { name: /Estudo Tech/ }).click();
  await expect(page.getByText("Foco da semana: Estudo Tech.")).toBeVisible();

  await ir(page, "/hoje?data=2026-10-28");
  await expect(tarefa(page, "Estudar para a P1")).toBeVisible();
  await expect(cartao(page, "Estudo Tech")).toContainText("Foco da semana");
  await ir(page, "/hoje?data=2026-11-03"); // outra semana: sem destaque
  await expect(cartao(page, "Estudo Tech")).not.toContainText("Foco da semana");
});
