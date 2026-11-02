import { dentroDaJanela, diaDaSemana, horaCurta } from "./datas.ts";
import { ocorrenciasDePrazos } from "./prazos.ts";
import type { Contexto, DiaResolvido, Habito } from "./tipos.ts";

/**
 * Resolve um dia: quais cadeias valem, quais hábitos viram flexíveis,
 * compromissos, avisos de colisão e prazos.
 *
 * Regras do motor compartilhado:
 * - Cadeia vale se o dia da semana bate e, se depende de aula, se há aula.
 * - Não há aula num dia letivo quando existe exceção "sem_aula" ou feriado ativo,
 *   a menos que uma exceção "com_aula" desfaça o feriado.
 * - Hábitos das cadeias que caíram por falta de aula viram flexíveis do dia,
 *   somados às regras fixas (dia útil sem aula / fim de semana).
 * - Compromisso que começa dentro da janela de uma cadeia ativa gera aviso.
 */
export function resolverDia(data: string, ctx: Contexto): DiaResolvido {
  const w = diaDaSemana(data);
  const H = new Map(ctx.habitos.map((h) => [h.id, h]));
  const doDia = ctx.eventos.filter((e) => e.data === data);
  const excecoes = doDia.filter((e) => e.tipo === "excecao_rotina");
  const feriado = ctx.feriados.find((f) => f.ativo && f.data === data);

  const diaDeAula = ctx.diasDeAula.includes(w);
  const excecaoSemAula = excecoes.find((e) => e.efeito?.sem_aula);
  const desfazFeriado = excecoes.some((e) => e.efeito?.com_aula);
  let motivoSemAula: string | null = null;
  if (diaDeAula) {
    if (excecaoSemAula) motivoSemAula = excecaoSemAula.titulo;
    else if (feriado && !desfazFeriado) motivoSemAula = `Feriado: ${feriado.nome}`;
  }
  const temAula = diaDeAula && !motivoSemAula;
  // Vale também para aula de sábado: exceção "sem aula" ou feriado tiram as aulas do dia.
  const semAulaNoDia = !!excecaoSemAula || (!!feriado && !desfazFeriado);
  const aulas = semAulaNoDia ? [] : (ctx.aulas ?? [])
    .filter((a) => a.diaSemana === w && data >= a.semestreInicio && data <= a.semestreFim)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const doDiaDaSemana = ctx.cadeias.filter((c) => c.diasSemana.includes(w));
  const cadeias = doDiaDaSemana
    .filter((c) => !c.dependeAula || temAula)
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ ...c, passos: [...c.passos].sort((a, b) => a.posicao - b.posicao) }));

  const naCadeia = new Set(cadeias.flatMap((c) => c.passos.map((p) => p.habitoId)));
  const idsFlex: string[] = [];
  if (diaDeAula && !temAula) {
    for (const c of doDiaDaSemana.filter((c) => c.dependeAula).sort((a, b) => a.ordem - b.ordem))
      for (const p of [...c.passos].sort((a, b) => a.posicao - b.posicao)) idsFlex.push(p.habitoId);
  }
  const contexto = diaDeAula ? (temAula ? null : "dia_util_sem_aula") : "fim_de_semana";
  for (const r of ctx.regrasFlex.filter((r) => r.contexto === contexto)) idsFlex.push(...r.habitoIds);
  const flexiveis = [...new Set(idsFlex)]
    .filter((id) => !naCadeia.has(id))
    .map((id) => H.get(id))
    .filter((h): h is Habito => !!h && (!h.somenteDomingo || w === 0));

  const compromissos = doDia
    .filter((e) => e.tipo === "compromisso")
    .sort((a, b) => (a.inicio ?? "99").localeCompare(b.inicio ?? "99"));

  const avisos = [];
  for (const e of compromissos) {
    if (!e.inicio) continue;
    for (const c of cadeias) {
      if (c.janelaInicio && c.janelaFim && dentroDaJanela(e.inicio, c.janelaInicio, c.janelaFim))
        avisos.push({ cadeiaId: c.id, eventoId: e.id, texto: `${e.titulo} às ${horaCurta(e.inicio)} colide com a cadeia ${c.nome}` });
    }
  }

  return {
    data, diaSemana: w, diaDeAula, temAula, motivoSemAula,
    cadeias, flexiveis, compromissos, avisos,
    prazos: ocorrenciasDePrazos(ctx.eventos, data, data),
    aulas,
  };
}
