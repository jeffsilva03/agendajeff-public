import { dataDaPagina } from "@/lib/data-da-pagina";
import { criarClienteServidor } from "@/lib/supabase/server";
import { configClassroom } from "@/lib/classroom/config";
import { TelaFaculdade, type Avaliacao, type DiaSemAula, type Disciplina, type Semestre } from "@/components/faculdade/tela-faculdade";
import { PainelClassroom, type ConexaoClassroom } from "@/components/faculdade/classroom/painel-classroom";
import type { AtividadeClassroom, TurmaClassroom } from "@/lib/classroom/painel";
import type { Falta } from "@/lib/faltas";

export default async function FaculdadePage({ searchParams }: PageProps<"/faculdade">) {
  const sp = await searchParams;
  const { data: hoje } = dataDaPagina(sp.data);
  const sb = await criarClienteServidor();

  if (sp.aba === "classroom") {
    const [conexao, turmas, atividades, semestres, disciplinas, avaliacoes] = await Promise.all([
      sb.from("classroom_conexoes").select("estado, identidade, conectado_em, auto_sync, sync_iniciada_em, ultima_sync_em, ultima_sync_ok_em, ultima_sync_resultado").maybeSingle(),
      sb.from("classroom_turmas").select("id, course_id, nome, estado, aliases, link, acompanhar, nome_exibicao, disciplina_id, ultima_sync_ok_em, ultimo_erro").order("nome"),
      sb.from("classroom_atividades").select("*"),
      sb.from("semestres").select("id, nome, inicio, fim").order("inicio", { ascending: false }),
      sb.from("disciplinas").select("id, nome, semestre_id").order("nome"),
      sb.from("avaliacoes").select("id, disciplina_id, tipo, titulo, data, hora, entregue").order("data"),
    ]);
    for (const r of [conexao, turmas, atividades, semestres, disciplinas, avaliacoes]) if (r.error) throw new Error(`Falha ao carregar o Classroom: ${r.error.message}`);
    const erro = typeof sp.erro === "string" ? sp.erro : null;
    return (
      <PainelClassroom key={`${conexao.data?.ultima_sync_em ?? ""}`} hoje={hoje} configurado={!!configClassroom()}
        conexao={(conexao.data ?? null) as ConexaoClassroom | null}
        turmas={(turmas.data ?? []) as TurmaClassroom[]}
        atividades={(atividades.data ?? []) as AtividadeClassroom[]}
        semestres={(semestres.data ?? []) as Semestre[]}
        disciplinas={disciplinas.data ?? []}
        avaliacoes={avaliacoes.data ?? []}
        aviso={sp.conectado === "1" ? "conectado" : erro} />
    );
  }

  const [semestres, disciplinas, avaliacoes, faltas, semAula] = await Promise.all([
    sb.from("semestres").select("id, nome, inicio, fim").order("inicio", { ascending: false }),
    sb.from("disciplinas").select("id, semestre_id, nome, professor, sala, cor, aulas(id, dia_semana, inicio, fim)").order("nome"),
    sb.from("avaliacoes").select("id, disciplina_id, tipo, titulo, data, hora, descricao, entregue, nota").order("data"),
    sb.from("faltas").select("id, data, disciplina_id, motivo, evento_id").order("data", { ascending: false }),
    sb.from("events").select("id, titulo, data").eq("tipo", "excecao_rotina").contains("efeito", { sem_aula: true }).not("data", "is", null).order("data"),
  ]);
  for (const r of [semestres, disciplinas, avaliacoes, faltas, semAula]) if (r.error) throw new Error(`Falha ao carregar a faculdade: ${r.error.message}`);
  return (
    <TelaFaculdade hoje={hoje}
      semestres={(semestres.data ?? []) as Semestre[]}
      disciplinas={(disciplinas.data ?? []) as Disciplina[]}
      avaliacoes={(avaliacoes.data ?? []) as Avaliacao[]}
      faltas={(faltas.data ?? []) as Falta[]}
      diasSemAula={(semAula.data ?? []) as DiaSemAula[]} />
  );
}
