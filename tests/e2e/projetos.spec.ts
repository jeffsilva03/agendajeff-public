import { expect, test } from "@playwright/test";
import { admin, E2E } from "./ambiente";
import { abrirTudo, ir, tarefa } from "./util";

// Dados fictícios. No fim, apaga os projetos e a tarefa criada no Hoje para não interferir nas outras suítes.
test.afterAll(async () => {
  const sb = admin();
  const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const usuario = lista!.users.find((u) => u.email === E2E.email)?.id;
  if (!usuario) return;
  await sb.from("projetos").delete().eq("user_id", usuario).like("nome", "%E2E%");
  await sb.from("tarefas").delete().eq("user_id", usuario).like("titulo", "App E2E de caronas:%");
});

test("Projetos: ideia rápida, cria projeto, edita, features com MVP, próximo passo no Hoje e busca", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await ir(page, "/projetos");
  await expect(page.getByText("Nenhum projeto ainda")).toBeVisible();

  // Ideia rápida: só o nome, entra como Ideia.
  await page.getByRole("textbox", { name: "Ideia rápida" }).fill("Bot de estudos E2E");
  await page.getByRole("button", { name: "Anotar" }).click();
  await expect(page.getByText("Ideia anotada.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bot de estudos E2E" })).toContainText("Ideia");

  // Projeto completo.
  await page.getByRole("button", { name: "Projeto", exact: true }).click();
  await page.fill("#p-nome", "App E2E de caronas");
  await page.fill("#p-resumo", "Caronas entre alunos da faculdade");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: /Planejando/ }).click();
  await page.getByRole("button", { name: "Criar e abrir" }).click();
  await page.waitForURL(/\/projetos\/[0-9a-f-]{36}$/);
  await expect(page.locator("#pj-nome")).toHaveValue("App E2E de caronas");

  await page.getByRole("textbox", { name: "Descrição" }).fill("Alunos oferecem e pedem carona por horário de aula.");
  await page.locator("#pj-problema").click();
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: /Em desenvolvimento/ }).click();
  await expect(page.getByText("Neste status desde hoje")).toBeVisible();

  // Features: duas essenciais (MVP) e uma extra.
  const nova = page.getByRole("textbox", { name: "Nova feature" });
  for (const [titulo, prioridade] of [["Login com e-mail", null], ["Mapa de caronas", null], ["Chat entre alunos", "Extra"]] as const) {
    await nova.fill(titulo);
    if (prioridade) {
      await page.getByRole("combobox", { name: "Prioridade da feature" }).click();
      await page.getByRole("option", { name: new RegExp(prioridade) }).click();
    }
    await page.getByRole("button", { name: "Adicionar feature" }).click();
    await expect(page.locator(`[data-feature="${titulo}"]`)).toBeVisible();
  }
  const login = page.locator('[data-feature="Login com e-mail"]');
  await login.getByRole("button", { name: /Marcar como fazendo/ }).click();
  await expect(login).toHaveAttribute("data-status", "fazendo");
  await login.getByRole("button", { name: /Marcar como feito/ }).click();
  await expect(page.getByText("1 de 3 feitas · MVP 1/2")).toBeVisible();
  // A feita sai da lista principal e vai para "Feitas".
  await expect(login).toBeHidden();
  await page.getByRole("button", { name: "Feitas (1)" }).click();
  await expect(login).toHaveAttribute("data-status", "feito");

  // Próximo passo vira tarefa do Hoje; tecnologias por vírgula.
  await page.getByRole("textbox", { name: "Próximo passo" }).fill("Desenhar a tela do mapa");
  await page.getByRole("textbox", { name: "Tecnologias" }).click();
  await page.getByRole("button", { name: "Colocar no Hoje" }).click();
  await expect(page.getByText("Tarefa criada no Hoje.")).toBeVisible();
  await page.getByRole("textbox", { name: "Tecnologias" }).fill("Next.js, Supabase, next.js");
  await page.getByRole("textbox", { name: "Anotações" }).click();
  await expect(page.getByRole("textbox", { name: "Tecnologias" })).toHaveValue("Next.js, Supabase");

  // Tudo persiste depois de recarregar.
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Descrição" })).toHaveValue("Alunos oferecem e pedem carona por horário de aula.");
  await expect(page.getByRole("textbox", { name: "Próximo passo" })).toHaveValue("Desenhar a tela do mapa");
  await expect(page.locator("[data-feature]")).toHaveCount(2);

  await ir(page, "/hoje");
  await abrirTudo(page);
  await expect(tarefa(page, "App E2E de caronas: Desenhar a tela do mapa")).toBeVisible();

  // Lista: filtro Ativos, progresso no cartão e busca por tecnologia.
  await ir(page, "/projetos");
  const cartao = page.getByRole("link", { name: "App E2E de caronas" });
  await expect(cartao).toContainText("Em desenvolvimento");
  await expect(cartao).toContainText("1/3 features");
  await expect(cartao).toContainText("MVP 1/2");
  await expect(cartao).toContainText("Desenhar a tela do mapa");
  await expect(page.getByRole("link", { name: "Bot de estudos E2E" })).toBeHidden(); // ideia não aparece em Ativos
  await page.getByRole("button", { name: /^Todos/ }).click();
  await page.getByPlaceholder("Buscar nome ou tecnologia").fill("supabase");
  await expect(cartao).toBeVisible();
  await expect(page.getByRole("link", { name: "Bot de estudos E2E" })).toBeHidden();

  // Excluir o projeto leva as features junto.
  await cartao.click();
  await page.getByRole("button", { name: "Excluir" }).last().click();
  await page.waitForURL(/\/projetos$/);
  await expect(page.getByText("Projeto excluído.")).toBeVisible();
  const sb = admin();
  const { count } = await sb.from("projeto_features").select("id", { count: "exact", head: true }).like("titulo", "%caronas%");
  expect(count).toBe(0);
});
