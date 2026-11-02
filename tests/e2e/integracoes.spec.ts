// API de integração e OAuth/MCP contra o app e o Supabase locais. Usa só contas de teste próprias
// (criadas e apagadas aqui, para não interferir nas outras suítes) e dados fictícios.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { expect, request as novoRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { aplicarSeed } from "../../lib/seed";
import { admin, env } from "./ambiente";

const API = "/api/integrations/agenda/v1";
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const E2E = { email: "e2e-api@local.test", senha: "senha-api-12345" };
const OUTRO = { email: "e2e-outro@local.test", senha: "senha-outro-12345" };
const CALLBACK = "http://localhost:3999/callback";
// Segredo padrão do Supabase local (público, só serve no Docker de desenvolvimento): para forjar um token expirado.
const JWT_LOCAL = "super-secret-jwt-token-with-at-least-32-characters-long";

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dia = (n: number) => new Date(new Date(`${hoje}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

async function entrar(email: string, senha: string) {
  const sb = createClient(SB, PUB, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return { token: data.session!.access_token, userId: data.user!.id, sb };
}
const get = (r: APIRequestContext, caminho: string, token?: string) =>
  r.get(`${API}/${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nas asserções
const corpo = async (resp: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<any> => resp.json();

/** Falha alto se a preparação dos dados der erro (em vez de seguir com dados faltando). */
function ok<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(`Preparação dos dados falhou: ${r.error.message}`);
  return r;
}

let e2e: Awaited<ReturnType<typeof entrar>>;
let outro: Awaited<ReturnType<typeof entrar>>;
let projetoId: string;
const clientesCriados: string[] = [];

test.beforeAll(async () => {
  const a = admin();
  const { data: lista } = await a.auth.admin.listUsers({ perPage: 1000 });
  for (const u of lista?.users.filter((x) => x.email === OUTRO.email || x.email === E2E.email) ?? []) await a.auth.admin.deleteUser(u.id);
  ok(await a.auth.admin.createUser({ email: E2E.email, password: E2E.senha, email_confirm: true }));
  await aplicarSeed(a, E2E.email);
  ok(await a.auth.admin.createUser({ email: OUTRO.email, password: OUTRO.senha, email_confirm: true }));
  e2e = await entrar(E2E.email, E2E.senha);
  outro = await entrar(OUTRO.email, OUTRO.senha);

  // Dados fictícios do e2e (as datas são relativas ao dia real, porque a API usa a data de hoje).
  ok(await a.from("profiles").update({ inicio_rastreamento: dia(-3), integracoes_ativas: false }).eq("user_id", e2e.userId));
  ok(await a.from("tarefas").insert([
    { user_id: e2e.userId, titulo: "API: tarefa atrasada", data: dia(-2), notas: "nota privada da tarefa" },
    { user_id: e2e.userId, titulo: "API: tarefa importante", data: hoje, prioridade: 1, hora: "15:00" },
    { user_id: e2e.userId, titulo: "API: tarefa concluída", data: hoje, concluida_em: new Date().toISOString() },
  ], { defaultToNull: false }));
  ok(await a.from("tarefas_recorrentes").insert({ user_id: e2e.userId, titulo: "API: recorrente diária", regra: "diaria", inicio: dia(-10) }));
  const { data: sem } = await a.from("semestres").insert({ user_id: e2e.userId, nome: "Semestre de teste API", inicio: dia(-7), fim: dia(20) }).select("id").single();
  const { data: disc } = await a.from("disciplinas").insert({ user_id: e2e.userId, semestre_id: sem!.id, nome: "Disciplina Teste API", professor: "Prof. Fictício", sala: "Sala 9" }).select("id").single();
  ok(await a.from("aulas").insert({ user_id: e2e.userId, disciplina_id: disc!.id, dia_semana: new Date(`${dia(2)}T12:00:00Z`).getUTCDay(), inicio: "19:00", fim: "20:00" }));
  ok(await a.from("avaliacoes").insert([
    { user_id: e2e.userId, disciplina_id: disc!.id, tipo: "prova", titulo: "Prova fictícia", data: dia(5), nota: 8.5, descricao: "conteúdo privado" },
    { user_id: e2e.userId, disciplina_id: disc!.id, tipo: "trabalho", titulo: "Trabalho entregue fictício", data: dia(-1), entregue: true, nota: 7 },
  ], { defaultToNull: false }));
  ok(await a.from("candidaturas").insert([
    { user_id: e2e.userId, empresa: "Empresa Fictícia", vaga: "Estágio teste", status: "entrevista", data_envio: dia(-5), proxima_acao: "Entrevista técnica", proxima_data: dia(2), proxima_hora: "10:00", notas: "salário privado" },
    { user_id: e2e.userId, empresa: "Outra Fictícia", vaga: "Estágio dois", status: "enviada", data_envio: dia(-1) },
  ], { defaultToNull: false }));
  ok(await a.from("freelas").insert([
    { user_id: e2e.userId, cliente: "Cliente Fictício", titulo: "Site fictício", status: "entregue", valor: 1200, prazo: dia(-1) },
    { user_id: e2e.userId, cliente: "Cliente Fictício", titulo: "App fictício", status: "em_andamento", valor: 800, prazo: dia(4), horas_estimadas: 10 },
    { user_id: e2e.userId, cliente: "Cliente Fictício", titulo: "Cancelado fictício", status: "cancelado", valor: 500 },
  ], { defaultToNull: false }));
  const { data: proj } = ok(await a.from("projetos").insert({
    user_id: e2e.userId, nome: "Projeto fictício API", resumo: "Ideia de teste", status: "desenvolvendo", prioridade: "alta",
    tecnologias: ["Next.js"], proximo_passo: "Fazer o login", notas: "anotação do projeto", descricao: "descrição do projeto",
  }).select("id").single());
  projetoId = proj!.id;
  ok(await a.from("projeto_features").insert([
    { user_id: e2e.userId, projeto_id: projetoId, titulo: "Feature essencial feita", prioridade: "essencial", status: "feito", ordem: 0 },
    { user_id: e2e.userId, projeto_id: projetoId, titulo: "Feature essencial pendente", prioridade: "essencial", ordem: 1 },
    { user_id: e2e.userId, projeto_id: projetoId, titulo: "Feature extra", prioridade: "extra", ordem: 2 },
  ], { defaultToNull: false }));
  ok(await a.from("projetos").insert({ user_id: e2e.userId, nome: "Projeto arquivado API", status: "arquivado" }));
  const mes = `${hoje.slice(0, 7)}-01`;
  const { data: area } = ok(await a.from("raiox_areas").insert({ user_id: e2e.userId, nome: "Saúde", ordem: 0 }).select("id").single());
  ok(await a.from("raiox_notas").insert({ user_id: e2e.userId, mes, area_id: area!.id, importancia: 9, acao: 4, compromisso: "Treinar 3x", foco: true }));
  ok(await a.from("metas").insert({ user_id: e2e.userId, mes, titulo: "Ler 4 livros", tipo: "contagem", alvo: 4, progresso: 1, unidade: "livros" }));
  ok(await a.from("revisoes_mensais").insert({ user_id: e2e.userId, mes, nota: 7, aprendi: "aprendizado privado do mês" }));
  // Do outro usuário: precisa ficar invisível para o e2e.
  ok(await a.from("tarefas").insert({ user_id: outro.userId, titulo: "Segredo do outro usuário", data: hoje }));
});

test.afterAll(async () => {
  const a = admin();
  for (const id of clientesCriados) await fetch(`${SB}/auth/v1/admin/oauth/clients/${id}`, { method: "DELETE", headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } });
  const { data: lista } = await a.auth.admin.listUsers({ perPage: 1000 });
  for (const u of lista?.users.filter((x) => x.email === OUTRO.email || x.email === E2E.email) ?? []) await a.auth.admin.deleteUser(u.id);
});

test("autenticação: sem credencial, inválida, expirada e de sessão encerrada", async ({ request: comSessao, baseURL }) => {
  // Contexto sem o cookie de sessão do navegador de teste (o cookie do próprio app também é uma credencial válida).
  const request = await novoRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await get(comSessao, "today")).status()).toBe(200); // sessão do app por cookie (conta da suíte geral)
  expect((await request.get(`${API}/health`)).status()).toBe(200);
  expect(await corpo(await request.get(`${API}/health`))).toEqual({ success: true, data: { status: "ok", service: "agendajeff-integrations", apiVersion: "v1" } });

  const sem = await get(request, "today");
  expect(sem.status()).toBe(401);
  expect(sem.headers()["www-authenticate"]).toContain("Bearer");
  expect((await corpo(sem)).error.code).toBe("nao_autenticado");

  for (const ruim of ["abc", "a.b.c", `${e2e.token}x`]) {
    const r = await get(request, "today", ruim);
    expect(r.status()).toBe(401);
    expect((await corpo(r)).error.code).toBe("token_invalido");
  }
  const malformado = await request.get(`${API}/today`, { headers: { Authorization: "Basic dXNlcjpzZW5oYQ==" } });
  expect(malformado.status()).toBe(401);

  // Token com assinatura válida, mas expirado.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64({ alg: "HS256", typ: "JWT" });
  const carga = b64({ sub: e2e.userId, role: "authenticated", aud: "authenticated", iss: "http://127.0.0.1:54321/auth/v1", iat: agora - 7200, exp: agora - 3600 });
  const expirado = `${cab}.${carga}.${createHmac("sha256", JWT_LOCAL).update(`${cab}.${carga}`).digest("base64url")}`;
  expect((await get(request, "today", expirado)).status()).toBe(401);

  // Sessão encerrada: o token deixa de valer mesmo antes de expirar.
  const temp = await entrar(E2E.email, E2E.senha);
  expect((await get(request, "today", temp.token)).status()).toBe(200);
  await temp.sb.auth.signOut({ scope: "local" });
  expect((await get(request, "today", temp.token)).status()).toBe(401);
});

