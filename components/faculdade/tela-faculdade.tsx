"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarOff, Check, GraduationCap, MapPin, Pencil, Plus, Trash2, Undo2, User, UserX } from "lucide-react";
import { diaDaSemana, diasEntre, horaCurta, mediaNotas, ROTULO_AVALIACAO, semestreAtual, type TipoAvaliacao } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import {
  excluirAvaliacao, excluirDisciplina, excluirEvento, marcarAvaliacao, removerFalta, salvarAvaliacao, salvarDisciplina, salvarSemestre,
  type DadosAvaliacao, type Horario,
} from "@/lib/mutacoes";
import { CORES_DISCIPLINA, corDisciplina, diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cabecalho } from "@/components/app/cabecalho";
import { faltasPorDisciplina, type AulaDaGrade, type Falta } from "@/lib/faltas";
import { DialogoFalta, DialogoSemAula } from "./dialogos-aula";
import { AbasFaculdade } from "./abas-faculdade";

export interface Semestre { id: string; nome: string; inicio: string; fim: string }
export interface Disciplina {
  id: string; semestre_id: string; nome: string; professor: string | null; sala: string | null; cor: string;
  aulas: { id: string; dia_semana: number; inicio: string; fim: string }[];
}
export interface DiaSemAula { id: string; titulo: string; data: string }
export interface Avaliacao {
  id: string; disciplina_id: string | null; tipo: TipoAvaliacao; titulo: string; data: string; hora: string | null;
  descricao: string | null; entregue: boolean; nota: number | null;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const hm = (t: string) => t.slice(0, 5);
const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ESTILO_TIPO: Record<TipoAvaliacao, string> = {
  prova: "bg-destructive/15 text-destructive",
  trabalho: "bg-tag-tarde/15 text-tag-tarde",
  atividade: "bg-secondary text-muted-foreground",
};

export function TelaFaculdade({ hoje, semestres, disciplinas, avaliacoes, faltas, diasSemAula }: {
  hoje: string; semestres: Semestre[]; disciplinas: Disciplina[]; avaliacoes: Avaliacao[]; faltas: Falta[]; diasSemAula: DiaSemAula[];
}) {
  const router = useRouter();
  const sb = criarClienteNavegador();
  const novo = useSearchParams().get("novo");
  const atual = semestreAtual(semestres, hoje);
  const [semestreId, setSemestreId] = useState(atual?.id ?? "");
  const semestre = semestres.find((s) => s.id === semestreId) ?? null;
  const [edSemestre, setEdSemestre] = useState<Semestre | "novo" | null>(null);
  const [edDisciplina, setEdDisciplina] = useState<Disciplina | "nova" | null>(null);
  const [edAvaliacao, setEdAvaliacao] = useState<Avaliacao | "nova" | null>(novo === "avaliacao" ? "nova" : null);
  const [verEntregues, setVerEntregues] = useState(false);
  const [ausencia, setAusencia] = useState<"sem_aula" | "falta" | null>(novo === "falta" ? "falta" : novo === "sem_aula" ? "sem_aula" : null);
  const [verTodasFaltas, setVerTodasFaltas] = useState(false);

  const doSemestre = disciplinas.filter((d) => d.semestre_id === semestreId);
  const porId = new Map(disciplinas.map((d) => [d.id, d]));
  const pendentes = avaliacoes.filter((a) => !a.entregue);
  const entregues = avaliacoes.filter((a) => a.entregue).sort((a, b) => b.data.localeCompare(a.data));
  const atualizar = () => router.refresh();
  const semestrePorId = new Map(semestres.map((s) => [s.id, s]));
  const grade: AulaDaGrade[] = disciplinas.flatMap((d) => {
    const s = semestrePorId.get(d.semestre_id);
    return s ? d.aulas.map((a) => ({ disciplinaId: d.id, disciplina: d.nome, diaSemana: a.dia_semana, inicio: a.inicio, semestreInicio: s.inicio, semestreFim: s.fim })) : [];
  });
  const contagemFaltas = faltasPorDisciplina(faltas);
  // Dias sem aula: os próximos e os dos últimos 30 dias (os criados por "Faltei" aparecem junto das faltas).
  const ligadosAFalta = new Set(faltas.map((f) => f.evento_id).filter(Boolean));
  const semAulaVisiveis = diasSemAula.filter((d) => !ligadosAFalta.has(d.id) && diasEntre(d.data, hoje) <= 30);
  const faltasVisiveis = verTodasFaltas ? faltas : faltas.slice(0, 5);

  async function apagar(f: () => Promise<void>, ok: string) {
    try { await f(); toast.success(ok); atualizar(); } catch (e) { toast.error((e as Error).message); }
  }

  async function alternarEntrega(a: Avaliacao) {
    try {
      await marcarAvaliacao(sb, a.id, !a.entregue);
      toast.success(a.entregue ? `${a.titulo} voltou para pendentes.` : `${a.titulo}: ${a.tipo === "prova" ? "feita" : "entregue"}.`);
      atualizar();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <Cabecalho titulo="Faculdade"
        acoes={
          <>
            <Button variant="outline" size="sm" onClick={() => setEdDisciplina("nova")} disabled={!semestre}><Plus className="size-4" /> Disciplina</Button>
            <Button variant="outline" size="sm" onClick={() => setAusencia("sem_aula")}><CalendarOff className="size-4" /> Dia sem aula</Button>
            <Button variant="outline" size="sm" onClick={() => setAusencia("falta")}><UserX className="size-4" /> Faltei</Button>
            <Button size="sm" onClick={() => setEdAvaliacao("nova")}><Plus className="size-4" /> Prova ou trabalho</Button>
          </>
        }>
        Cronograma de aulas e avaliações. Tudo aparece na Agenda; provas e trabalhos também nos lembretes.
      </Cabecalho>
      <AbasFaculdade atual="geral" />

      <div className="space-y-8 px-4 pb-16 md:px-8">
        <section aria-label="Semestre" className="flex flex-wrap items-center gap-2">
          {semestres.length > 0 ? (
            <>
              <Select value={semestreId} onValueChange={setSemestreId}>
                <SelectTrigger className="w-56" aria-label="Semestre"><SelectValue /></SelectTrigger>
                <SelectContent>{semestres.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
              {semestre && <span className="numeros text-sm text-muted-foreground">{diaMes(semestre.inicio)} a {diaMes(semestre.fim)}{semestre.id === atual?.id && hoje >= semestre.inicio && hoje <= semestre.fim ? ", em andamento" : ""}</span>}
              {semestre && <Button variant="ghost" size="sm" onClick={() => setEdSemestre(semestre)}><Pencil className="size-3.5" /> Editar</Button>}
            </>
          ) : <span className="text-sm text-muted-foreground">Nenhum semestre cadastrado.</span>}
          <Button variant="ghost" size="sm" onClick={() => setEdSemestre("novo")}><Plus className="size-3.5" /> Novo semestre</Button>
        </section>

        <section aria-labelledby="t-avaliacoes" className="space-y-3">
          <h2 id="t-avaliacoes" className="text-base font-semibold">Provas, trabalhos e atividades</h2>
          {pendentes.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nada pendente. Cadastre a próxima prova ou entrega para ela aparecer na agenda.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pendentes.map((a) => {
                const d = a.disciplina_id ? porId.get(a.disciplina_id) : null;
                const faltam = diasEntre(hoje, a.data);
                return (
                  <li key={a.id} className="flex gap-3 rounded-xl border bg-card p-3">
                    <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: corDisciplina(d?.cor) }} aria-hidden />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdAvaliacao(a)}>
                      <span className="flex items-center gap-2 text-xs">
                        <span className={cn("rounded px-1.5 py-0.5 font-medium", ESTILO_TIPO[a.tipo])}>{ROTULO_AVALIACAO[a.tipo]}</span>
                        <span className="truncate text-muted-foreground">{d?.nome ?? "Sem disciplina"}</span>
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium">{a.titulo}</span>
                      <span className={cn("numeros mt-0.5 flex items-center gap-1 text-xs text-muted-foreground", faltam < 0 && "text-destructive", faltam >= 0 && faltam <= 3 && "text-aviso")}>
                        <CalendarClock className="size-3.5" aria-hidden />
                        {DIAS_LONGOS[diaDaSemana(a.data)]}, {diaMes(a.data)}{a.hora ? ` às ${horaCurta(hm(a.hora))}` : ""}
                        {faltam < 0 ? `, atrasada ${-faltam} d` : faltam === 0 ? ", hoje" : faltam === 1 ? ", amanhã" : `, em ${faltam} dias`}
                      </span>
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`Marcar ${a.titulo} como ${a.tipo === "prova" ? "feita" : "entregue"}`} onClick={() => alternarEntrega(a)}>
                      <Check className="size-4 text-feito" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {entregues.length > 0 && (
            <div>
              <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setVerEntregues((v) => !v)}>
                {verEntregues ? "Esconder" : "Ver"} concluídas ({entregues.length})
              </button>
              {verEntregues && (
                <ul className="mt-2 divide-y rounded-xl border">
                  {entregues.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="numeros w-12 shrink-0 text-muted-foreground">{diaMes(a.data)}</span>
                      <span className="min-w-0 flex-1 truncate"><span className="text-muted-foreground">{ROTULO_AVALIACAO[a.tipo]}: </span>{a.titulo}</span>
                      {a.nota !== null && <span className="numeros font-medium">{Number(a.nota).toLocaleString("pt-BR")}</span>}
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Editar" onClick={() => setEdAvaliacao(a)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Voltar para pendentes" onClick={() => alternarEntrega(a)}><Undo2 className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="t-ausencias" className="space-y-3">
          <h2 id="t-ausencias" className="text-base font-semibold">Dias sem aula e faltas</h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium"><CalendarOff className="size-4 text-muted-foreground" aria-hidden /> Dias sem aula</h3>
                <Button variant="ghost" size="sm" onClick={() => setAusencia("sem_aula")}><Plus className="size-3.5" /> Marcar</Button>
              </div>
              {semAulaVisiveis.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhum marcado. Professor faltou, aula cancelada, recesso: marque aqui e a rotina do dia se ajusta.</p> : (
                <ul className="mt-2 divide-y">
                  {semAulaVisiveis.map((d) => (
                    <li key={d.id} className={cn("flex items-center gap-3 py-1.5 text-sm", d.data < hoje && "text-muted-foreground")}>
                      <span className="numeros w-24 shrink-0">{DIAS[diaDaSemana(d.data)]}, {diaMes(d.data)}</span>
                      <span className="min-w-0 flex-1 truncate">{d.titulo}</span>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Desfazer sem aula de ${diaMes(d.data)}`} onClick={() => apagar(() => excluirEvento(sb, d.id), `${diaMes(d.data)} voltou a ter aula.`)}><Undo2 className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium"><UserX className="size-4 text-muted-foreground" aria-hidden /> Faltas <span className="numeros font-normal text-muted-foreground">{faltas.length}</span></h3>
                <Button variant="ghost" size="sm" onClick={() => setAusencia("falta")}><Plus className="size-3.5" /> Registrar</Button>
              </div>
              {faltas.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma falta registrada.</p> : (
                <>
                  <ul className="mt-2 divide-y">
                    {faltasVisiveis.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 py-1.5 text-sm">
                        <span className="numeros w-24 shrink-0 text-muted-foreground">{DIAS[diaDaSemana(f.data)]}, {diaMes(f.data)}</span>
                        <span className="min-w-0 flex-1 truncate">{porId.get(f.disciplina_id)?.nome ?? "Disciplina"}{f.motivo && <span className="text-muted-foreground"> · {f.motivo}</span>}</span>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Apagar falta de ${diaMes(f.data)}`} onClick={() => apagar(() => removerFalta(sb, f), "Falta apagada.")}><Trash2 className="size-3.5" /></Button>
                      </li>
                    ))}
                  </ul>
                  {faltas.length > 5 && <button type="button" className="mt-1 text-xs text-muted-foreground underline underline-offset-4" onClick={() => setVerTodasFaltas((v) => !v)}>{verTodasFaltas ? "Ver menos" : `Ver todas (${faltas.length})`}</button>}
                </>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="t-grade" className="space-y-3">
          <h2 id="t-grade" className="text-base font-semibold">Grade semanal</h2>
          {doSemestre.some((d) => d.aulas.length) ? <Grade disciplinas={doSemestre} /> : (
            <div className="grid place-items-center rounded-xl border border-dashed px-6 py-10 text-center">
              <GraduationCap className="size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium">Sua grade aparece aqui</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Cadastre as disciplinas do semestre com dia e horário. Quando o semestre mudar, crie um novo e cadastre as novas.</p>
              {semestre && <Button className="mt-4" size="sm" onClick={() => setEdDisciplina("nova")}><Plus className="size-4" /> Cadastrar disciplina</Button>}
            </div>
          )}
        </section>

        {doSemestre.length > 0 && (
          <section aria-labelledby="t-disc" className="space-y-3">
            <h2 id="t-disc" className="text-base font-semibold">Disciplinas</h2>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {doSemestre.map((d) => {
                const prox = pendentes.filter((a) => a.disciplina_id === d.id).length;
                const notas = avaliacoes.filter((a) => a.disciplina_id === d.id && a.nota !== null).map((a) => Number(a.nota));
                const media = mediaNotas(notas);
                const nFaltas = contagemFaltas.get(d.id) ?? 0;
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => setEdDisciplina(d)} className="flex w-full gap-3 rounded-xl border bg-card p-3 text-left hover:border-input">
                      <span className="mt-0.5 size-3 shrink-0 rounded-full" style={{ background: corDisciplina(d.cor) }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.nome}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {d.professor && <span className="flex items-center gap-1"><User className="size-3" aria-hidden />{d.professor}</span>}
                          {d.sala && <span className="flex items-center gap-1"><MapPin className="size-3" aria-hidden />{d.sala}</span>}
                        </span>
                        <span className="numeros mt-1 block text-xs text-muted-foreground">
                          {d.aulas.length ? [...d.aulas].sort((a, b) => a.dia_semana - b.dia_semana || a.inicio.localeCompare(b.inicio)).map((a) => `${DIAS[a.dia_semana]} ${horaCurta(hm(a.inicio))}–${horaCurta(hm(a.fim))}`).join(", ") : "sem horário"}
                        </span>
                        {prox > 0 && <span className="mt-1 block text-xs text-aviso">{prox} {prox === 1 ? "avaliação pendente" : "avaliações pendentes"}</span>}
                        {nFaltas > 0 && <span className="numeros mt-1 block text-xs text-muted-foreground">{nFaltas} {nFaltas === 1 ? "falta" : "faltas"}</span>}
                        {media !== null && <span className="numeros mt-1 block text-xs">Média <span className="font-semibold">{media.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span> <span className="text-muted-foreground">({notas.length} {notas.length === 1 ? "nota" : "notas"}, média simples)</span></span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {edSemestre && (
        <DialogoSemestre key={edSemestre === "novo" ? "novo" : edSemestre.id} semestre={edSemestre === "novo" ? null : edSemestre} onFechar={() => setEdSemestre(null)}
          onSalvar={async (d) => { const id = await salvarSemestre(sb, d, edSemestre === "novo" ? undefined : edSemestre.id); setSemestreId(id); atualizar(); }} />
      )}
      {edDisciplina && semestre && (
        <DialogoDisciplina key={edDisciplina === "nova" ? "nova" : edDisciplina.id} disciplina={edDisciplina === "nova" ? null : edDisciplina} onFechar={() => setEdDisciplina(null)}
          onSalvar={async (d, h) => { await salvarDisciplina(sb, { ...d, semestreId: semestre.id }, h, edDisciplina === "nova" ? undefined : edDisciplina.id); atualizar(); }}
          onExcluir={edDisciplina !== "nova" ? async () => { await excluirDisciplina(sb, edDisciplina.id); atualizar(); } : undefined} />
      )}
      {ausencia === "sem_aula" && <DialogoSemAula dataInicial={hoje} aulas={grade} onFechar={() => setAusencia(null)} onFeito={atualizar} />}
      {ausencia === "falta" && (
        <DialogoFalta dataInicial={hoje} hoje={hoje} aulas={grade} disciplinas={(doSemestre.length ? doSemestre : disciplinas).map((d) => ({ id: d.id, nome: d.nome }))}
          onFechar={() => setAusencia(null)} onFeito={atualizar} />
      )}
      {edAvaliacao && (
        <DialogoAvaliacao key={edAvaliacao === "nova" ? "nova" : edAvaliacao.id} avaliacao={edAvaliacao === "nova" ? null : edAvaliacao}
          disciplinas={doSemestre.length ? doSemestre : disciplinas} hoje={hoje} onFechar={() => setEdAvaliacao(null)}
          onSalvar={async (d, nota) => {
            const id = edAvaliacao === "nova" ? undefined : edAvaliacao.id;
            await salvarAvaliacao(sb, d, id);
            if (id && nota !== undefined) await marcarAvaliacao(sb, id, (edAvaliacao as Avaliacao).entregue, nota);
            atualizar();
          }}
          onExcluir={edAvaliacao !== "nova" ? async () => { await excluirAvaliacao(sb, edAvaliacao.id); atualizar(); } : undefined} />
      )}
    </>
  );
}

/** Grade semanal: colunas por dia, blocos posicionados pelo horário. No celular, lista por dia. */
function Grade({ disciplinas }: { disciplinas: Disciplina[] }) {
  const aulas = disciplinas.flatMap((d) => d.aulas.map((a) => ({ ...a, d })));
  const dias = [1, 2, 3, 4, 5, ...(aulas.some((a) => a.dia_semana === 6) ? [6] : []), ...(aulas.some((a) => a.dia_semana === 0) ? [0] : [])];
  const ini = Math.floor(Math.min(...aulas.map((a) => min(a.inicio))) / 60) * 60;
  const fim = Math.ceil(Math.max(...aulas.map((a) => min(a.fim))) / 60) * 60;
  const pxMin = 0.9;
  const horas = Array.from({ length: (fim - ini) / 60 + 1 }, (_, i) => ini + i * 60);

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <div className="grid border-b bg-superficie text-xs text-muted-foreground" style={{ gridTemplateColumns: `3.5rem repeat(${dias.length}, minmax(0, 1fr))` }}>
          <span />
          {dias.map((w) => <span key={w} className="py-2 text-center font-medium">{DIAS[w]}</span>)}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${dias.length}, minmax(0, 1fr))`, height: (fim - ini) * pxMin }}>
          <div className="relative">
            {horas.map((h) => (
              <span key={h} className="numeros absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (h - ini) * pxMin }}>{h / 60}h</span>
            ))}
          </div>
          {dias.map((w) => (
            <div key={w} className="relative border-l">
              {horas.slice(1, -1).map((h) => <span key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: (h - ini) * pxMin }} aria-hidden />)}
              {aulas.filter((a) => a.dia_semana === w).map((a) => (
                <div key={a.id} className="absolute inset-x-1 overflow-hidden rounded-md border bg-card px-2 py-1.5 text-xs"
                  style={{ top: (min(a.inicio) - ini) * pxMin + 1, height: (min(a.fim) - min(a.inicio)) * pxMin - 2, borderLeft: `3px solid ${corDisciplina(a.d.cor)}` }}
                  title={`${a.d.nome}, ${hm(a.inicio)}–${hm(a.fim)}${a.d.sala ? `, ${a.d.sala}` : ""}`}>
                  <p className="truncate font-medium">{a.d.nome}</p>
                  <p className="numeros truncate text-muted-foreground">{horaCurta(hm(a.inicio))}–{horaCurta(hm(a.fim))}{a.d.sala ? `, ${a.d.sala}` : ""}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <ol className="space-y-3 md:hidden">
        {dias.filter((w) => aulas.some((a) => a.dia_semana === w)).map((w) => (
          <li key={w}>
            <p className="mb-1 text-xs font-medium text-muted-foreground first-letter:uppercase">{DIAS_LONGOS[w]}</p>
            <ul className="space-y-1.5">
              {aulas.filter((a) => a.dia_semana === w).sort((a, b) => a.inicio.localeCompare(b.inicio)).map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm" style={{ borderLeft: `3px solid ${corDisciplina(a.d.cor)}` }}>
                  <span className="numeros w-24 shrink-0 text-xs text-muted-foreground">{horaCurta(hm(a.inicio))}–{horaCurta(hm(a.fim))}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.d.nome}</span>
                  {a.d.sala && <span className="shrink-0 text-xs text-muted-foreground">{a.d.sala}</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

async function enviar(f: () => Promise<void>, ok: string, fechar: () => void, setOcupado: (b: boolean) => void) {
  setOcupado(true);
  try { await f(); toast.success(ok); fechar(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
}

function DialogoSemestre({ semestre, onFechar, onSalvar }: { semestre: Semestre | null; onFechar: () => void; onSalvar: (d: { nome: string; inicio: string; fim: string }) => Promise<void> }) {
  const [nome, setNome] = useState(semestre?.nome ?? "");
  const [inicio, setInicio] = useState(semestre?.inicio ?? "");
  const [fim, setFim] = useState(semestre?.fim ?? "");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{semestre ? "Editar semestre" : "Novo semestre"}</DialogTitle>
          <DialogDescription>As aulas das disciplinas só aparecem entre o início e o fim do semestre.</DialogDescription>
        </DialogHeader>
        <form id="form-semestre" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (fim < inicio) { toast.error("O fim precisa ser depois do início."); return; }
          enviar(() => onSalvar({ nome, inicio, fim }), semestre ? "Semestre salvo." : "Semestre criado.", onFechar, setOcupado);
        }}>
          <div className="space-y-1.5"><Label htmlFor="s-nome" className="text-[13px]">Nome</Label><Input id="s-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 1º semestre de 2027" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="s-ini" className="text-[13px]">Início</Label><Input id="s-ini" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-fim" className="text-[13px]">Fim</Label><Input id="s-fim" type="date" required value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
        </form>
        <DialogFooter><Button type="submit" form="form-semestre" disabled={ocupado}>{semestre ? "Salvar" : "Criar semestre"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoDisciplina({ disciplina, onFechar, onSalvar, onExcluir }: {
  disciplina: Disciplina | null; onFechar: () => void;
  onSalvar: (d: { nome: string; professor: string | null; sala: string | null; cor: string }, h: Horario[]) => Promise<void>;
  onExcluir?: () => Promise<void>;
}) {
  const [nome, setNome] = useState(disciplina?.nome ?? "");
  const [professor, setProfessor] = useState(disciplina?.professor ?? "");
  const [sala, setSala] = useState(disciplina?.sala ?? "");
  const [cor, setCor] = useState(disciplina?.cor ?? "azul");
  const [horarios, setHorarios] = useState<Horario[]>(
    disciplina?.aulas.map((a) => ({ diaSemana: a.dia_semana, inicio: hm(a.inicio), fim: hm(a.fim) })) ?? [{ diaSemana: 1, inicio: "18:30", fim: "22:50" }]);
  const [ocupado, setOcupado] = useState(false);
  const mudar = (i: number, p: Partial<Horario>) => setHorarios((l) => l.map((h, k) => (k === i ? { ...h, ...p } : h)));

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{disciplina ? "Editar disciplina" : "Nova disciplina"}</DialogTitle>
          <DialogDescription>Dia e horário de cada aula da semana.</DialogDescription>
        </DialogHeader>
        <form id="form-disc" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (horarios.some((h) => !h.inicio || !h.fim || h.fim <= h.inicio)) { toast.error("Cada horário precisa de início e fim, com o fim depois do início."); return; }
          enviar(() => onSalvar({ nome, professor, sala, cor }, horarios), disciplina ? "Disciplina salva." : "Disciplina cadastrada.", onFechar, setOcupado);
        }}>
          <div className="space-y-1.5"><Label htmlFor="d-nome" className="text-[13px]">Nome</Label><Input id="d-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco de Dados" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="d-prof" className="text-[13px]">Professor(a)</Label><Input id="d-prof" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Opcional" /></div>
            <div className="space-y-1.5"><Label htmlFor="d-sala" className="text-[13px]">Sala</Label><Input id="d-sala" value={sala} onChange={(e) => setSala(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">Cor</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CORES_DISCIPLINA).map(([k, v]) => (
                <button key={k} type="button" aria-label={v.nome} aria-pressed={cor === k} onClick={() => setCor(k)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", cor === k && "ring-2 ring-foreground")} style={{ background: v.hex }} />
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Horários</legend>
            {horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label="Dia da semana" value={h.diaSemana} onChange={(e) => mudar(i, { diaSemana: Number(e.target.value) })}
                  className="h-9 rounded-md border bg-transparent px-2 text-sm">
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{DIAS_LONGOS[w]}</option>)}
                </select>
                <Input type="time" aria-label="Início" value={h.inicio} onChange={(e) => mudar(i, { inicio: e.target.value })} className="w-28" />
                <span className="text-muted-foreground">até</span>
                <Input type="time" aria-label="Fim" value={h.fim} onChange={(e) => mudar(i, { fim: e.target.value })} className="w-28" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remover horário" onClick={() => setHorarios((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setHorarios((l) => [...l, { diaSemana: 1, inicio: "18:30", fim: "20:30" }])}>
              <Plus className="size-4" /> Adicionar horário
            </Button>
          </fieldset>
        </form>
        <DialogFooter className="sm:justify-between">
          {onExcluir ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado}
              onClick={() => confirm(`Excluir ${disciplina?.nome} e os horários? As avaliações ficam, sem disciplina.`) && enviar(onExcluir, "Disciplina excluída.", onFechar, setOcupado)}>
              Excluir
            </Button>
          ) : <span />}
          <Button type="submit" form="form-disc" disabled={ocupado}>{disciplina ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAvaliacao({ avaliacao, disciplinas, hoje, onFechar, onSalvar, onExcluir }: {
  avaliacao: Avaliacao | null; disciplinas: Disciplina[]; hoje: string; onFechar: () => void;
  onSalvar: (d: DadosAvaliacao, nota?: number | null) => Promise<void>; onExcluir?: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoAvaliacao>(avaliacao?.tipo ?? "prova");
  const [titulo, setTitulo] = useState(avaliacao?.titulo ?? "");
  const [disciplinaId, setDisciplinaId] = useState(avaliacao?.disciplina_id ?? disciplinas[0]?.id ?? "nenhuma");
  const [data, setData] = useState(avaliacao?.data ?? hoje);
  const [hora, setHora] = useState(avaliacao?.hora ? hm(avaliacao.hora) : "");
  const [descricao, setDescricao] = useState(avaliacao?.descricao ?? "");
  const [nota, setNota] = useState(avaliacao?.nota != null ? String(avaliacao.nota).replace(".", ",") : "");
  const [ocupado, setOcupado] = useState(false);
  const aviso = useMemo(() => (tipo === "atividade" ? "Lembrete na véspera e no dia, às 8h." : "Lembretes 3 dias antes, na véspera e no dia, às 8h."), [tipo]);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{avaliacao ? "Editar" : "Nova prova, trabalho ou atividade"}</DialogTitle>
          <DialogDescription>{aviso}</DialogDescription>
        </DialogHeader>
        <form id="form-aval" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const n = nota.trim() ? Number(nota.replace(",", ".")) : null;
          if (n !== null && !(n >= 0)) { toast.error("Nota inválida."); return; }
          enviar(() => onSalvar({ tipo, titulo, disciplinaId: disciplinaId === "nenhuma" ? null : disciplinaId, data, hora: hora || null, descricao }, avaliacao ? n : undefined),
            avaliacao ? "Salvo." : "Cadastrado. Já aparece na agenda.", onFechar, setOcupado);
        }}>
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
            {(["prova", "trabalho", "atividade"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
                className={cn("h-8 rounded-md text-sm text-muted-foreground", tipo === t && "bg-card font-medium text-foreground shadow-sm")}>
                {ROTULO_AVALIACAO[t]}
              </button>
            ))}
          </div>
          <div className="space-y-1.5"><Label htmlFor="a-titulo" className="text-[13px]">Título</Label><Input id="a-titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "prova" ? "Ex.: P1" : "Ex.: Modelagem do banco"} autoFocus /></div>
          <div className="space-y-1.5">
            <Label htmlFor="a-disc" className="text-[13px]">Disciplina</Label>
            <Select value={disciplinaId} onValueChange={setDisciplinaId}>
              <SelectTrigger id="a-disc" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                <SelectItem value="nenhuma">Sem disciplina</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="a-data" className="text-[13px]">{tipo === "prova" ? "Data" : "Entrega"}</Label><Input id="a-data" type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="a-hora" className="text-[13px]">Horário</Label><Input id="a-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="a-desc" className="text-[13px]">Detalhes</Label><Textarea id="a-desc" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Conteúdo, formato de entrega…" /></div>
          {avaliacao && (
            <div className="space-y-1.5"><Label htmlFor="a-nota" className="text-[13px]">Nota</Label><Input id="a-nota" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Quando sair" className="w-32" /></div>
          )}
        </form>
        <DialogFooter className="sm:justify-between">
          {onExcluir ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado}
              onClick={() => confirm("Excluir?") && enviar(onExcluir, "Excluído.", onFechar, setOcupado)}>Excluir</Button>
          ) : <span />}
          <Button type="submit" form="form-aval" disabled={ocupado}>{avaliacao ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
