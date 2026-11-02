// Guarda e entrega os tokens do Auth0 (cifrados, só service role). Renova sozinho perto de expirar.
//
// Renovação concorrente: com a rotação de refresh token do Auth0, cada refresh token vale uma vez; reusar um já
// trocado é tratado como roubo e revoga toda a família (a conexão cai). Por isso:
// - no mesmo processo, uma renovação por vez (as chamadas simultâneas esperam a mesma promessa);
// - entre processos (sincronização, detalhe, cron), uma trava no banco (renovacao_iniciada_em) com atualização
//   condicional; quem não pega a trava espera e relê o token que o outro gravou.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { ErroAuth, renovarTokens, type Tokens } from "./auth0";
import { cifrar, decifrar } from "./cripto";
import type { ConfigClassroom } from "./config";

/** Cliente com a secret key: só para as tabelas da integração, sempre filtrando pelo usuário já validado. */
export function clienteAdmin(): SupabaseClient {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("SUPABASE_SECRET_KEY ausente no servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ctx = (userId: string, tipo: string) => `classroom:${userId}:${tipo}`;
const MARGEM_MS = 120_000;      // renova quando falta menos de 2 min
const TRAVA_RENOVACAO_MS = 30_000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function salvarTokens(admin: SupabaseClient, cfg: ConfigClassroom, userId: string, t: Tokens, refreshAnterior?: string | null) {
  // Com rotação, o Auth0 manda um refresh novo a cada troca e ele substitui o anterior; sem rotação, mantém o anterior.
  const refresh = t.refreshToken ?? refreshAnterior ?? null;
  const linha = {
    user_id: userId, access_token: cifrar(t.accessToken, cfg.chave, ctx(userId, "access")),
    refresh_token: refresh ? cifrar(refresh, cfg.chave, ctx(userId, "refresh")) : null,
    expira_em: t.expiraEm.toISOString(), escopo: t.escopo, renovacao_iniciada_em: null, atualizado_em: new Date().toISOString(),
  };
  // O refresh novo já invalidou o antigo no Auth0: perder esta gravação derrubaria a conexão. Tenta de novo antes de desistir.
  for (let tentativa = 0; ; tentativa++) {
    const { error } = await admin.from("classroom_tokens").upsert(linha);
    if (!error) return;
    if (tentativa >= 2) throw new Error(`Falha ao guardar a autorização: ${error.message}`);
    await espera(500 * (tentativa + 1));
  }
}

export async function marcarReconectar(admin: SupabaseClient, userId: string) {
  await admin.from("classroom_conexoes").update({ estado: "reconectar", atualizado_em: new Date().toISOString() }).eq("user_id", userId);
}

interface Guardado { access_token: string; refresh_token: string | null; expira_em: string; renovacao_iniciada_em: string | null; atualizado_em: string }

/** Fornecedor de access token para o cliente REST. forcar=true: o token atual foi recusado (401). */
export function fornecedorDeToken(admin: SupabaseClient, cfg: ConfigClassroom, userId: string) {
  let cache: { token: string; expira: number } | null = null;
  let emAndamento: Promise<string> | null = null;

  const ler = async (): Promise<Guardado> => {
    const { data, error } = await admin.from("classroom_tokens").select("access_token, refresh_token, expira_em, renovacao_iniciada_em, atualizado_em").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Falha ao ler a autorização: ${error.message}`);
    if (!data) throw new ErroAuth("negado", "Classroom não conectado.");
    return data as Guardado;
  };
  const usar = (g: Guardado) => {
    cache = { token: decifrar(g.access_token, cfg.chave, ctx(userId, "access")), expira: Date.parse(g.expira_em) };
    return cache.token;
  };

  async function obter(forcar: boolean): Promise<string> {
    const recusado = forcar ? cache?.token ?? null : null;
    for (let volta = 0; volta < 25; volta++) {
      const g = await ler();
      const atual = decifrar(g.access_token, cfg.chave, ctx(userId, "access"));
      const valido = Date.parse(g.expira_em) - Date.now() > MARGEM_MS;
      // Outro processo já renovou (o guardado é diferente do recusado) ou o guardado ainda vale: usa.
      if (valido && (!recusado || atual !== recusado)) return usar(g);
      if (!g.refresh_token) { await marcarReconectar(admin, userId); throw new ErroAuth("negado", "A autorização expirou. Conecte o Classroom de novo."); }

      // Pega a trava só se ninguém renovou desde a leitura (atualizado_em igual) e não há trava viva.
      const vencida = new Date(Date.now() - TRAVA_RENOVACAO_MS).toISOString();
      const { data: trava, error } = await admin.from("classroom_tokens").update({ renovacao_iniciada_em: new Date().toISOString() })
        .eq("user_id", userId).eq("atualizado_em", g.atualizado_em).or(`renovacao_iniciada_em.is.null,renovacao_iniciada_em.lt.${vencida}`).select("user_id");
      if (error) throw new Error(`Falha na trava da renovação: ${error.message}`);
      if (!trava?.length) { await espera(400); continue; } // outro está renovando: espera e relê

      const refresh = decifrar(g.refresh_token, cfg.chave, ctx(userId, "refresh"));
      try {
        const novos = await renovarTokens(cfg, refresh);
        await salvarTokens(admin, cfg, userId, novos, refresh); // grava o refresh novo e solta a trava
        cache = { token: novos.accessToken, expira: novos.expiraEm.getTime() };
        return novos.accessToken;
      } catch (e) {
        await admin.from("classroom_tokens").update({ renovacao_iniciada_em: null }).eq("user_id", userId);
        if (e instanceof ErroAuth && e.codigo !== "indisponivel") await marcarReconectar(admin, userId);
        throw e;
      }
    }
    throw new ErroAuth("indisponivel", "A renovação da autorização demorou demais. Tente de novo.");
  }

  return (forcar = false): Promise<string> => {
    if (!forcar && cache && cache.expira - Date.now() > MARGEM_MS) return Promise.resolve(cache.token);
    // Uma por vez neste processo: quem chega durante uma renovação espera o mesmo resultado.
    if (!emAndamento) emAndamento = obter(forcar).finally(() => { emAndamento = null; });
    return emAndamento;
  };
}