test("hoje: mesma lógica da tela, tarefas separadas e sem notas por padrão", async ({ request }) => {
  const r = await corpo(await get(request, "today", e2e.token));
  expect(r.success).toBe(true);
  expect(r.meta).toMatchObject({ timezone: "America/Sao_Paulo", source: "AgendaJeff" });
  expect(r.meta.generatedAt).toMatch(/-03:00$/);
  const d = r.data;
  expect(d.date).toBe(hoje);
  const titulos = (l: { title: string }[]) => l.map((t) => t.title);
  expect(titulos(d.tasks.pending)).toEqual(expect.arrayContaining(["API: tarefa atrasada", "API: tarefa importante", "API: recorrente diária"]));
  expect(titulos(d.tasks.pending)[0]).toBe("API: tarefa importante"); // importante primeiro, como no Hoje
  expect(titulos(d.tasks.overdue)).toEqual(["API: tarefa atrasada"]);
  expect(titulos(d.tasks.done)).toEqual(["API: tarefa concluída"]);
  expect(titulos(d.tasks.pending)).not.toContain("API: tarefa concluída");
  expect(JSON.stringify(d)).not.toContain("nota privada");
  expect(titulos(d.tasks.pending)).not.toContain("Segredo do outro usuário");
  expect(d.habits.summary.note).toContain("Não se aplica");

  // Com include=notes o próprio usuário vê a nota.
  const comNotas = await corpo(await get(request, "today?include=notes", e2e.token));
  expect(JSON.stringify(comNotas.data.tasks.overdue)).toContain("nota privada da tarefa");
});

