import { expect, test } from "@playwright/test";
import { admin, E2E } from "./ambiente";
import { ir } from "./util";

// Dados fictícios: uma disciplina própria com aula às quintas, criada e apagada aqui.
const NOME = "Disciplina Faltas E2E";
let usuario: string;

test.beforeAll(async () => {
  const sb = admin();
  const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
  usuario = lista!.users.find((u) => u.email === E2E.email)!.id;
  await sb.from("disciplinas").delete().eq("user_id", usuario).eq("nome", NOME);
  await sb.from("events").delete().eq("user_id", usuario).in("data", ["2026-10-22", "2026-10-29"]).eq("tipo", "excecao_rotina");
  const { data: sem } = await sb.from("semestres").select("id").eq("user_id", usuario).lte("inicio", "2026-10-22").gte("fim", "2026-10-22").limit(1).single();
  const { data: disc, error } = await sb.from("disciplinas").insert({ user_id: usuario, semestre_id: sem!.id, nome: NOME, cor: "azul" }).select("id").single();
  if (error) throw error;
  await sb.from("aulas").insert({ user_id: usuario, disciplina_id: disc!.id, dia_semana: 4, inicio: "19:00", fim: "22:00" });
});

test.afterAll(async () => {
  const sb = admin();
  await sb.from("disciplinas").delete().eq("user_id", usuario).eq("nome", NOME);
  await sb.from("events").delete().eq("user_id", usuario).in("data", ["2026-10-22", "2026-10-29"]).eq("tipo", "excecao_rotina");
});

test("Faltas e dias sem aula: faltei pelo Hoje, contagem na Faculdade, dia sem aula com motivo e desfazer", async ({ page }) => {
  // Quinta 22/10: falta pelo atalho do Hoje, com "não fui" (padrão).
  await ir(page, "/hoje?data=2026-10-22");
  await page.getByRole("button", { name: "Aula", exact: true }).click();
  await page.getByRole("menuitem", { name: /Faltei/ }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("checkbox", { name: NOME })).toBeChecked();
  await dialogo.getByLabel("Motivo (opcional)").fill("Consulta médica");
  await dialogo.getByRole("button", { name: "Registrar falta" }).click();
  await expect(page.getByText("Falta registrada.")).toBeVisible();
  await expect(page.getByText("Falta registrada", { exact: true })).toBeVisible();
  await expect(page.getByText("Faltei: Consulta médica")).toBeVisible(); // o dia virou sem aula
  await expect(page.getByRole("button", { name: "Voltar a ter aula" })).toBeVisible();

  // Faculdade: a falta na lista e na disciplina.
  await ir(page, "/faculdade?data=2026-10-22");
  const secao = page.locator("section[aria-labelledby=t-ausencias]");
  await expect(secao).toContainText(`${NOME} · Consulta médica`);
  await expect(page.locator("section[aria-labelledby=t-disc]").getByRole("button", { name: new RegExp(NOME) })).toContainText("1 falta");

  // Dia sem aula com motivo (sugestão), na quinta seguinte.
  await page.getByRole("button", { name: "Dia sem aula" }).first().click();
  await page.fill("#sa-data", "2026-10-29");
  await page.getByRole("button", { name: "Professor faltou" }).click();
  await page.getByRole("button", { name: "Marcar sem aula" }).click();
  await expect(page.getByText("29/10 marcado como sem aula.")).toBeVisible();
  await expect(secao).toContainText("Professor faltou");

  await ir(page, "/hoje?data=2026-10-22&dia=2026-10-29");
  await expect(page.getByText("Professor faltou", { exact: true })).toBeVisible();

  // Desfazer o dia sem aula e apagar a falta (que leva junto o "Faltei" do dia).
  await ir(page, "/faculdade?data=2026-10-22");
  await secao.getByRole("button", { name: "Desfazer sem aula de 29/10" }).click();
  await expect(page.getByText("29/10 voltou a ter aula.")).toBeVisible();
  await secao.getByRole("button", { name: "Apagar falta de 22/10" }).click();
  await expect(page.getByText("Falta apagada.")).toBeVisible();
  await expect(secao).toContainText("Nenhuma falta registrada.");
  const { count } = await admin().from("events").select("id", { count: "exact", head: true }).eq("user_id", usuario).eq("data", "2026-10-22").eq("tipo", "excecao_rotina");
  expect(count).toBe(0);
});
