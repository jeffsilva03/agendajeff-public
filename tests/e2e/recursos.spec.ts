import { expect, test } from "@playwright/test";
import { abrirTudo, cartao, ir, statusDe } from "./util";

test.describe("Recursos do Hoje", () => {
  test("desfazer pelo aviso, nota no registro e cadeia completa", async ({ page }) => {
    await ir(page, "/hoje?data=2026-10-16");
    await abrirTudo(page);
    await page.getByRole("button", { name: "Marcar Enviar candidaturas como feito" }).click();
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await statusDe(page, "Enviar candidaturas", "pendente");

    await page.getByRole("button", { name: "Marcar Enviar candidaturas como feito" }).click();
    await page.getByRole("button", { name: "Marcar Praticar um projeto como mínimo" }).click();
    await expect(page.getByText("Tarde completa")).toBeVisible();
    await abrirTudo(page); // "Registrados hoje" acabou de aparecer, recolhido

    await page.getByRole("button", { name: "Mais opções para Enviar candidaturas" }).click();
    await page.getByRole("menuitem", { name: "Anotar" }).click();
    await page.getByRole("textbox", { name: "Nota" }).fill("Mandei para duas vagas de estágio.");
    await page.getByRole("button", { name: "Salvar nota" }).click();
    await expect(page.getByText("Nota salva.")).toBeVisible();
    await page.reload();
    await abrirTudo(page);
    await expect(cartao(page, "Enviar candidaturas")).toContainText("Mandei para duas vagas de estágio.");

    await ir(page, "/habitos?data=2026-10-16");
    await page.getByRole("button", { name: /Enviar candidaturas/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Mandei para duas vagas de estágio.");
  });

  test("sequência aparece no cartão e o 7º dia é comemorado", async ({ page }) => {
    // 6 dias seguidos de Leitura (13 a 18/10); no 7º (19/10) a marcação comemora.
    for (const d of ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]) {
      await ir(page, `/hoje?data=${d}`);
      await abrirTudo(page);
      await page.getByRole("button", { name: "Marcar Leitura como feito" }).click();
      await statusDe(page, "Leitura", "completo");
    }
    await ir(page, "/hoje?data=2026-10-19");
    await abrirTudo(page);
    await expect(cartao(page, "Leitura")).toContainText("6");
    await page.getByRole("button", { name: "Marcar Leitura como feito" }).click();
    await expect(page.getByText("7 dias seguidos de Leitura")).toBeVisible();
  });

  test("foco: inicia pelo cartão, aparece flutuando e pode ser descartado", async ({ page }) => {
    await ir(page, "/hoje?data=2026-10-20");
    await abrirTudo(page);
    await page.getByRole("button", { name: "Mais opções para Estudo Tech" }).click();
    await page.getByRole("menuitem", { name: "Iniciar foco" }).click();
    await expect(page.getByText("Foco de 25 min em Estudo Tech")).toBeVisible();
    const pilula = page.getByRole("status").filter({ hasText: "Foco: Estudo Tech" });
    await expect(pilula).toContainText(/2[45]:\d\d/);
    await ir(page, "/agenda");
    await expect(pilula).toBeVisible(); // continua em outra tela
    await pilula.getByRole("button", { name: "Descartar cronômetro" }).click();
    await expect(pilula).toHaveCount(0);
  });
});