test("hábitos: feito, mínimo e não se aplica com o cálculo da aba Progresso", async ({ request }) => {
  const a = admin();
  const { data: habitos } = await a.from("habits").select("id, nome").eq("user_id", e2e.userId).eq("arquivado", false).order("criado_em").limit(3);
  const [h1, h2, h3] = habitos!;
  ok(await a.from("checks").insert([
    { user_id: e2e.userId, habit_id: h1.id, data_local: dia(-1), status: "completo" },
    { user_id: e2e.userId, habit_id: h2.id, data_local: dia(-1), status: "minimo" },
    { user_id: e2e.userId, habit_id: h3.id, data_local: dia(-1), status: "nao_se_aplica" },
  ]));
  const r = (await corpo(await get(request, `habits?date=${dia(-1)}`, e2e.token))).data;
  const estado = (id: string) => r.stateOnDate.habits.find((h: { habitId: string }) => h.habitId === id)?.state;
  expect(r.stateOnDate.dayHadRecords).toBe(true);
  if (estado(h1.id)) expect(estado(h1.id)).toBe("done");
  if (estado(h2.id)) expect(estado(h2.id)).toBe("minimum");
  if (estado(h3.id)) expect(estado(h3.id)).toBe("not_applicable");
  const h3Resumo = r.habits.find((h: { habitId: string }) => h.habitId === h3.id);
  expect(h3Resumo.overall.notDone).toBe(0); // "não se aplica" não vira falha
  expect(r.tracking).toMatchObject({ start: dia(-3), started: true });
  // Histórico com teto de 92 dias
  expect((await get(request, `habits?start=${dia(-100)}&end=${hoje}`, e2e.token)).status()).toBe(400);
});

