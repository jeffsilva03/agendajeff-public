import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("Insights (marco 7): sem registros, todos bloqueados com a contagem certa", async ({ page }) => {
  await ir(page, "/insights?data=2026-10-12");
  const esperado: [string, number][] = [
    ["Adesão por hábito", 7], ["Onde a cadeia quebra", 10], ["Adesão por período do dia", 14],
    ["Adesão por dia da semana", 21], ["Hábitos que andam juntos", 21],
  ];
  for (const [titulo, n] of esperado)
    await expect(page.locator(`section[aria-label="${titulo}"]`)).toContainText(`Faltam ${n} dias de registro`);
  await expect(page.locator("#revisao")).toContainText("Ainda não há dias registrados nesta semana.");
});
