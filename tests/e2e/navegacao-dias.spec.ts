import { expect, test } from "@playwright/test";
import { abrirTudo, cartao, ir, statusDe, tarefa } from "./util";

// ?data= simula "hoje" em desenvolvimento; as setas navegam com ?dia= mantendo a simulação.
test("Hoje: setas, teclado e calendário trocam de dia; futuro só para ver; passado dá para corrigir", async ({ page }) => {
  await ir(page, "/hoje?data=2026-10-14");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Quarta, 14 de outubro");
  await expect(page.getByRole("link", { name: "Voltar para hoje" })).toHaveCount(0);

  // Próximo dia: dia futuro, hábitos só para ver.
  await page.getByRole("link", { name: "Próximo dia" }).click();
  await expect(page).toHaveURL(/data=2026-10-14.*dia=2026-10-15|dia=2026-10-15.*data=2026-10-14/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Quinta, 15 de outubro");
  await expect(page.getByText("Amanhã · hábitos só para ver")).toBeVisible();
  await expect(page.getByText("Dia futuro: dá para ver o que vem")).toBeVisible();
  await abrirTudo(page);
  await expect(page.getByRole("button", { name: /^Marcar .+ como feito$/ })).toHaveCount(0);

  // Tarefa no dia futuro continua possível (planejamento).
  await page.getByRole("textbox", { name: "Nova tarefa" }).fill("Levar o pendrive");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Tarefa adicionada/)).toBeVisible();
  await expect(tarefa(page, "Levar o pendrive")).toHaveAttribute("data-status", "pendente");
  // Apaga em seguida: aberta, ela "rolaria" como atrasada para os dias seguintes e mexeria em outros testes.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Mais opções para a tarefa Levar o pendrive" }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(tarefa(page, "Levar o pendrive")).toHaveCount(0);

  // Teclado: → avança, ← volta.
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Sexta, 16 de outubro");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Quinta, 15 de outubro");

  // Botão Hoje volta para o dia de hoje.
  await page.getByRole("link", { name: "Voltar para hoje" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Quarta, 14 de outubro");

  // Calendário: pula direto para um dia.
  await page.getByLabel("Escolher dia").fill("2026-10-20");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Terça, 20 de outubro");
  await expect(page.getByText("Daqui a 6 dias · hábitos só para ver")).toBeVisible();

  // Dia passado: dá para corrigir um registro.
  await ir(page, "/hoje?data=2026-10-14&dia=2026-10-13");
  await expect(page.getByText("Ontem · dá para corrigir os registros")).toBeVisible();
  await abrirTudo(page);
  await page.getByRole("button", { name: "Marcar Leitura como feito" }).click();
  await statusDe(page, "Leitura", "completo");
  await page.reload();
  await abrirTudo(page);
  await statusDe(page, "Leitura", "completo");
  await page.getByRole("button", { name: "Desfazer Leitura" }).click();
  await expect(cartao(page, "Leitura")).toHaveAttribute("data-status", "pendente");
});