test("tarefas, faculdade, candidaturas, freelas, semana, agenda, insights e busca", async ({ request }) => {
  const t = await corpo(await get(request, "tasks?overdue=true", e2e.token));
  expect(t.data.tasks.map((x: { title: string }) => x.title)).toEqual(["API: tarefa atrasada"]);
  const faixa = await corpo(await get(request, `tasks?start=${dia(-3)}&end=${dia(2)}&recurring=true`, e2e.token));
  // Recorrente não acumula: só de hoje em diante (hoje, +1, +2).
  expect(faixa.data.tasks.map((x: { date: string }) => x.date)).toEqual([hoje, dia(1), dia(2)]);
  expect(faixa.data.tasks.every((x: { id: string | null }) => x.id === null)).toBe(true);

  const c = (await corpo(await get(request, `college?date=${dia(2)}`, e2e.token))).data; // dia comum (hoje pode ser feriado)
  expect(c.currentSemester?.name).toBe("Semestre de teste API");
  expect(c.classesOnDate.classes.map((x: { subject: string }) => x.subject)).toContain("Disciplina Teste API");
  expect(c.assessments.map((x: { title: string }) => x.title)).toEqual(["Prova fictícia"]); // padrão: pendentes
  expect(c.assessments[0]).not.toHaveProperty("grade");
  expect(c.assessments[0]).not.toHaveProperty("description");
  const fora = (await corpo(await get(request, `college?date=${dia(30)}`, e2e.token))).data; // mesmo dia da semana, depois do fim do semestre
  expect(fora.classesOnDate.classes.map((x: { subject: string }) => x.subject)).not.toContain("Disciplina Teste API");
  const notas = (await corpo(await get(request, "college?assessments=all&include=grades", e2e.token))).data;
  expect(notas.subjects.find((s: { name: string }) => s.name === "Disciplina Teste API").average).toBe(7.75);

  const ap = (await corpo(await get(request, "applications", e2e.token))).data;
  expect(ap.summary).toMatchObject({ total: 2, awaitingResponse: 1 });
  expect(ap.upcomingSteps.map((x: { company: string }) => x.company)).toEqual(["Empresa Fictícia"]);
  expect(JSON.stringify(ap)).not.toContain("salário privado");

  const fr = (await corpo(await get(request, "freelances", e2e.token))).data;
  expect(fr.freelances.map((x: { project: string }) => x.project)).not.toContain("Cancelado fictício");
  expect(fr.summary.toReceive).toBe(1200);
  expect(fr.upcomingDeliveries.map((x: { project: string }) => x.project)).toEqual(["App fictício"]);
  const comCancelado = (await corpo(await get(request, "freelances?status=cancelado", e2e.token))).data;
  expect(comCancelado.freelances.map((x: { project: string }) => x.project)).toEqual(["Cancelado fictício"]);

  const w = (await corpo(await get(request, `week?date=${hoje}`, e2e.token))).data;
  expect(w.days).toHaveLength(7);
  const ag = (await corpo(await get(request, `agenda?start=${hoje}&end=${dia(6)}`, e2e.token))).data;
  const prazos = ag.days.flatMap((d: { deadlines: { title: string; source: string; kind: string }[] }) => d.deadlines);
  expect(prazos.filter((p: { title: string; kind: string }) => p.title.includes("Prova fictícia") && p.kind === "deadline")).toHaveLength(1); // sem duplicar
  expect(prazos.find((p: { title: string }) => p.title.includes("Prova fictícia")).source).toBe("college");
  const eventos = ag.days.flatMap((d: { events: { title: string; source: string }[] }) => d.events);
  expect(eventos.find((e: { title: string }) => e.title.includes("Empresa Fictícia"))?.source).toBe("application");

  const ins = (await corpo(await get(request, "insights", e2e.token))).data;
  expect(ins.chainBreaks).toMatchObject({ available: false, reason: "insufficient_data" });

  const busca = (await corpo(await get(request, "search?q=fict", e2e.token))).data;
  expect(busca.results.length).toBeGreaterThan(0);
  expect(JSON.stringify(busca)).not.toContain("Segredo do outro");
});

