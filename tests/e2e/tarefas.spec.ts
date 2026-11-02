import { expect, test } from "@playwright/test";
import { ir, tarefa } from "./util";

test("Tarefas: adiciona no quadro, conclui, atrasada aparece no dia seguinte e passa para amanhã", async ({ page }) => {
  await ir(page, "/hoje?data=2026-10-21");
  await page.getByRole("textbox", { name: "Nova tarefa" }).fill("Recarregar o Bilhete Único");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Tarefa adicionada.")).toBeVisible();
  await expect(tarefa(page, "Recarregar o Bilhete Único")).toHaveAttribute("data-status", "pendente");
  await expect(page.getByText("0 de 1 tarefa")).toBeVisible();

  // Tarefa completa pelo diálogo: horário e importante
  await page.getByRole("button", { name: "Tarefa", exact: true }).click();
  await page.fill("#t-titulo", "Imprimir o trabalho");
  await page.fill("#t-hora", "15:00");
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(tarefa(page, "Imprimir o trabalho")).toContainText("importante");
  await expect(tarefa(page, "Imprimir o trabalho")).toContainText("15h");

  await page.getByRole("button", { name: "Concluir Imprimir o trabalho" }).click();
  await expect(tarefa(page, "Imprimir o trabalho")).toHaveAttribute("data-status", "feita");
  await page.reload();
  await expect(tarefa(page, "Imprimir o trabalho")).toHaveAttribute("data-status", "feita");

  // A não concluída "rola" para o dia seguinte, marcada como atrasada; a concluída não.
  await ir(page, "/hoje?data=2026-10-22");
  await expect(tarefa(page, "Recarregar o Bilhete Único")).toContainText("desde 21/10");
  await expect(tarefa(page, "Imprimir o trabalho")).toHaveCount(0);

  await page.getByRole("button", { name: "Mais opções para a tarefa Recarregar o Bilhete Único" }).click();
  await page.getByRole("menuitem", { name: "Passar para amanhã" }).click();
  await expect(tarefa(page, "Recarregar o Bilhete Único")).toHaveCount(0);
  await ir(page, "/hoje?data=2026-10-23");
  await expect(tarefa(page, "Recarregar o Bilhete Único")).toBeVisible();
  await expect(tarefa(page, "Recarregar o Bilhete Único")).not.toContainText("desde");
});
