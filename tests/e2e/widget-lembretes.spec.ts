import { readFileSync } from "node:fs";
import { expect, request as novoRequest, test } from "@playwright/test";
import { admin, E2E } from "./ambiente";
import { ir } from "./util";

const CRON = readFileSync("supabase/.env", "utf8").match(/^CRON_SECRET=(.+)$/m)?.[1]?.trim() ?? "";
const FUNCOES = "http://127.0.0.1:54321/functions/v1";

test("Lembrete periódico: liga em Ajustes, frase própria, prévia e disparo pela função sem duplicar", async ({ page }) => {
  await ir(page, "/ajustes#lembrete-periodico");
  await page.getByRole("switch", { name: "Ligar lembretes periódicos" }).click();
  await expect(page.getByText("Lembretes periódicos ligados.")).toBeVisible();
  await expect(page.getByText(/Horários: 8h, 10h, 12h, 14h, 16h, 18h, 20h, 22h/)).toBeVisible();
  await page.getByRole("textbox", { name: "Nova frase" }).fill("Bora, sem desculpa hoje.");
  await page.getByRole("button", { name: "Frase", exact: true }).click();
  await expect(page.getByText("“Bora, sem desculpa hoje.”")).toBeVisible();

  await page.getByRole("button", { name: "Ver como ficaria agora" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();

  // Disparo pela Edge Function simulando 10h05 de uma terça (dia útil): o e2e tem hábitos pendentes.
  const sb = admin();
  const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const usuario = lista!.users.find((u) => u.email === E2E.email)!.id;
  const chamar = () => fetch(`${FUNCOES}/lembretes`, {
    method: "POST", headers: { "x-cron-secret": CRON, "Content-Type": "application/json" },
    body: JSON.stringify({ agora: "2026-10-20T13:05:00Z", usuario }),
  }).then((r) => r.json());
  const r1 = await chamar();
  const periodico = r1.relatorio.find((x: { periodico?: boolean }) => x.periodico);
  expect(periodico).toBeTruthy();
  expect(periodico.hora).toBe("10:00");
  const { data: log } = await sb.from("notification_log").select("tipo, slot_hora, status, corpo").eq("user_id", usuario).eq("tipo", "periodico");
  expect(log).toHaveLength(1);
  // Sem aparelho cadastrado o envio fica registrado como "sem_aparelho", com o texto montado.
  expect(log![0]).toMatchObject({ slot_hora: "10:00:00", status: "sem_aparelho" });
  // Só a frase: o andamento de tarefas e hábitos fica nos horários fixos.
  expect(log![0].corpo).toBeTruthy();
  expect(log![0].corpo).not.toMatch(/Próximo hábito|Tarefa|hábitos/);
  // Rodar de novo no mesmo horário não duplica.
  const r2 = await chamar();
  expect(r2.relatorio.filter((x: { periodico?: boolean }) => x.periodico)).toHaveLength(0);
});

test("Widget: gera token e script, o resumo responde com o token e para depois de revogar", async ({ page, baseURL }) => {
  await ir(page, "/ajustes#widget");
  // Com a sessão do app (como o service worker do Windows).
  const sessao = await page.request.get("/api/widget?formato=adaptive");
  expect(sessao.status()).toBe(200);
  const card = await sessao.json();
  expect(card).toHaveProperty("habitos");
  expect(Array.isArray(card.tarefas)).toBe(true);

  await page.getByRole("button", { name: "Gerar script" }).click();
  await expect(page.getByText("Script gerado.")).toBeVisible();
  const script = await page.getByRole("textbox", { name: "Script do widget" }).inputValue();
  const token = script.match(/const TOKEN = "(wjt_[A-Za-z0-9_-]+)"/)![1];
  expect(token.length).toBeGreaterThan(40);
  // O script é JavaScript válido para o Scriptable (aceita await no nível de cima).
  const FuncaoAssincrona = Object.getPrototypeOf(async () => {}).constructor;
  expect(() => new FuncaoAssincrona(script)).not.toThrow();
  expect(script).toContain(`${baseURL}/api/widget`);

  // Fora do navegador, só com o token (como o Scriptable no iPhone).
  const externo = await novoRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const ok = await externo.get("/api/widget", { headers: { Authorization: `Bearer ${token}` } });
  expect(ok.status()).toBe(200);
  const resumo = await ok.json();
  expect(resumo).toMatchObject({ habitos: expect.objectContaining({ total: expect.any(Number) }) });
  expect(typeof resumo.frase).toBe("string");
  expect((await externo.get("/api/widget")).status()).toBe(401);
  expect((await externo.get("/api/widget", { headers: { Authorization: "Bearer wjt_tokenquenaoexisteeeeeeeeeeeeeeeeeeeeeeeeeeeee" } })).status()).toBe(401);
  // O banco guarda só o hash.
  const { data: perfil } = await admin().from("profiles").select("widget_token_hash").not("widget_token_hash", "is", null);
  expect(JSON.stringify(perfil)).not.toContain(token);

  await page.getByRole("button", { name: "Ver o que o widget mostra agora" }).click();
  await expect(page.getByRole("status", { name: "Prévia do widget" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revogar token" }).click();
  await expect(page.getByText("Token revogado.")).toBeVisible();
  expect((await externo.get("/api/widget", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
});