test("projetos e mês: lista, detalhe com features e anotações, metas, Raio-X e revisão", async ({ request }) => {
  const lista = await corpo(await get(request, "projects", e2e.token));
  expect(lista.data.projects.map((p: { name: string }) => p.name)).toEqual(["Projeto fictício API"]); // arquivado só quando pedido
  expect(lista.data.projects[0]).toMatchObject({ status: "desenvolvendo", nextStep: "Fazer o login", progress: { done: 1, total: 3, mvpDone: 1, mvpTotal: 2, mvpRatio: 0.5 } });
  expect(lista.data.summary.byStatus).toMatchObject({ desenvolvendo: 1, arquivado: 1 });
  expect((await corpo(await get(request, "projects?status=arquivado", e2e.token))).data.projects).toHaveLength(1);

  const det = (await corpo(await get(request, `projects/${projetoId}`, e2e.token))).data.project;
  expect(det).toMatchObject({ description: "descrição do projeto", notes: "anotação do projeto" });
  expect(det.features.map((f: { title: string }) => f.title)).toEqual(["Feature essencial pendente", "Feature extra", "Feature essencial feita"]);
  expect((await get(request, "projects/00000000-0000-0000-0000-000000000000", e2e.token)).status()).toBe(404);
  expect((await get(request, "projects/nao-e-uuid", e2e.token)).status()).toBe(400);

  const mes = (await corpo(await get(request, "month", e2e.token))).data;
  expect(mes.goals[0]).toMatchObject({ title: "Ler 4 livros", target: 4, current: 1, ratio: 0.25 });
  expect(mes.lifeReview.areas[0]).toMatchObject({ area: "Saúde", importance: 9, action: 4, gap: 5, gapType: "atencao", quadrant: "prioridade", commitment: "Treinar 3x" });
  expect(mes.monthlyReview).toMatchObject({ rating: 7, learned: "aprendizado privado do mês" });
  expect((await get(request, "month?month=2026-13", e2e.token)).status()).toBe(400);

  const busca = (await corpo(await get(request, "search?q=feature%20extra&categories=projects", e2e.token))).data.results;
  expect(busca).toEqual([expect.objectContaining({ type: "project_feature", title: "Feature extra", subtitle: "Projeto fictício API · a_fazer" })]);

  // Outro usuário não vê nada disso.
  expect((await corpo(await get(request, "projects", outro.token))).data.projects).toEqual([]);
  expect((await get(request, `projects/${projetoId}`, outro.token)).status()).toBe(404);
  expect((await corpo(await get(request, "month", outro.token))).data.goals).toEqual([]);
});

test("isolamento entre usuários e somente leitura", async ({ request }) => {
  // O outro usuário não enxerga nada do e2e, nem com parâmetro de usuário (que nem é aceito).
  const b = await corpo(await get(request, "search?q=API", outro.token));
  expect(b.data.results).toEqual([]);
  expect((await get(request, `tasks?user_id=${e2e.userId}`, outro.token)).status()).toBe(400);
  const t = await corpo(await get(request, "today", outro.token));
  expect(JSON.stringify(t)).not.toContain("API: tarefa");
  // Direto no banco com o token do outro: a RLS também esconde.
  const { data } = await outro.sb.from("tarefas").select("titulo").eq("user_id", e2e.userId);
  expect(data).toEqual([]);

  // Métodos de gravação não existem na API.
  for (const metodo of ["post", "put", "patch", "delete"] as const) {
    const r = await request[metodo](`${API}/tasks`, { headers: { Authorization: `Bearer ${e2e.token}` }, data: { titulo: "x" } });
    expect(r.status()).toBe(405);
  }
});

test("limite de uso: 429 depois de 60 consultas no minuto", async ({ request }) => {
  // O contador é por minuto do relógio: se as consultas cruzarem a virada do minuto, a contagem recomeça.
  // Com até 121 consultas, uma janela inteira de 60 é ultrapassada de qualquer jeito.
  let ultimo = 200;
  for (let i = 0; i < 121 && ultimo !== 429; i++) ultimo = (await get(request, "insights", outro.token)).status();
  expect(ultimo).toBe(429);
  const r = await get(request, "insights", outro.token);
  expect(r.headers()["retry-after"]).toBeTruthy();
  expect((await corpo(r)).error.code).toBe("limite_excedido");
});

