// Escritas da área "Mês" (Raio-X, metas e revisão), feitas pelo navegador com a RLS do usuário.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AREAS_PADRAO, type TipoMeta } from "@motor";

const falhar = (etapa: string, e: { message: string } | null) => {
  if (e) throw new Error(`${etapa}: ${e.message}`);
};

/* ---------- Raio-X ---------- */

/** Cria as áreas sugeridas na primeira vez (se a pessoa ainda não tem nenhuma). */
export async function garantirAreas(sb: SupabaseClient): Promise<{ id: string; nome: string; ordem: number }[]> {
  const { data, error } = await sb.from("raiox_areas").select("id, nome, ordem").order("ordem");
  falhar("Áreas do Raio-X", error);
  if (data?.length) return data;
  const { data: criadas, error: e2 } = await sb.from("raiox_areas")
    .insert(AREAS_PADRAO.map((nome, ordem) => ({ nome, ordem }))).select("id, nome, ordem").order("ordem");
  falhar("Criar áreas do Raio-X", e2);
  return criadas ?? [];
}

export async function criarArea(sb: SupabaseClient, nome: string, ordem: number) {
  const { data, error } = await sb.from("raiox_areas").insert({ nome: nome.trim(), ordem }).select("id, nome, ordem").single();
  falhar("Criar área", error);
  return data!;
}

export async function excluirArea(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("raiox_areas").delete().eq("id", id);
  falhar("Excluir área", error);
}

export interface CamposNota {
  importancia?: number | null; acao?: number | null; valor?: string | null; compromisso?: string | null;
  foco?: boolean; meta_acao?: number | null; como_medir?: string | null;
}

/** Grava (ou cria) a nota de uma área no mês. */
export async function salvarNota(sb: SupabaseClient, mes: string, areaId: string, campos: CamposNota) {
  const { error } = await sb.from("raiox_notas").upsert(
    { mes, area_id: areaId, ...campos, atualizado_em: new Date().toISOString() },
    { onConflict: "user_id,mes,area_id" },
  );
  falhar("Salvar Raio-X", error);
}

export async function salvarMesRaiox(sb: SupabaseClient, mes: string, campos: { o_que_sai?: string | null; checkin?: string | null }) {
  const { error } = await sb.from("raiox_meses").upsert({ mes, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "user_id,mes" });
  falhar("Salvar foco do mês", error);
}

/* ---------- Metas ---------- */

export interface DadosMeta {
  titulo: string; tipo: TipoMeta; alvo: number | null; unidade: string | null;
  habitoId: string | null; areaId: string | null; comoMedir: string | null;
}

export async function salvarMeta(sb: SupabaseClient, mes: string, d: DadosMeta, id?: string, origem: "manual" | "raiox" = "manual") {
  const linha = {
    titulo: d.titulo.trim(), tipo: d.tipo, alvo: d.tipo === "marco" ? null : d.alvo, unidade: d.tipo === "contagem" ? d.unidade?.trim() || null : d.tipo === "habito" ? "dias" : null,
    habit_id: d.tipo === "habito" ? d.habitoId : null, area_id: d.areaId, como_medir: d.comoMedir?.trim() || null,
  };
  const { error } = id
    ? await sb.from("metas").update(linha).eq("id", id)
    : await sb.from("metas").insert({ ...linha, mes, origem });
  falhar("Salvar meta", error);
}

export async function excluirMeta(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("metas").delete().eq("id", id);
  falhar("Excluir meta", error);
}

/** Contagem: soma (ou subtrai) do progresso, sem deixar negativo. */
export async function definirProgresso(sb: SupabaseClient, id: string, progresso: number) {
  const { error } = await sb.from("metas").update({ progresso: Math.max(0, progresso) }).eq("id", id);
  falhar("Atualizar meta", error);
}

export async function concluirMeta(sb: SupabaseClient, id: string, feita: boolean) {
  const { error } = await sb.from("metas").update({ concluida_em: feita ? new Date().toISOString() : null }).eq("id", id);
  falhar("Atualizar meta", error);
}

/* ---------- Revisão mensal ---------- */

export interface CamposRevisao { nota?: number | null; funcionou?: string | null; nao_funcionou?: string | null; aprendi?: string | null; foco_proximo?: string | null }

export async function salvarRevisao(sb: SupabaseClient, mes: string, campos: CamposRevisao) {
  const { error } = await sb.from("revisoes_mensais").upsert({ mes, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "user_id,mes" });
  falhar("Salvar revisão", error);
}
