import { expect, test } from "@playwright/test";
import { ir, statusDe, tarefa } from "./util";
import { admin, E2E } from "./ambiente";

// Em produção (E2E_URL) o ?data= é ignorado: usa a data real de hoje em São Paulo.
const DATA = process.env.E2E_URL ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) : "2026-10-14";

// O modo de desenvolvimento carrega código sob demanda pela conexão de recarga ao vivo, então
// não reidrata sem rede. Este teste roda contra o build de produção: npm run test:e2e:prod
test.skip(!process.env.E2E_URL, "Só no build de produção (npm run test:e2e:prod)");

test("Offline: marca sem sinal, reabre sem rede e envia quando a conexão volta", async ({ page, context }) => {
  // 1ª visita com rede: instala o service worker; 2ª: a página passa a ser servida e guardada por ele.
  await ir(page, `/hoje?data=${DATA}`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText("Sem conexão")).toBeVisible();
  // Primeiro hábito pendente do dia (a data real muda o que vale: dia útil ou fim de semana).
  const botao = page.getByRole("button", { name: /^Marcar .+ como feito$/ }).first();
  const habito = (await botao.getAttribute("aria-label"))!.replace(/^Marcar /, "").replace(/ como feito$/, "");
  await botao.click();
  await expect(page.getByText("Sem sinal: guardado no aparelho")).toBeVisible();
  await expect(page.getByText("1 registro aguardando envio")).toBeVisible();
  await statusDe(page, habito, "completo");

  // Tarefa criada sem sinal também entra na fila.
  await page.getByRole("textbox", { name: "Nova tarefa" }).fill("Comprar bilhete no trem");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Sem sinal: tarefa guardada no aparelho")).toBeVisible();
  await expect(page.getByText("2 registros aguardando envio")).toBeVisible();
  await expect(tarefa(page, "Comprar bilhete no trem")).toHaveAttribute("data-status", "pendente");

  // Recarrega sem rede: a tela vem do cache e o registro continua lá (da fila local).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await statusDe(page, habito, "completo");
  await expect(tarefa(page, "Comprar bilhete no trem")).toHaveAttribute("data-status", "pendente");

  // Sinal volta: envia sozinho.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("2 registros enviados ao voltar o sinal.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("registro aguardando envio")).toHaveCount(0);

  const sb = admin();
  const { data: u } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const id = u.users.find((x) => x.email === E2E.email)!.id;
  const { data: linhas } = await sb.from("checks").select("status, habits!inner(nome)").eq("user_id", id).eq("data_local", DATA).eq("habits.nome", habito);
  expect(linhas?.[0]?.status).toBe("completo");
  const { data: t } = await sb.from("tarefas").select("titulo").eq("user_id", id).eq("titulo", "Comprar bilhete no trem");
  expect(t).toHaveLength(1);
});