/** Fluxo OAuth 2.1 (registro dinâmico + PKCE) como um cliente MCP faria; o consentimento acontece na tela do app. */
async function autorizar(page: Page, decidir: (p: Page) => Promise<void>) {
  const reg = await (await fetch(`${SB}/auth/v1/oauth/clients/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Cliente MCP de teste", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  })).json();
  clientesCriados.push(reg.client_id);
  const verificador = randomBytes(32).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  let retorno = "";
  await page.route(`${CALLBACK}**`, (rota) => { retorno = rota.request().url(); return rota.fulfill({ status: 200, body: "ok" }); });
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: CALLBACK, code_challenge: desafio, code_challenge_method: "S256", state: "estado-123", scope: "email" });
  await page.goto(`${SB}/auth/v1/oauth/authorize?${q}`);
  await page.waitForURL(/\/oauth\/consent\?authorization_id=/);
  await decidir(page);
  await expect.poll(() => retorno, { timeout: 15_000 }).not.toBe("");
  // Espera a navegação até o retorno terminar, para a próxima ida a outra página não ser interrompida por ela.
  await page.waitForURL(`${CALLBACK}**`);
  return { clientId: reg.client_id, verificador, retorno: new URL(retorno) };
}

test("OAuth: consentimento, interruptor, somente leitura no banco, MCP e revogação", async ({ browser, request, baseURL }) => {
  // Navegador logado na conta própria desta suíte.
  const contexto = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  await page.goto("/entrar");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", E2E.email);
  await page.fill("#senha", E2E.senha);
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/hoje/, { timeout: 20_000 });
  // Integrações desligadas: a tela avisa e o pedido pode ser recusado.
  const negado = await autorizar(page, async (p) => {
    await expect(p.getByText(/integrações externas estão desligadas/)).toBeVisible();
    await p.getByRole("button", { name: "Recusar este pedido" }).click();
  });
  expect(negado.retorno.searchParams.get("error")).toBe("access_denied");

  // Liga em Ajustes (ação explícita do usuário).
  await page.goto("/ajustes#integracoes");
  await page.getByRole("switch", { name: "Permitir integrações externas" }).click();
  await expect(page.getByText("Integrações externas ligadas.")).toBeVisible();

  const ok = await autorizar(page, async (p) => {
    await expect(p.getByRole("heading", { level: 1 })).toContainText("Cliente MCP de teste");
    await p.getByRole("button", { name: "Permitir", exact: true }).click();
  });
  expect(ok.retorno.searchParams.get("state")).toBe("estado-123");
  const code = ok.retorno.searchParams.get("code")!;
  const tok = await (await fetch(`${SB}/auth/v1/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: ok.clientId, code_verifier: ok.verificador }),
  })).json();
  const oauth = tok.access_token as string;
  expect(oauth).toBeTruthy();
  expect(JSON.parse(Buffer.from(oauth.split(".")[1], "base64url").toString()).client_id).toBe(ok.clientId);

  // Consulta funciona, com as anotações liberadas também para o cliente externo.
  const hojeOauth = await get(request, "today", oauth);
  expect(hojeOauth.status()).toBe(200);
  const comNotas = await get(request, "tasks?overdue=true&include=notes", oauth);
  expect(comNotas.status()).toBe(200);
  expect((await corpo(comNotas)).data.tasks[0].notes).toBe("nota privada da tarefa");
  expect((await corpo(await get(request, "month", oauth))).data.monthlyReview.learned).toBe("aprendizado privado do mês");

  // No banco, o token OAuth só lê: não grava nada e não vê tabelas internas (perfil com o token do calendário).
  const sbOauth = createClient(SB, PUB, { global: { headers: { Authorization: `Bearer ${oauth}` } }, auth: { persistSession: false } });
  expect((await sbOauth.from("tarefas").select("titulo").eq("titulo", "API: tarefa importante")).data).toHaveLength(1);
  expect((await sbOauth.from("profiles").select("token_calendario")).data).toEqual([]);
  expect((await sbOauth.from("push_subscriptions").select("id")).data).toEqual([]);
  expect((await sbOauth.from("revisoes_mensais").select("aprendi")).data).toEqual([{ aprendi: "aprendizado privado do mês" }]);
  expect((await sbOauth.from("projetos").update({ nome: "alterado pelo OAuth" }).eq("id", projetoId).select("id")).data ?? []).toEqual([]);
  const ins = await sbOauth.from("tarefas").insert({ titulo: "gravado pelo OAuth", data: hoje });
  expect(ins.error).not.toBeNull();
  const upd = await sbOauth.from("tarefas").update({ titulo: "alterado pelo OAuth" }).eq("titulo", "API: tarefa importante").select("id");
  expect(upd.data ?? []).toEqual([]);
  const del = await sbOauth.from("tarefas").delete().eq("titulo", "API: tarefa importante").select("id");
  expect(del.data ?? []).toEqual([]);
  const { data: intacta } = await admin().from("tarefas").select("titulo").eq("user_id", e2e.userId).eq("titulo", "API: tarefa importante");
  expect(intacta).toHaveLength(1);
  const upPerfil = await sbOauth.from("profiles").update({ integracoes_ativas: true }).not("user_id", "is", null).select("user_id");
  expect(upPerfil.data ?? []).toEqual([]);

  // MCP com o token OAuth.
  const mcp = (corpo: object) => request.post("/mcp", { headers: { Authorization: `Bearer ${oauth}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" }, data: corpo });
  const lerSse = async (r: Awaited<ReturnType<typeof mcp>>) => JSON.parse((await r.text()).split("\n").find((l) => l.startsWith("data: "))!.slice(6));
  const ini = await lerSse(await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } } }));
  expect(ini.result.serverInfo.name).toBe("agendajeff");
  const ferramentas = await lerSse(await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
  expect(ferramentas.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
    "agenda_get_college_schedule", "agenda_get_habit_progress", "agenda_get_insights", "agenda_get_month", "agenda_get_project", "agenda_get_today", "agenda_get_week",
    "agenda_list_applications", "agenda_list_college_deadlines", "agenda_list_events", "agenda_list_freelances", "agenda_list_projects", "agenda_list_tasks", "agenda_search",
  ]);
  expect(ferramentas.result.tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(true);
  const chamada = await lerSse(await mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "agenda_list_tasks", arguments: { overdue: true } } }));
  expect(chamada.result.structuredContent.tasks.map((t: { title: string }) => t.title)).toEqual(["API: tarefa atrasada"]);
  expect(JSON.stringify(chamada)).toContain("nota privada da tarefa"); // anotações vêm junto
  const projeto = await lerSse(await mcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "agenda_get_project", arguments: { projectId: projetoId } } }));
  expect(projeto.result.structuredContent.project).toMatchObject({ name: "Projeto fictício API", notes: "anotação do projeto" });
  const doMes = await lerSse(await mcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "agenda_get_month", arguments: {} } }));
  expect(doMes.result.structuredContent.goals[0].title).toBe("Ler 4 livros");
  const invalida = await lerSse(await mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "agenda_list_events", arguments: { start: dia(0), end: dia(100) } } }));
  expect(invalida.result.isError).toBe(true);
  expect((await request.post("/mcp", { headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status()).toBe(401);

  // Desligando o interruptor, o cliente externo para na hora (a API e o MCP).
  await page.goto("/ajustes#integracoes");
  await expect(page.getByText("Cliente MCP de teste")).toBeVisible();
  await expect(page.getByText(/último uso/)).toBeVisible();
  await page.getByRole("switch", { name: "Permitir integrações externas" }).click();
  await expect(page.getByText(/Integrações externas desligadas/)).toBeVisible();
  const bloqueado = await get(request, "today", oauth);
  expect(bloqueado.status()).toBe(403);
  expect((await corpo(bloqueado)).error.code).toBe("integracao_desativada");
  const mcpBloqueado = await lerSse(await mcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "agenda_get_today", arguments: {} } }));
  expect(mcpBloqueado.result.structuredContent.error.code).toBe("integracao_desativada");

  // Revogar em Ajustes invalida o token do cliente.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revogar" }).first().click();
  await expect(page.getByText(/revogado/)).toBeVisible();
  await expect.poll(async () => (await get(request, "today", oauth)).status(), { timeout: 10_000 }).toBe(401);
});
