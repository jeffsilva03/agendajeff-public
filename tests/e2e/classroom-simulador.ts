// Simulador local do Auth0 + APIClassroom para os testes (dados fictícios). Segue os contratos conferidos no
// código do APIClassroom (commit 6c4ebe6): JWT RS256 pelo JWKS, audiência, sub do dono e escopo classroom:read;
// paginação por cursor; erros { erro: { codigo, mensagem } }. Não chama nada externo.
import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, createLocalJWKSet, type JWK } from "jose";

export const PORTA_SIMULADOR = 3997;
const BASE = `http://127.0.0.1:${PORTA_SIMULADOR}`;
export const AUDIENCIA = "https://apiclassroom.vercel.app/mcp";
export const DONO = "google-oauth2|dono-ficticio";

type Item = Record<string, unknown>;
export interface Estado {
  turmas: Item[];
  atividades: Record<string, Item[]>;
  entregas: Record<string, Item[]>;
  falharTurma: Record<string, number>;     // course_id → status HTTP a devolver
  negarRefresh: boolean;
  refreshAtual: string | null;  // rotação: só o último refresh emitido vale
  familiaRevogada: boolean;     // reuso de refresh antigo revoga tudo (como o Auth0)
  renovacoes: number;
  atrasoMs: number;
  sub: string;
  chamadas: string[];
}

const iso = (ms: number) => new Date(ms).toISOString();
const prazoInstante = (ms: number) => ({ em_utc: iso(ms).replace(".000Z", "+00:00"), em_sao_paulo: null, fuso: "America/Sao_Paulo", situacao_temporal: ms < Date.now() ? "vencido" : "futuro", precisao: "instante" });

/** Cenário inicial: 3 turmas ativas (uma antiga), 6 atividades em Nuvem (3 páginas) e 1 na turma compartilhada. */
export function cenarioInicial(): Estado {
  const dia = 86_400_000;
  const agora = Date.now();
  const atividade = (curso: string, id: string, titulo: string, prazo: Item, extra: Item = {}) => ({
    id, disciplina_id: curso, disciplina_nome: "", titulo, descricao: `Descrição de ${titulo}`, descricao_truncada: false, tipo: "ASSIGNMENT",
    estado_publicacao: "PUBLISHED", criado_em: iso(agora - 10 * dia), atualizado_em: iso(agora - dia), publicado_em: null,
    link: `https://classroom.google.com/c/teste/a/${id}/details`, anexos: [], pontuacao_maxima: 10, prazo, ...extra,
  });
  const entrega = (curso: string, aid: string, estado: string | null, extra: Item = {}) => ({
    id: `sub-${aid}`, disciplina_id: curso, atividade_id: aid, estado, atrasada_segundo_google: null, nota_atribuida: null,
    criado_em: iso(agora - 9 * dia), atualizado_em: iso(agora - dia), link: "https://classroom.google.com/sub", ...extra,
  });
  const N = "900000000001", P = "900000000002";
  // 22h UTC = 19h em São Paulo, longe da virada do dia.
  const em = (dias: number) => { const d = new Date(agora + dias * dia); d.setUTCHours(22, 0, 0, 0); return d.getTime(); };
  const dataEm = (dias: number) => new Date(agora + dias * dia).toISOString().slice(0, 10);
  return {
    turmas: [
      { id: N, nome: "Computação em Nuvem de exemplo (teste)", status: "ACTIVE", aliases: ["Nuvem"], link: "https://classroom.google.com/c/n", descricao: "", atualizado_em: iso(agora) },
      { id: P, nome: "Turma compartilhada de exemplo (teste)", status: "ACTIVE", aliases: ["Automação", "Extensão", "Projeto Integrador", "Projeto Integrador/Extensão"], link: "https://classroom.google.com/c/p", descricao: "", atualizado_em: iso(agora) },
      { id: "900000000003", nome: "Turma antiga 2024 (teste)", status: "ACTIVE", aliases: [], link: "https://classroom.google.com/c/v", descricao: "", atualizado_em: iso(agora - 400 * dia) },
    ],
    atividades: {
      [N]: [
        atividade(N, "a1", "Lista de exercícios RDS", prazoInstante(em(2))),
        atividade(N, "a2", "Relatório entregue", prazoInstante(em(-1))),
        atividade(N, "a3", "Leitura sem prazo", { em_utc: null, em_sao_paulo: null, fuso: "America/Sao_Paulo", situacao_temporal: "sem_prazo", precisao: null }),
        atividade(N, "a4", "Projeto com data sem horário", { em_utc: null, em_sao_paulo: null, fuso: "America/Sao_Paulo", situacao_temporal: "incompleto", precisao: "somente_data_utc", data_utc: dataEm(5) }, { anexos: [{ tipo: "drive", id: "f1", nome: "enunciado.pdf", link: "https://drive.google.com/file/d/f1/view", possivel_pdf: true }], descricao: "x".repeat(2000), descricao_truncada: true }),
        atividade(N, "a5", "Atividade devolvida", prazoInstante(em(-6))),
        atividade(N, "a6", "Atividade atrasada", prazoInstante(em(-2))),
      ],
      [P]: [atividade(P, "b1", "Entrega do Projeto Integrador", prazoInstante(em(4)))],
      "900000000003": [atividade("900000000003", "v1", "Atividade antiga de 2024", prazoInstante(em(-300)))],
    },
    entregas: {
      [N]: [entrega(N, "a1", "NEW"), entrega(N, "a2", "TURNED_IN"), entrega(N, "a4", "CREATED"), entrega(N, "a5", "RETURNED", { nota_atribuida: 0 }), entrega(N, "a6", "NEW")],
      [P]: [entrega(P, "b1", "RECLAIMED_BY_STUDENT")],
      "900000000003": [],
    },
    falharTurma: {}, negarRefresh: false, refreshAtual: null, familiaRevogada: false, renovacoes: 0, atrasoMs: 0, sub: DONO, chamadas: [],
  };
}

