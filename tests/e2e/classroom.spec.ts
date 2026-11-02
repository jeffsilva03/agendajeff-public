// Integração Classroom de ponta a ponta contra o simulador local (Auth0 + APIClassroom, dados fictícios).
import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, E2E, env } from "./ambiente";
import { iniciarSimulador } from "./classroom-simulador";
import { abrirTudo, ir } from "./util";

test.describe.configure({ mode: "serial" });

let sim: Awaited<ReturnType<typeof iniciarSimulador>>;
let usuario: string;

async function limpar() {
  const sb = admin();
  for (const t of ["classroom_atividades", "classroom_turmas", "classroom_sincronizacoes", "classroom_tokens", "classroom_conexoes"]) await sb.from(t).delete().eq("user_id", usuario);
}

test.beforeAll(async () => {
  sim = await iniciarSimulador();
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  usuario = data!.users.find((u) => u.email === E2E.email)!.id;
  await limpar();
});
test.afterAll(async () => {
  await limpar();
  await sim.fechar();
});

const sincronizar = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  return page.locator("[data-sonner-toast]").filter({ hasText: /Sincronização|sincronização|Turmas atualizadas|expirou/ }).last();
};

test("conecta pelo OAuth, escolhe turmas, sincroniza sem duplicar e mostra o quadro", async ({ page }) => {
  await ir(page, "/faculdade?aba=classroom");
  await expect(page.getByRole("heading", { name: "Conecte o Google Classroom" })).toBeVisible();
  await page.getByRole("link", { name: "Conectar ao Classroom" }).click();
  await page.waitForURL(/\/faculdade\?aba=classroom$/);
  await expect(page.getByText(/Classroom conectado/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Escolha as turmas que quer acompanhar" })).toBeVisible();

  // Os tokens ficam cifrados (nada de JWT em texto) e o navegador não consegue lê-los.
  const { data: tok } = await admin().from("classroom_tokens").select("access_token, refresh_token").eq("user_id", usuario).single();
  expect(tok!.access_token.split(".")).toHaveLength(4); // v1.iv.tag.cifrado (um JWT tem 3 partes)
  expect(tok!.access_token).toMatch(/^v1\./);
  expect(tok!.access_token).not.toContain("eyJhbGciOiJSUzI1Ni"); // cabeçalho do JWT em texto
  expect(tok!.refresh_token).not.toContain("refresh-teste");

  // Só as turmas do semestre: a antiga (ainda ACTIVE no Classroom) fica de fora.
  await page.getByRole("button", { name: "Escolher turmas" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Turma antiga 2024 (teste)");
  await dialogo.getByRole("switch", { name: "Acompanhar Computação em Nuvem de exemplo (teste)" }).click();
  await dialogo.getByRole("switch", { name: "Acompanhar Turma compartilhada de exemplo (teste)" }).click();
  await expect(dialogo).toContainText("Também chamada de Automação, Extensão, Projeto Integrador");
  await dialogo.getByLabel("Nome de exibição para Turma compartilhada de exemplo (teste)").fill("Projeto Integrador");
  await dialogo.getByLabel("Nome de exibição para Turma compartilhada de exemplo (teste)").blur();
  await page.keyboard.press("Escape");

  await expect(await sincronizar(page)).toContainText("Sincronização concluída: 7 novas, 0 atualizadas");
  // Todas as páginas (2 por página no simulador) e a turma compartilhada uma vez só.
  const { data: linhas } = await admin().from("classroom_atividades").select("activity_id, course_id, prazo_precisao, prazo_data, prazo_em").eq("user_id", usuario);
  expect(linhas!.map((l) => l.activity_id).sort()).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "b1"]);
  expect(linhas!.find((l) => l.activity_id === "a4")).toMatchObject({ prazo_precisao: "somente_data_utc", prazo_em: null });
  expect(linhas!.find((l) => l.activity_id === "a3")).toMatchObject({ prazo_precisao: "sem_prazo", prazo_em: null, prazo_data: null });

  const resumo = page.getByRole("region", { name: "Resumo" });
  for (const [k, v] of [["Pendentes", "3"], ["Atrasadas", "1"], ["Devolvidas", "1"], ["Entregues", "1"], ["Próximos 7 dias", "3"]]) await expect(resumo.getByRole("button", { name: new RegExp(`^${k}`) })).toContainText(v);

  // Entregas da semana: atrasada primeiro, depois as dos próximos 7 dias; entregue, devolvida e sem prazo ficam de fora.
  const semana = page.getByRole("region", { name: /^Entregas da semana/ });
  await expect(semana.locator("[data-entrega]")).toHaveCount(4);
  await expect(semana.locator("[data-entrega]").first()).toHaveAttribute("data-entrega", "a6");
  await expect(semana.locator('[data-entrega="a6"]')).toHaveAttribute("data-urgencia", "atrasada");
  // O simulador conta os dias em UTC e o app em São Paulo: perto da meia-noite UTC, "2 dias atrás" pode ser "ontem".
  await expect(semana.locator('[data-entrega="a6"]')).toContainText(/Venceu (ontem|há \d+ dias)/);
  await expect(semana.locator('[data-entrega="a1"]')).toContainText(/(Em \d dias|Amanhã) às 19h/);
  await expect(semana.locator('[data-entrega="a4"]')).not.toContainText(" às "); // só data: sem horário inventado
  await expect(semana.locator('[data-entrega="b1"]')).toContainText("Projeto Integrador · Classroom");
  for (const fora of ["a2", "a3", "a5"]) await expect(semana.locator(`[data-entrega="${fora}"]`)).toHaveCount(0);
  await expect(semana).toContainText("1 precisa de atenção agora");

  // Repetir a sincronização não cria nada.
  await expect(await sincronizar(page)).toContainText("Sincronização concluída: 0 novas, 0 atualizadas");
  const { count } = await admin().from("classroom_atividades").select("id", { count: "exact", head: true }).eq("user_id", usuario);
  expect(count).toBe(7);

  // Quadro: "Para entregar" mostra pendentes e atrasadas; sem prazo e só data têm o texto certo; entregue não aparece.
  const quadro = page.locator("main");
  await expect(quadro.getByRole("button", { name: /^Lista de exercícios RDS, Pendente/ })).toBeVisible();
  await expect(quadro.getByRole("button", { name: /^Atividade atrasada, Atrasada/ })).toBeVisible();
  await expect(quadro.getByRole("button", { name: /^Projeto com data sem horário/ })).toContainText("(sem horário)");
  await expect(quadro.getByRole("button", { name: /^Relatório entregue/ })).toBeHidden();
  await page.getByRole("button", { name: /^Todas \d/ }).click();
  await expect(quadro.getByRole("button", { name: /^Leitura sem prazo, Status não confirmado/ })).toContainText("Sem prazo informado");
  await expect(quadro.getByRole("button", { name: /^Atividade devolvida, Devolvida/ })).toContainText("Nota 0/10");
  await expect(quadro.getByRole("button", { name: /^Entrega do Projeto Integrador/ })).toContainText("Projeto Integrador");
});

test("detalhe sob demanda, campos pessoais preservados e mudanças no Classroom refletidas", async ({ page }) => {
  await ir(page, "/faculdade?aba=classroom");
  await page.getByRole("button", { name: /^Projeto com data sem horário/ }).click();
  const d = page.getByRole("dialog");
  await expect(d).toContainText("Descrição completa de Projeto com data sem horário"); // veio do endpoint de detalhe
  await expect(d.getByRole("link", { name: "enunciado.pdf" })).toBeVisible();
  await d.getByLabel("Anotações").fill("Começar pelo diagrama");
  await d.getByLabel("Anotações").blur();
  await expect.poll(async () => (await admin().from("classroom_atividades").select("notas_pessoais").eq("user_id", usuario).eq("activity_id", "a4").single()).data?.notas_pessoais).toBe("Começar pelo diagrama");
  await page.keyboard.press("Escape");

  // No Classroom: a1 foi entregue e o prazo de a4 mudou.
  sim.mudar((e) => {
    e.entregas["900000000001"].find((x) => x.atividade_id === "a1")!.estado = "TURNED_IN";
    const a4 = e.atividades["900000000001"].find((x) => x.id === "a4")!;
    a4.prazo = { ...(a4.prazo as object), data_utc: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10) };
  });
  await expect(await sincronizar(page)).toContainText("Sincronização concluída: 0 novas, 2 atualizadas, 1 entrega confirmada, 1 prazo alterado");
  const { data: a4 } = await admin().from("classroom_atividades").select("notas_pessoais, mudancas, prazo_anterior").eq("user_id", usuario).eq("activity_id", "a4").single();
  expect(a4).toMatchObject({ notas_pessoais: "Começar pelo diagrama", mudancas: ["prazo"] }); // a sincronização não apagou o pessoal
  expect(a4!.prazo_anterior).toBeTruthy();
  await expect(page.getByRole("button", { name: /^Projeto com data sem horário/ })).toContainText("Prazo alterado");
  await expect(page.getByRole("button", { name: /^Lista de exercícios RDS/ })).toBeHidden(); // agora entregue
});

test("prazos na agenda e no Hoje, uma vez só; entregues e sem prazo ficam de fora; API e MCP veem", async ({ page, request }) => {
  await ir(page, "/hoje");
  await abrirTudo(page);
  // A seção existe no layout do PC e no do celular (um deles oculto): conta só o que está visível.
  const prazos = page.getByRole("region", { name: "Agenda e prazos" }).filter({ visible: true });
  await expect(prazos.locator("li", { hasText: /Classroom: Entrega do Projeto Integrador \(Projeto Integrador\)/ })).toHaveCount(1);
  await expect(prazos.locator("li", { hasText: /Classroom: Projeto com data sem horário/ })).toHaveCount(1);
  await expect(prazos.locator("li", { hasText: /Lista de exercícios RDS/ })).toHaveCount(0); // entregue
  await expect(prazos.locator("li", { hasText: /Leitura sem prazo/ })).toHaveCount(0);      // sem prazo não vira vencimento

  // API de integração: prazos pendentes do Classroom, sem os entregues.
  const r = await (await request.get("/api/integrations/agenda/v1/college?assessments=pending")).json();
  const titulos = r.data.classroomAssignments.map((c: { title: string }) => c.title).sort();
  expect(titulos).toEqual(["Atividade atrasada", "Entrega do Projeto Integrador", "Leitura sem prazo", "Projeto com data sem horário"]);
  expect(r.data.classroomAssignments.find((c: { title: string }) => c.title === "Projeto com data sem horário")).toMatchObject({ time: null, deadlinePrecision: "somente_data_utc" });
  const semana = await (await request.get(`/api/integrations/agenda/v1/agenda?start=${r.data.today}&end=${new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10)}`)).json();
  const doClassroom = JSON.stringify(semana).match(/"source":"google_classroom"/g) ?? [];
  expect(doClassroom.length).toBeGreaterThan(0);
  expect(JSON.stringify(semana)).not.toContain("Lista de exercícios RDS");
});

test("decisões locais: concluir, dispensar, desfazer, reabrir; nada vai ao Classroom; sincronização e mudanças oficiais preservam a decisão", async ({ page, browser, request }) => {
  const chamadasAntes = sim.estado().chamadas.length;
  const atividade = (id: string) => page.locator(`[data-atividade="${id}"]`);
  const toast = page.locator("[data-sonner-toast]");
  const linha = async (id: string) => (await admin().from("classroom_atividades").select("resolucao_local, resolvida_em, revisar_desde, entrega_estado, notas_pessoais").eq("user_id", usuario).eq("activity_id", id).single()).data!;
  await ir(page, "/faculdade?aba=classroom");

  // 1) Concluir no AgendaJeff (b1 pendente): sai de "Para entregar"; "Desfazer" volta; concluir de novo.
  await page.getByRole("button", { name: "Ações de Entrega do Projeto Integrador", exact: true }).click();
  await page.getByRole("menuitem", { name: "Concluir no AgendaJeff" }).click();
  await expect(toast.filter({ hasText: "concluída no AgendaJeff" })).toContainText("nada foi alterado no Classroom");
  await expect(atividade("b1")).toBeHidden();
  await toast.filter({ hasText: "concluída no AgendaJeff" }).getByRole("button", { name: "Desfazer" }).click();
  await expect(atividade("b1")).toHaveAttribute("data-situacao", "pendente");
  await expect.poll(async () => (await linha("b1")).resolucao_local).toBeNull();
  await page.getByRole("button", { name: "Ações de Entrega do Projeto Integrador", exact: true }).click();
  await page.getByRole("menuitem", { name: "Concluir no AgendaJeff" }).click();
  await expect(atividade("b1")).toBeHidden();
  await expect(page.locator('[data-entrega="b1"]')).toHaveCount(0); // sai também das entregas da semana

  // 2) Dispensar: a6 (atrasada) pelo menu e a3 (estado desconhecido, sem prazo) pelo detalhe.
  await page.getByRole("button", { name: "Ações de Atividade atrasada", exact: true }).click();
  await page.getByRole("menuitem", { name: "Não preciso entregar" }).click();
  await expect(toast.filter({ hasText: "dispensada" }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Não confirmadas/ }).click();
  await page.getByRole("button", { name: /^Leitura sem prazo/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Não preciso entregar" }).click();
  await expect(page.getByRole("dialog")).toContainText("Você dispensou esta atividade");
  await page.keyboard.press("Escape");
  await expect.poll(async () => [(await linha("b1")).resolucao_local, (await linha("a6")).resolucao_local, (await linha("a3")).resolucao_local]).toEqual(["concluida", "dispensada", "dispensada"]);

  // Selos distintos por filtro; entregue oficial continua "Entregue no Classroom".
  await page.getByRole("button", { name: /^Concluídas aqui/ }).click();
  await expect(atividade("b1")).toHaveAttribute("data-situacao", "concluida_local");
  await expect(atividade("b1")).toContainText("Concluída no AgendaJeff");
  await page.getByRole("button", { name: /^Dispensadas/ }).click();
  await expect(atividade("a6")).toContainText("Dispensada");
  await expect(atividade("a3")).toContainText("Dispensada");
  await page.getByRole("button", { name: /^Entregues no Classroom/ }).click();
  await expect(atividade("a1")).toContainText("Entregue no Classroom");
  await expect(atividade("a2")).toHaveAttribute("data-situacao", "entregue");
  const resumo = page.getByRole("region", { name: "Resumo" });
  await expect(resumo.getByRole("button", { name: /^Pendentes/ })).toContainText("1");
  await expect(resumo.getByRole("button", { name: /^Atrasadas/ })).toContainText("0");

  // 3) Fora da agenda (Hoje) e das pendências da API; continuam no histórico ("all").
  await ir(page, "/hoje");
  await abrirTudo(page);
  const prazos = page.getByRole("region", { name: "Agenda e prazos" }).filter({ visible: true });
  await expect(prazos.locator("li", { hasText: /Entrega do Projeto Integrador/ })).toHaveCount(0);
  await expect(prazos.locator("li", { hasText: /Atividade atrasada/ })).toHaveCount(0);
  await expect(prazos.locator("li", { hasText: /Projeto com data sem horário/ })).toHaveCount(1);
  const pend = (await (await request.get("/api/integrations/agenda/v1/college?assessments=pending")).json()).data.classroomAssignments;
  expect(pend.map((c: { title: string }) => c.title)).toEqual(["Projeto com data sem horário"]);
  const todas = (await (await request.get("/api/integrations/agenda/v1/college?assessments=all")).json()).data.classroomAssignments;
  expect(todas.find((c: { title: string }) => c.title === "Entrega do Projeto Integrador")).toMatchObject({ status: "resolved_locally", localResolution: "completed", officialSituation: "pendente" });
  expect(todas.find((c: { title: string }) => c.title === "Atividade atrasada")).toMatchObject({ status: "resolved_locally", localResolution: "dismissed", officialSituation: "atrasada" });
  expect(todas.find((c: { title: string }) => c.title === "Lista de exercícios RDS")).toMatchObject({ status: "delivered", situation: "entregue" });

  // 4) Nada foi enviado ao Classroom: só leituras (GET) na API do simulador desde o começo deste teste.
  const doClassroom = sim.estado().chamadas.slice(chamadasAntes).filter((c) => c.includes("/disciplinas"));
  expect(doClassroom.every((c) => c.startsWith("GET "))).toBe(true);

  // 5 e 8) Sincronizar preserva; o professor muda o prazo de b1 → decisão mantida, mas pede revisão.
  await ir(page, "/faculdade?aba=classroom");
  await expect(await sincronizar(page)).toContainText("Sincronização concluída: 0 novas, 0 atualizadas");
  expect((await linha("b1")).resolucao_local).toBe("concluida");
  sim.mudar((e) => {
    const b1 = e.atividades["900000000002"].find((x) => x.id === "b1")!;
    b1.prazo = { ...(b1.prazo as object), em_utc: new Date(Date.now() + 11 * 86_400_000).toISOString().replace(/\.\d+Z$/, "+00:00") };
  });
  await expect(await sincronizar(page)).toContainText("1 atualizada");
  const b1 = await linha("b1");
  expect(b1.resolucao_local).toBe("concluida");
  expect(b1.revisar_desde).not.toBeNull();
  await page.getByRole("button", { name: /1 atividade que você resolveu mudou no Classroom/ }).click();
  await expect(atividade("b1")).toContainText("Mudou no Classroom depois da sua decisão");
  // Mudança de estado oficial em atividade dispensada (a6 entregue no Classroom): vira "Entregue no Classroom", decisão guardada.
  sim.mudar((e) => { e.entregas["900000000001"].find((x) => x.atividade_id === "a6")!.estado = "TURNED_IN"; });
  await sincronizar(page);
  await expect.poll(async () => (await linha("a6")).entrega_estado).toBe("TURNED_IN");
  expect((await linha("a6")).resolucao_local).toBe("dispensada");

  // 9) Recarregar e outro "aparelho" (outro navegador com a mesma conta) veem o mesmo estado.
  const outro = await browser.newContext({ storageState: "tests/e2e/.sessao.json" });
  const outraPagina = await outro.newPage();
  await outraPagina.goto("/faculdade?aba=classroom");
  await outraPagina.getByRole("button", { name: /^Concluídas aqui/ }).click();
  await expect(outraPagina.locator('[data-atividade="b1"]')).toHaveAttribute("data-situacao", "concluida_local");
  await outraPagina.getByRole("button", { name: /^Entregues no Classroom/ }).click();
  await expect(outraPagina.locator('[data-atividade="a6"]')).toHaveAttribute("data-situacao", "entregue");
  await outro.close();

  // 6) Reabrir: tira só a decisão e volta ao estado oficial atual (b1 pendente, com o prazo novo).
  await page.reload();
  await page.getByRole("button", { name: /^Concluídas aqui/ }).click();
  await page.getByRole("button", { name: "Ações de Entrega do Projeto Integrador", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reabrir atividade" }).click();
  await expect(toast.filter({ hasText: "reaberta" })).toBeVisible();
  await page.getByRole("button", { name: /^Para entregar/ }).click();
  await expect(atividade("b1")).toHaveAttribute("data-situacao", "pendente");
  await expect(atividade("b1")).toContainText("em 11 dias");
  await expect.poll(async () => { const l = await linha("b1"); return [l.resolucao_local, l.resolvida_em, l.revisar_desde]; }).toEqual([null, null, null]);
  await ir(page, "/hoje");
  await abrirTudo(page);
  await expect(page.getByRole("region", { name: "Agenda e prazos" }).filter({ visible: true }).locator("li", { hasText: /Entrega do Projeto Integrador/ })).toHaveCount(1);
});

test("falhas preservam o snapshot: turma fora do ar, sincronização simultânea e autorização perdida", async ({ page }) => {
  await ir(page, "/faculdade?aba=classroom");
  // Uma turma com 503: resultado parcial, nada apagado.
  sim.mudar((e) => { e.falharTurma["900000000002"] = 503; });
  await expect(await sincronizar(page)).toContainText("Sincronização incompleta (1 de 2 turmas)");
  await expect(page.getByText("Última sincronização incompleta")).toBeVisible();
  const { count } = await admin().from("classroom_atividades").select("id", { count: "exact", head: true }).eq("user_id", usuario).is("ausente_desde", null);
  expect(count).toBe(7);
  sim.mudar((e) => { e.falharTurma = {}; });

  // Duas ao mesmo tempo: a segunda recebe "em andamento".
  sim.mudar((e) => { e.atrasoMs = 1500; });
  const [r1, r2] = await Promise.all([
    page.request.post("/api/classroom/sincronizar", { headers: { Origin: new URL(page.url()).origin } }),
    new Promise((ok) => setTimeout(ok, 300)).then(() => page.request.post("/api/classroom/sincronizar", { headers: { Origin: new URL(page.url()).origin } })),
  ]);
  const motivos = [(await r1.json()).resumo.motivo, (await r2.json()).resumo.motivo];
  expect(motivos).toContain("em_andamento");
  sim.mudar((e) => { e.atrasoMs = 0; });

  // Renovação concorrente com rotação: token expirado e três pedidos ao mesmo tempo (sincronização + dois detalhes).
  // Uma renovação só; reusar o refresh antigo revogaria tudo no Auth0.
  const { data: umaAtividade } = await admin().from("classroom_atividades").select("id").eq("user_id", usuario).eq("activity_id", "a4").single();
  const antes = sim.estado().renovacoes;
  await admin().from("classroom_tokens").update({ expira_em: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", usuario);
  const origem = { Origin: new URL(page.url()).origin };
  const respostas = await Promise.all([
    page.request.post("/api/classroom/sincronizar", { headers: origem }),
    page.request.get(`/api/classroom/atividade?id=${umaAtividade!.id}`),
    page.request.get(`/api/classroom/atividade?id=${umaAtividade!.id}`),
  ]);
  expect(respostas.map((r) => r.status())).toEqual([200, 200, 200]);
  expect((await respostas[0].json()).resumo.resultado).toBe("ok");
  expect(sim.estado().renovacoes - antes).toBe(1);
  expect(sim.estado().familiaRevogada).toBe(false);
  // O refresh guardado é o novo (rotação gravada), não o anterior.
  const { data: depois } = await admin().from("classroom_tokens").select("renovacao_iniciada_em, expira_em").eq("user_id", usuario).single();
  expect(depois!.renovacao_iniciada_em).toBeNull();
  expect(Date.parse(depois!.expira_em)).toBeGreaterThan(Date.now());

  // Token expirado e refresh negado: pede reconexão e mantém as atividades.
  await admin().from("classroom_tokens").update({ expira_em: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", usuario);
  sim.mudar((e) => { e.negarRefresh = true; });
  await ir(page, "/faculdade?aba=classroom");
  await expect(await sincronizar(page)).toContainText("expirou");
  await expect(page.getByRole("heading", { name: "Reconexão necessária" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Entrega do Projeto Integrador/ })).toBeVisible();
  sim.mudar((e) => { e.negarRefresh = false; });
  // Reconectar volta ao normal.
  await page.getByRole("link", { name: "Conectar de novo" }).click();
  await page.waitForURL(/\/faculdade\?aba=classroom$/);
  await expect(await sincronizar(page)).toContainText("Sincronização concluída");
});

test("segurança: rotas exigem sessão/segredo, tokens não são legíveis e dados oficiais não são editáveis pelo navegador", async ({ baseURL }) => {
  const anonimo = await novoRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await anonimo.post("/api/classroom/sincronizar", { headers: { Origin: baseURL! } })).status()).toBe(401);
  expect((await anonimo.get("/api/classroom/atividade?id=00000000-0000-0000-0000-000000000000")).status()).toBe(401);
  expect((await anonimo.post("/api/classroom/cron")).status()).toBe(401);
  expect((await anonimo.post("/api/classroom/cron", { headers: { "x-cron-secret": "errado" } })).status()).toBe(401);

  // Com a sessão do próprio usuário (chave publicável + RLS).
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: E2E.email, password: E2E.senha });
  const tokens = await sb.from("classroom_tokens").select("*");
  expect(tokens.data ?? []).toEqual([]);
  expect((await sb.from("classroom_atividades").update({ titulo: "alterado" }).eq("activity_id", "b1").select("id")).error).not.toBeNull();
  expect((await sb.from("classroom_atividades").insert({ course_id: "x", activity_id: "x", titulo: "x" })).error).not.toBeNull();
  expect((await sb.from("classroom_atividades").update({ notas_pessoais: "ok pelo navegador" }).eq("activity_id", "b1").select("id")).data).toHaveLength(1);
  expect((await sb.from("classroom_conexoes").update({ estado: "conectado" }).not("user_id", "is", null).select("user_id")).error).not.toBeNull();

  // Cron com o segredo certo roda para a conexão ativa.
  // Restrito à conta de teste: o banco local pode ter contas reais conectadas, que o simulador não deve tocar.
  const cron = await anonimo.post("/api/classroom/cron", { headers: { "x-cron-secret": "segredo-cron-local" }, data: { usuario } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).resultados).toEqual([{ resultado: "ok" }]);
});
