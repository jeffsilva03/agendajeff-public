import { expect, test } from "@playwright/test";
import { ir } from "./util";

test("Paleta (Ctrl+K): marca hábito de hoje e abre formulário de novo evento", async ({ page }) => {
  await ir(page, "/hoje");
  await page.keyboard.press("Control+k");
  const paleta = page.getByRole("dialog");
  await expect(paleta.getByPlaceholder("O que você quer fazer?")).toBeVisible();
  // Usa o primeiro hábito pendente do dia real (a paleta trabalha com a data de hoje).
  await page.keyboard.type("feito");
  const opcao = paleta.getByRole("option").filter({ hasText: "feito" }).first();
  await expect(opcao).toBeVisible();
  const nome = (await opcao.innerText()).split("\n")[0].replace(/\s*feito[\s\S]*$/, "").trim();
  await page.keyboard.press("Enter");
  await expect(page.getByText(`${nome}: feito.`)).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.keyboard.type("novo evento");
  await expect(paleta.getByRole("option").first()).toContainText("Novo evento na agenda");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/agenda\?novo=1/);
  await expect(page.getByRole("dialog", { name: "Novo evento" })).toBeVisible();
});

test("Ajustes: link do calendário responde .ics e o backup baixa JSON", async ({ page, request }) => {
  await ir(page, "/ajustes");
  const link = await page.getByRole("textbox", { name: "Link do calendário" }).inputValue();
  expect(link).toMatch(/\/calendario\/[0-9a-f-]{36}\.ics$/);
  const resp = await request.get(link);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toContain("text/calendar");
  expect(await resp.text()).toContain("Reunião de exemplo");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar backup (JSON)" }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/^cadeia-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const conteudo = JSON.parse(await (await arquivo.createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8")));
  expect(conteudo.habits.length).toBeGreaterThanOrEqual(10);
  expect(conteudo.chains.length).toBe(6);
});
