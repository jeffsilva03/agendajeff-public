import { expect, test } from "@playwright/test";
import { abrirTudo, cartao, gruposDoDia, ir, statusDe } from "./util";

test.describe("Hoje (marco 2)", () => {
  test("terça 13/10: Manhã em foco, Tarde e flexíveis recolhidos, reunião e aviso de colisão", async ({ page }) => {
    await ir(page, "/hoje?data=2026-10-13");
    await expect(page.getByRole("heading", { name: "Terça, 13 de outubro" })).toBeVisible();
    expect(await gruposDoDia(page)).toEqual(["Manhã", "Tarde", "Flexíveis"]);
    await expect(page.getByRole("region", { name: "Agora: Manhã" })).toContainText("Começar o dia");
    // Recolhido, o bloco já mostra o que falta e o alerta de colisão
    const tarde = page.getByRole("region", { name: "Tarde", exact: true });
    await expect(tarde.getByRole("button", { expanded: false })).toContainText("Enviar candidaturas");
    await expect(tarde.getByLabel("Colide com Reunião de exemplo às 13h")).toBeVisible();
    await abrirTudo(page);
    for (const h of ["Praticar inglês", "Leitura", "Alongamento"]) await expect(cartao(page, h)).toBeVisible();
    await expect(page.getByText("Reunião de exemplo", { exact: true })).toBeVisible();
    await expect(page.getByText("sem horário de término")).toBeVisible();
    await expect(tarde).toContainText("Colide com Reunião de exemplo às 13h");
  });

  test("marca feito, mínimo e não se aplica; persiste e aparece em outro aparelho", async ({ page, browser }) => {
    await ir(page, "/hoje?data=2026-10-13");
    await abrirTudo(page);
    await page.getByRole("button", { name: "Marcar Começar o dia como feito" }).click();
    // O próximo passo da cadeia assume o cartão do "agora"
    await expect(page.getByRole("region", { name: "Agora: Manhã" }).locator("[data-item]").first()).toContainText("Pausa consciente");
    await page.getByRole("button", { name: "Marcar Pausa consciente como mínimo" }).click();
    await page.getByRole("button", { name: "Mais opções para Alongamento" }).click();
    await page.getByRole("menuitem", { name: "Não se aplica hoje" }).click();
    await statusDe(page, "Começar o dia", "completo");
    await statusDe(page, "Pausa consciente", "minimo");
    await statusDe(page, "Alongamento", "nao_se_aplica");
    await expect(page.getByRole("region", { name: "Registrados hoje" })).toContainText("1 feito, 1 mínimo, 1 pulado");

    // "Outro aparelho": novo contexto com a mesma sessão
    const outro = await browser.newContext({ storageState: "tests/e2e/.sessao.json" });
    const p2 = await outro.newPage();
    await ir(p2, "/hoje?data=2026-10-13");
    await statusDe(p2, "Começar o dia", "completo");
    await statusDe(p2, "Pausa consciente", "minimo");

    // Tempo real: o outro aparelho desfaz e este atualiza sem recarregar
    await abrirTudo(p2);
    await p2.getByRole("button", { name: "Desfazer Começar o dia" }).click();
    await statusDe(page, "Começar o dia", "pendente", { timeout: 10_000 });
    await outro.close();

    await page.reload();
    await statusDe(page, "Pausa consciente", "minimo");
  });
});