export async function iniciarSimulador() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  // kid novo a cada rodada, como o Auth0 faz ao trocar de chave (o servidor mantém as chaves em cache por kid).
  const kid = `chave-${randomBytes(4).toString("hex")}`;
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const codigos = new Map<string, { desafio: string; redirect: string }>();
  let estado = cenarioInicial();

  const emitir = async () => new SignJWT({ scope: "openid offline_access classroom:read" })
    .setProtectedHeader({ alg: "RS256", kid }).setIssuer(`${BASE}/`).setAudience([AUDIENCIA, `${BASE}/userinfo`])
    .setSubject(estado.sub).setIssuedAt().setExpirationTime("1h").sign(privateKey);
  const json = (res: import("node:http").ServerResponse, status: number, corpo: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(corpo)); };
  const erro = (res: import("node:http").ServerResponse, status: number, codigo: string) => json(res, status, { erro: { codigo, mensagem: codigo } });
  const corpoDe = (req: import("node:http").IncomingMessage) => new Promise<string>((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });
  const pagina = (lista: Item[], cursor: string | null, tamanho: number) => {
    const ini = cursor ? Number(cursor.replace("p", "")) : 0;
    return { itens: lista.slice(ini, ini + tamanho), proxima: ini + tamanho < lista.length ? `p${ini + tamanho}` : null };
  };

  const servidor: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, BASE);
    const p = url.pathname;
    estado.chamadas.push(`${req.method} ${p}`);
    // --- Auth0 ---
    if (p === "/.well-known/jwks.json") return json(res, 200, { keys: [jwk] });
    if (p === "/authorize") {
      const code = randomBytes(8).toString("hex");
      codigos.set(code, { desafio: url.searchParams.get("code_challenge")!, redirect: url.searchParams.get("redirect_uri")! });
      const volta = new URL(url.searchParams.get("redirect_uri")!);
      volta.searchParams.set("code", code);
      volta.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: volta.toString() });
      return res.end();
    }
    if (p === "/oauth/token" && req.method === "POST") {
      const f = new URLSearchParams(await corpoDe(req));
      if (f.get("client_secret") !== "segredo-teste") return json(res, 401, { error: "invalid_client" });
      if (f.get("grant_type") === "authorization_code") {
        const c = codigos.get(f.get("code") ?? "");
        codigos.delete(f.get("code") ?? "");
        const ok = c && c.redirect === f.get("redirect_uri") && createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") === c.desafio;
        if (!ok) return json(res, 403, { error: "invalid_grant" });
        estado.familiaRevogada = false;
      } else if (f.get("grant_type") === "refresh_token") {
        if (estado.familiaRevogada || estado.negarRefresh) return json(res, 403, { error: "invalid_grant" });
        if (f.get("refresh_token") !== estado.refreshAtual) { estado.familiaRevogada = true; return json(res, 403, { error: "invalid_grant" }); }
        estado.renovacoes++;
      } else return json(res, 400, { error: "unsupported_grant_type" });
      estado.refreshAtual = `refresh-${randomBytes(6).toString("hex")}`;
      return json(res, 200, { access_token: await emitir(), refresh_token: estado.refreshAtual, expires_in: 3600, scope: "openid offline_access classroom:read", token_type: "Bearer" });
    }
    if (p === "/oauth/revoke") return json(res, 200, {});
    // --- Controle dos testes ---
    if (p === "/__estado" && req.method === "POST") {
      const mudar = JSON.parse(await corpoDe(req) || "{}");
      if (mudar.reiniciar) estado = { ...cenarioInicial(), refreshAtual: estado.refreshAtual };
      estado = { ...estado, ...mudar.campos };
      return json(res, 200, { ok: true });
    }
    // --- APIClassroom (mesma verificação do security.py) ---
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return erro(res, 401, "autenticacao_necessaria");
    try {
      const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer: `${BASE}/`, audience: AUDIENCIA, algorithms: ["RS256"] });
      if (payload.sub !== DONO) return erro(res, 403, "identidade_nao_autorizada");
      if (!String(payload.scope ?? "").split(" ").includes("classroom:read")) return erro(res, 403, "escopo_insuficiente");
    } catch { return erro(res, 401, "token_invalido"); }
    if (estado.atrasoMs) await new Promise((r) => setTimeout(r, estado.atrasoMs));
    if (p === "/disciplinas") {
      const pg = pagina(estado.turmas, url.searchParams.get("pagina"), Number(url.searchParams.get("tamanho") ?? 50));
      return json(res, 200, { disciplinas: pg.itens, proxima_pagina: pg.proxima, inclui_arquivadas: false });
    }
    const m = /^\/disciplinas\/([A-Za-z0-9_-]+)\/(atividades|entregas)(?:\/([A-Za-z0-9_-]+))?$/.exec(p);
    if (m) {
      const [, curso, tipo, aid] = m;
      if (!estado.turmas.some((t) => t.id === curso)) return erro(res, 404, "disciplina_indisponivel");
      if (estado.falharTurma[curso]) return erro(res, estado.falharTurma[curso], "google_indisponivel");
      if (tipo === "atividades" && aid) {
        const a = (estado.atividades[curso] ?? []).find((x) => x.id === aid);
        return a ? json(res, 200, { disciplina: {}, atividade: { ...a, descricao: `Descrição completa de ${a.titulo}`, descricao_truncada: false } }) : erro(res, 404, "atividade_indisponivel");
      }
      // Páginas pequenas (2) para exercitar a paginação.
      const pg = pagina(tipo === "atividades" ? estado.atividades[curso] ?? [] : estado.entregas[curso] ?? [], url.searchParams.get("pagina"), 2);
      return json(res, 200, tipo === "atividades" ? { disciplina: {}, itens: pg.itens, proxima_pagina: pg.proxima } : { disciplina: {}, entregas: pg.itens, proxima_pagina: pg.proxima });
    }
    return erro(res, 404, "nao_encontrado");
  });
  await new Promise<void>((ok) => servidor.listen(PORTA_SIMULADOR, "127.0.0.1", ok));
  return {
    estado: () => estado,
    mudar: (f: (e: Estado) => void) => f(estado),
    reiniciar: () => { estado = { ...cenarioInicial(), refreshAtual: estado.refreshAtual }; },
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  };
}
