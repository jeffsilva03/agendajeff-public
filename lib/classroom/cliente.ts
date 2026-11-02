// Cliente REST do APIClassroom, chamado só pelo servidor do AgendaJeff (o token nunca vai ao navegador).
// Paginação completa com proteção contra cursor repetido, tentativas com espera em 429/5xx/timeout,
// e uma renovação de token em 401.
import "server-only";
import type { ConfigClassroom } from "./config";
import type { AtividadeApi, EntregaApi, ErroApiClassroom, RespostaAtividades, RespostaDetalhe, RespostaEntregas, RespostaTurmas, TurmaApi } from "./tipos";

export class ErroClassroom extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem); }
  /** Falhas que podem passar sozinhas (tentar de novo mais tarde). */
  get temporario() { return this.status === 429 || this.status >= 500 || this.status === 0; }
  /** Autorização perdida: precisa conectar de novo. */
  get reautorizar() { return this.status === 401; }
}

const ID = /^[A-Za-z0-9_-]{1,180}$/;
const MAX_PAGINAS = 40;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpcoesCliente {
  /** Devolve um access token válido; com forcar=true, renova antes. */
  token: (forcar?: boolean) => Promise<string>;
  /** Prazo final da operação inteira (para não estourar o limite de execução da Vercel). */
  ate?: number;
  fetch?: typeof fetch;
}

export class ClienteClassroom {
  chamadas = 0;
  constructor(private cfg: ConfigClassroom, private op: OpcoesCliente) {}

  private async get<T>(caminho: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const url = new URL(`${this.cfg.api}${caminho}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    let renovou = false;
    let forcar = false;
    for (let tentativa = 0; ; tentativa++) {
      if (this.op.ate && Date.now() > this.op.ate) throw new ErroClassroom(0, "tempo_esgotado", "Tempo da sincronização esgotado.");
      this.chamadas++;
      // Fora do try da rede: falha de autorização (refresh negado) não pode virar "erro de rede".
      const token = await this.op.token(forcar);
      forcar = false;
      let r: Response;
      try {
        r = await (this.op.fetch ?? fetch)(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(25000), redirect: "error", cache: "no-store",
        });
      } catch {
        if (tentativa < 2) { await espera(1000 * 3 ** tentativa); continue; }
        throw new ErroClassroom(0, "rede", "APIClassroom não respondeu.");
      }
      if (r.ok) {
        const corpo = await r.json().catch(() => null);
        if (!corpo || typeof corpo !== "object") throw new ErroClassroom(502, "resposta_invalida", "Resposta inválida do APIClassroom.");
        return corpo as T;
      }
      const erro = ((await r.json().catch(() => ({}))) as ErroApiClassroom).erro;
      if (r.status === 401 && !renovou) { renovou = forcar = true; continue; } // token expirou no meio: renova uma vez
      const temporario = r.status === 429 || r.status >= 500;
      if (temporario && tentativa < 2) {
        const depois = Number(r.headers.get("retry-after"));
        await espera(Math.min(Number.isFinite(depois) && depois > 0 ? depois * 1000 : 1500 * 2 ** tentativa, 20000));
        continue;
      }
      throw new ErroClassroom(r.status, erro?.codigo ?? `http_${r.status}`, erro?.mensagem ?? `APIClassroom respondeu ${r.status}.`);
    }
  }

  /** Percorre todas as páginas de uma listagem. */
  private async todas<R, I>(buscar: (pagina?: string) => Promise<R>, itens: (r: R) => I[], proxima: (r: R) => unknown): Promise<I[]> {
    const lista: I[] = [];
    const vistos = new Set<string>();
    let pagina: string | undefined;
    for (let n = 0; n < MAX_PAGINAS; n++) {
      const r = await buscar(pagina);
      const parte = itens(r);
      if (!Array.isArray(parte)) throw new ErroClassroom(502, "resposta_invalida", "Resposta sem a lista esperada.");
      lista.push(...parte);
      const p = proxima(r);
      if (p === null || p === undefined || p === "") return lista;
      if (typeof p !== "string" || p.length > 2048 || !/^[\x21-\x7e]+$/.test(p) || vistos.has(p)) throw new ErroClassroom(502, "paginacao_invalida", "Cursor de paginação inválido ou repetido.");
      vistos.add(p);
      pagina = p;
    }
    throw new ErroClassroom(502, "paginacao_longa", "Paginação maior que o limite de segurança.");
  }

  turmas(): Promise<TurmaApi[]> {
    return this.todas((pagina) => this.get<RespostaTurmas>("/disciplinas", { incluir_arquivadas: false, tamanho: 100, pagina }), (r) => r.disciplinas, (r) => r.proxima_pagina);
  }

  atividades(courseId: string): Promise<AtividadeApi[]> {
    if (!ID.test(courseId)) throw new ErroClassroom(422, "identificador_invalido", "Turma inválida.");
    return this.todas((pagina) => this.get<RespostaAtividades>(`/disciplinas/${courseId}/atividades`, { tamanho: 50, ordenacao: "atualizadas", pagina }), (r) => r.itens, (r) => r.proxima_pagina);
  }

  entregas(courseId: string): Promise<EntregaApi[]> {
    if (!ID.test(courseId)) throw new ErroClassroom(422, "identificador_invalido", "Turma inválida.");
    return this.todas((pagina) => this.get<RespostaEntregas>(`/disciplinas/${courseId}/entregas`, { tamanho: 50, pagina }), (r) => r.entregas, (r) => r.proxima_pagina);
  }

  async detalhe(courseId: string, activityId: string): Promise<AtividadeApi> {
    if (!ID.test(courseId) || !ID.test(activityId)) throw new ErroClassroom(422, "identificador_invalido", "Atividade inválida.");
    const r = await this.get<RespostaDetalhe>(`/disciplinas/${courseId}/atividades/${activityId}`);
    if (!r.atividade || typeof r.atividade !== "object") throw new ErroClassroom(502, "resposta_invalida", "Resposta sem a atividade.");
    return r.atividade;
  }
}
