"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, ChevronDown, CloudOff, Link2, Loader2, RefreshCw, Search, Settings2, Unplug } from "lucide-react";
import { semestreAtual, type SituacaoEfetiva } from "@motor";
import {
  entregasDaSemana, filtrar, FILTROS_RAPIDOS, indicadores, ORDEM_SITUACAO, ordenar, RESOLVIDAS, situacaoDe,
  type AtividadeClassroom, type FiltroRapido, type Filtros, type TurmaClassroom,
} from "@/lib/classroom/painel";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cabecalho } from "@/components/app/cabecalho";
import { AbasFaculdade } from "../abas-faculdade";
import type { Semestre } from "../tela-faculdade";
import { CartaoAtividade, type AcaoLocal } from "./cartao-atividade";
import { DetalheAtividade } from "./detalhe-atividade";
import { DialogoTurmas } from "./dialogo-turmas";
import { EntregasSemana } from "./entregas-semana";

export interface ConexaoClassroom {
  estado: "desconectado" | "conectado" | "reconectar"; identidade: string | null; conectado_em: string | null; auto_sync: boolean;
  sync_iniciada_em: string | null; ultima_sync_em: string | null; ultima_sync_ok_em: string | null;
  ultima_sync_resultado: { resultado: "ok" | "parcial" | "erro"; erros?: { turma: string | null; mensagem: string }[]; motivo?: string } | null;
}

const AVISOS: Record<string, string> = {
  conectado: "Classroom conectado. Escolha as turmas que quer acompanhar e sincronize.",
  negado: "A conexão foi cancelada no login do Auth0.",
  identidade: "Essa conta do Auth0 não tem acesso ao APIClassroom (só a conta dona da integração tem).",
  indisponivel: "O APIClassroom ou o Auth0 não responderam agora. Tente conectar de novo em alguns minutos.",
  estado_invalido: "O login demorou ou veio de outra aba. Comece a conexão de novo.",
  auth0: "O Auth0 recusou a autorização. Confira a configuração do aplicativo AgendaJeff no Auth0.",
  api: "O APIClassroom recusou a primeira consulta. Nada foi salvo.",
  codigo_ausente: "O retorno do login veio incompleto. Tente de novo.",
  interno: "Algo falhou ao concluir a conexão. Nada foi salvo; tente de novo.",
};

const TITULO_GRUPO: Record<SituacaoEfetiva, string> = {
  atrasada: "Atrasadas", pendente: "Pendentes", devolvida: "Devolvidas", nao_confirmada: "Status não confirmado",
  entregue: "Entregues no Classroom", concluida_local: "Concluídas no AgendaJeff", dispensada: "Dispensadas",
};
type CamposLocais = Pick<AtividadeClassroom, "resolucao_local" | "resolvida_em" | "revisar_desde">;

const quando = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(",", " às") : null);

export function PainelClassroom({ hoje, configurado, conexao, turmas, atividades, semestres, disciplinas, avaliacoes, aviso }: {
  hoje: string; configurado: boolean; conexao: ConexaoClassroom | null; turmas: TurmaClassroom[]; atividades: AtividadeClassroom[];
  semestres: Semestre[]; disciplinas: { id: string; nome: string; semestre_id: string }[];
  avaliacoes: { id: string; disciplina_id: string | null; tipo: string; titulo: string; data: string; hora: string | null; entregue: boolean }[]; aviso: string | null;
}) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [verTurmas, setVerTurmas] = useState(false);
  const [aberta, setAberta] = useState<AtividadeClassroom | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({ rapido: "para_entregar", curso: "todos", busca: "", prazo: "todos", de: null, ate: null });
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [verResolvidas, setVerResolvidas] = useState<Set<SituacaoEfetiva>>(new Set());
  // Decisões pessoais feitas nesta tela, aplicadas na hora (o servidor confirma no refresh).
  const [locais, setLocais] = useState<Record<string, CamposLocais>>({});
  const avisou = useRef(false);

  useEffect(() => {
    if (!aviso || avisou.current) return;
    avisou.current = true;
    if (aviso === "conectado") toast.success(AVISOS.conectado); else toast.error(AVISOS[aviso] ?? AVISOS.interno);
    router.replace("/faculdade?aba=classroom", { scroll: false });
  }, [aviso, router]);

  const acompanhadas = useMemo(() => new Map(turmas.filter((t) => t.acompanhar).map((t) => [t.course_id, t])), [turmas]);
  const nomeDisciplina = useMemo(() => new Map(disciplinas.map((d) => [d.id, d.nome])), [disciplinas]);
  const nomeTurma = (courseId: string) => {
    const t = acompanhadas.get(courseId) ?? turmas.find((x) => x.course_id === courseId);
    return t ? t.nome_exibicao || (t.disciplina_id && nomeDisciplina.get(t.disciplina_id)) || t.nome : courseId;
  };
  // Indicadores e quadro: só turmas acompanhadas e atividades que ainda aparecem no Classroom.
  const comLocais = useMemo(() => atividades.map((a) => (locais[a.id] ? { ...a, ...locais[a.id] } : a)), [atividades, locais]);
  const visiveis = useMemo(() => comLocais.filter((a) => acompanhadas.has(a.course_id) && !a.ausente_desde), [comLocais, acompanhadas]);
  const ausentes = comLocais.filter((a) => acompanhadas.has(a.course_id) && a.ausente_desde);
  const agora = useMemo(() => new Date(), []);
  const ind = indicadores(visiveis, agora);
  const lista = ordenar(filtrar(visiveis, filtros, agora));
  const grupos = ORDEM_SITUACAO.map((s) => ({ s, itens: lista.filter((a) => situacaoDe(a, agora) === s) })).filter((g) => g.itens.length);
  const sem = semestreAtual(semestres, hoje);
  const semana = entregasDaSemana(visiveis, avaliacoes, agora);
  const contagem: Partial<Record<FiltroRapido, number>> = {
    para_entregar: ind.pendentes + ind.atrasadas, vencidas: ind.atrasadas, proximos7: ind.proximas7, devolvidas: ind.devolvidas,
    nao_confirmadas: ind.naoConfirmadas, entregues: ind.entregues, concluidas_local: ind.concluidasLocal, dispensadas: ind.dispensadas, todas: visiveis.length,
  };

  /** Decisão pessoal: grava só no Supabase do AgendaJeff (nada vai para o Classroom), com "Desfazer". */
  async function agir(a: AtividadeClassroom, acao: AcaoLocal, desfazendo = false) {
    const antes: CamposLocais = { resolucao_local: a.resolucao_local, resolvida_em: a.resolvida_em, revisar_desde: a.revisar_desde };
    const depois: CamposLocais = acao.tipo === "resolver" ? { resolucao_local: acao.resolucao, resolvida_em: new Date().toISOString(), revisar_desde: null }
      : acao.tipo === "reabrir" ? { resolucao_local: null, resolvida_em: null, revisar_desde: null }
      : { ...antes, revisar_desde: null };
    await gravar(a, depois, antes, desfazendo ? null : acao);
  }
  async function gravar(a: AtividadeClassroom, depois: CamposLocais, antes: CamposLocais, acao: AcaoLocal | null) {
    setLocais((m) => ({ ...m, [a.id]: depois }));
    setAberta((x) => (x?.id === a.id ? { ...x, ...depois } : x));
    const { error } = await criarClienteNavegador().from("classroom_atividades").update(depois).eq("id", a.id);
    if (error) {
      setLocais((m) => ({ ...m, [a.id]: antes }));
      setAberta((x) => (x?.id === a.id ? { ...x, ...antes } : x));
      toast.error("Não foi possível salvar. Nada mudou.");
      return;
    }
    router.refresh();
    if (!acao) { toast.success("Desfeito."); return; }
    const texto = acao.tipo === "resolver" ? (acao.resolucao === "concluida" ? `"${a.titulo}" concluída no AgendaJeff.` : `"${a.titulo}" dispensada.`)
      : acao.tipo === "reabrir" ? `"${a.titulo}" reaberta: vale o estado do Classroom.` : "Alteração marcada como revisada.";
    toast.success(texto, { description: acao.tipo === "resolver" ? "Só aqui: nada foi alterado no Classroom." : undefined, action: { label: "Desfazer", onClick: () => gravar({ ...a, ...depois }, antes, depois, null) } });
  }

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r = await fetch("/api/classroom/sincronizar", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.erro ?? "Não foi possível sincronizar agora."); return; }
      const s = j.resumo;
      if (s.motivo === "em_andamento") toast.info("Já existe uma sincronização em andamento. Aguarde um pouco.");
      else if (s.motivo === "reconectar") toast.error("A autorização do Classroom expirou. Conecte de novo.");
      else if (s.motivo === "desconectado") toast.error("Classroom não conectado.");
      else if (s.motivo === "sem_turmas") toast.info("Turmas atualizadas. Escolha quais acompanhar para trazer as atividades.");
      else {
        const partes = [`${s.novas} ${s.novas === 1 ? "nova" : "novas"}`, `${s.atualizadas} ${s.atualizadas === 1 ? "atualizada" : "atualizadas"}`];
        if (s.entregasConfirmadas) partes.push(`${s.entregasConfirmadas} ${s.entregasConfirmadas === 1 ? "entrega confirmada" : "entregas confirmadas"}`);
        if (s.prazosAlterados) partes.push(`${s.prazosAlterados} ${s.prazosAlterados === 1 ? "prazo alterado" : "prazos alterados"}`);
        if (s.resultado === "erro") toast.error(`A sincronização falhou${s.erros?.[0] ? `: ${s.erros[0].mensagem}` : ""}. Os dados anteriores foram mantidos.`);
        else if (s.resultado === "ok") toast.success(`Sincronização concluída: ${partes.join(", ")}.`);
        else toast.warning(`Sincronização incompleta (${s.turmasSincronizadas} de ${s.turmasAcompanhadas} turmas): ${partes.join(", ")}. Alguns dados podem estar desatualizados.`);
      }
      router.refresh();
    } catch {
      toast.error("Sem conexão com o servidor. Nada foi alterado.");
    } finally {
      setSincronizando(false);
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar o Classroom? As atividades já sincronizadas continuam aqui; a sincronização para até você conectar de novo.")) return;
    const r = await fetch("/api/classroom/desconectar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (r.ok) { toast.success("Classroom desconectado."); router.refresh(); } else toast.error("Não foi possível desconectar.");
  }

  async function alternarAuto(v: boolean) {
    const { error } = await criarClienteNavegador().from("classroom_conexoes").update({ auto_sync: v }).not("user_id", "is", null);
    if (error) toast.error("Não foi possível salvar."); else { toast.success(v ? "Sincronização automática ligada." : "Sincronização automática desligada."); router.refresh(); }
  }

  const estado = conexao?.estado ?? "desconectado";
  const ultimo = conexao?.ultima_sync_resultado;
  const conectado = estado === "conectado";

  return (
    <>
      <Cabecalho titulo="Faculdade"
        acoes={conectado ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setVerTurmas(true)}><Settings2 className="size-4" /> Turmas</Button>
            <Button size="sm" onClick={sincronizar} disabled={sincronizando} aria-busy={sincronizando}>
              {sincronizando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          </>
        ) : undefined}>
        Atividades publicadas no Google Classroom, com o estado da sua entrega. Os prazos entram na Agenda e nos lembretes.
      </Cabecalho>
      <AbasFaculdade atual="classroom" />

      <div className="max-w-6xl space-y-5 px-4 pb-16 md:px-8">
        {!configurado ? (
          <Vazio icone={<CloudOff className="size-7" />} titulo="Integração ainda não configurada"
            texto="O servidor do AgendaJeff precisa das credenciais do aplicativo no Auth0 (veja docs/CLASSROOM_INTEGRACAO.md). Nenhum dado do Classroom foi consultado." />
        ) : estado !== "conectado" ? (
          <Vazio icone={estado === "reconectar" ? <AlertTriangle className="size-7 text-aviso" /> : <Link2 className="size-7" />}
            titulo={estado === "reconectar" ? "Reconexão necessária" : "Conecte o Google Classroom"}
            texto={estado === "reconectar"
              ? "A autorização expirou ou foi revogada. As atividades já sincronizadas continuam abaixo, mas podem estar desatualizadas."
              : "Você entra com a mesma conta do Auth0 que usa no APIClassroom. O AgendaJeff só lê: não publica nem entrega nada no Classroom."}
            acao={<Button asChild><a href="/api/classroom/conectar"><Link2 className="size-4" /> {estado === "reconectar" ? "Conectar de novo" : "Conectar ao Classroom"}</a></Button>} />
        ) : null}

        {configurado && conexao && estado !== "desconectado" && (
          <section aria-label="Estado da conexão" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span className={cn("size-2 rounded-full", conectado ? (ultimo?.resultado === "erro" ? "bg-destructive" : ultimo?.resultado === "parcial" ? "bg-aviso" : "bg-feito") : "bg-aviso")} aria-hidden />
              {!conectado ? "Reconexão necessária" : ultimo?.resultado === "erro" ? "Falha na última sincronização" : ultimo?.resultado === "parcial" ? "Última sincronização incompleta" : "Conectado"}
            </span>
            <span className="text-muted-foreground">
              {conexao.ultima_sync_ok_em ? `Última sincronização completa: ${quando(conexao.ultima_sync_ok_em)}` : conexao.ultima_sync_em ? `Nenhuma sincronização completa ainda (última tentativa ${quando(conexao.ultima_sync_em)})` : "Ainda não sincronizado"}
            </span>
            {conectado && (
              <label className="flex items-center gap-2 text-muted-foreground">
                <Switch checked={conexao.auto_sync} onCheckedChange={alternarAuto} aria-label="Sincronização automática" /> Automática (a cada 3 h)
              </label>
            )}
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={desconectar}><Unplug className="size-4" /> Desconectar</Button>
            {ultimo && ultimo.resultado !== "ok" && !!ultimo.erros?.length && (
              <ul className="w-full space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                {ultimo.erros.slice(0, 4).map((e, i) => <li key={i}><span className="font-medium text-foreground">{e.turma ?? "Geral"}:</span> {e.mensagem}</li>)}
              </ul>
            )}
          </section>
        )}

        {configurado && conectado && acompanhadas.size === 0 && (
          <Vazio icone={<Settings2 className="size-7" />} titulo="Escolha as turmas que quer acompanhar"
            texto={`O Classroom pode manter turmas antigas como ativas. Marque só as do semestre${sem ? ` (${sem.nome})` : ""} e, se quiser, ligue cada uma a uma disciplina do AgendaJeff.`}
            acao={<Button onClick={() => setVerTurmas(true)}><Settings2 className="size-4" /> Escolher turmas</Button>} />
        )}

        {acompanhadas.size > 0 && (
          <>
            <EntregasSemana entregas={semana} agora={agora} onAbrir={setAberta} onAcao={agir}
              nome={(e) => (e.origem === "classroom" ? nomeTurma(e.disciplinaCurso ?? "") : (e.disciplinaCurso && nomeDisciplina.get(e.disciplinaCurso)) || "Sem disciplina")} />

            <section aria-label="Resumo" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
              {([["Pendentes", ind.pendentes, "para_entregar"], ["Atrasadas", ind.atrasadas, "vencidas"], ["Devolvidas", ind.devolvidas, "devolvidas"], ["Entregues", ind.entregues, "entregues"], ["Próximos 7 dias", ind.proximas7, "proximos7"]] as const).map(([k, v, f]) => (
                <button key={k} type="button" onClick={() => setFiltros((x) => ({ ...x, rapido: f }))} className={cn("bg-card p-4 text-left hover:bg-accent/40", f === "proximos7" && "col-span-2 sm:col-span-1", filtros.rapido === f && "bg-accent/60")}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className={cn("numeros mt-1.5 text-xl font-semibold tracking-tight", k === "Atrasadas" && v > 0 && "text-destructive")}>{v}</p>
                </button>
              ))}
            </section>

            {ind.revisar > 0 && filtros.rapido !== "revisar" && (
              <button type="button" onClick={() => setFiltros((x) => ({ ...x, rapido: "revisar" }))}
                className="flex w-full items-center gap-2 rounded-xl border border-aviso/40 bg-aviso/[0.07] px-3.5 py-2.5 text-left text-sm hover:border-aviso/60">
                <AlertCircle className="size-4 shrink-0 text-aviso" aria-hidden />
                <span className="flex-1">{ind.revisar === 1 ? "1 atividade que você resolveu mudou" : `${ind.revisar} atividades que você resolveu mudaram`} no Classroom. Sua decisão foi mantida; vale revisar.</span>
                <span className="text-xs font-medium text-aviso">Revisar</span>
              </button>
            )}

            <section aria-label="Filtros" className="space-y-2">
              <div role="group" aria-label="Filtro rápido" className="flex flex-wrap gap-1">
                {FILTROS_RAPIDOS.map((f) => (
                  <button key={f.id} type="button" aria-pressed={filtros.rapido === f.id} onClick={() => setFiltros((x) => ({ ...x, rapido: f.id }))}
                    className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", filtros.rapido === f.id && "bg-accent font-medium text-foreground")}>
                    {f.rotulo}{contagem[f.id] !== undefined && <span className="numeros text-xs text-muted-foreground">{contagem[f.id]}</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-48 flex-1 sm:max-w-64">
                  <span className="sr-only">Buscar atividade</span>
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={filtros.busca} onChange={(e) => setFiltros((x) => ({ ...x, busca: e.target.value }))} placeholder="Buscar pelo título" className="h-8 pl-8 text-sm" />
                </label>
                <Select value={filtros.curso} onValueChange={(v) => setFiltros((x) => ({ ...x, curso: v }))}>
                  <SelectTrigger aria-label="Disciplina" className="h-8 w-auto max-w-56 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as disciplinas</SelectItem>
                    {[...acompanhadas.values()].map((t) => <SelectItem key={t.course_id} value={t.course_id}>{nomeTurma(t.course_id)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" aria-expanded={maisFiltros} onClick={() => setMaisFiltros((v) => !v)} className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                  Prazo e período <ChevronDown className={cn("size-3.5 transition-transform", maisFiltros && "rotate-180")} />
                </button>
              </div>
              {maisFiltros && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
                  <Select value={filtros.prazo} onValueChange={(v) => setFiltros((x) => ({ ...x, prazo: v as Filtros["prazo"] }))}>
                    <SelectTrigger aria-label="Prazo" className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Com e sem prazo</SelectItem><SelectItem value="com">Só com prazo</SelectItem><SelectItem value="sem">Só sem prazo</SelectItem></SelectContent>
                  </Select>
                  <label className="text-xs text-muted-foreground">De<Input type="date" className="h-8 text-sm" value={filtros.de ?? ""} onChange={(e) => setFiltros((x) => ({ ...x, de: e.target.value || null }))} /></label>
                  <label className="text-xs text-muted-foreground">Até<Input type="date" className="h-8 text-sm" value={filtros.ate ?? ""} onChange={(e) => setFiltros((x) => ({ ...x, ate: e.target.value || null }))} /></label>
                  {(filtros.de || filtros.ate || filtros.prazo !== "todos") && <Button variant="ghost" size="sm" onClick={() => setFiltros((x) => ({ ...x, prazo: "todos", de: null, ate: null }))}>Limpar</Button>}
                </div>
              )}
            </section>

            {visiveis.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {conexao?.ultima_sync_ok_em ? "Nenhuma atividade publicada nas turmas acompanhadas." : "Sincronize para trazer as atividades das turmas acompanhadas."}
              </p>
            ) : grupos.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {filtros.rapido === "para_entregar" && !filtros.busca && filtros.curso === "todos" ? "Nada para entregar agora." : "Nenhuma atividade com esses filtros."}
              </p>
            ) : (
              <div className="space-y-6">
                {grupos.map(({ s, itens }) => {
                  // Resolvidas (entregues, concluídas aqui, dispensadas) ficam recolhidas em "Todas"; nos filtros próprios, abertas.
                  const recolhivel = RESOLVIDAS.includes(s) && (filtros.rapido === "todas" || filtros.rapido === "revisar");
                  const recolher = recolhivel && !verResolvidas.has(s) && filtros.rapido !== "revisar";
                  return (
                    <section key={s} aria-label={`${TITULO_GRUPO[s]}, ${itens.length}`} className="space-y-2">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        {TITULO_GRUPO[s]} <span className="numeros font-normal text-muted-foreground">{itens.length}</span>
                        {recolhivel && filtros.rapido === "todas" && (
                          <button type="button" className="text-xs font-normal text-muted-foreground underline underline-offset-4"
                            onClick={() => setVerResolvidas((v) => { const n = new Set(v); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>{verResolvidas.has(s) ? "Esconder" : "Mostrar"}</button>
                        )}
                      </h2>
                      {s === "concluida_local" && <p className="text-xs text-muted-foreground">Marcadas como feitas só no AgendaJeff. No Classroom elas continuam como estão.</p>}
                      {s === "dispensada" && <p className="text-xs text-muted-foreground">Você indicou que não precisa entregar. Saem das pendências, da agenda e dos lembretes.</p>}
                      {s === "nao_confirmada" && <p className="text-xs text-muted-foreground">O Classroom não informou o estado da sua entrega. Confira no Classroom antes de considerar entregue ou pendente.</p>}
                      {s === "devolvida" && <p className="text-xs text-muted-foreground">O professor devolveu. Veja a nota e os comentários no Classroom; nem toda devolução pede reenvio.</p>}
                      {!recolher && (
                        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {itens.map((a) => <li key={a.id}><CartaoAtividade a={a} disciplina={nomeTurma(a.course_id)} agora={agora} onAbrir={() => setAberta(a)} onAcao={agir} /></li>)}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            {ausentes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {ausentes.length} {ausentes.length === 1 ? "atividade não aparece" : "atividades não aparecem"} mais no Classroom (removida, escondida ou turma alterada). Elas saíram da agenda, mas os seus registros foram mantidos.
              </p>
            )}
          </>
        )}
      </div>

      {verTurmas && <DialogoTurmas turmas={turmas} disciplinas={disciplinas.filter((d) => !sem || d.semestre_id === sem.id)} onFechar={() => setVerTurmas(false)} onMudou={() => router.refresh()} />}
      {aberta && (
        <DetalheAtividade key={aberta.id} a={aberta} disciplina={nomeTurma(aberta.course_id)} agora={agora} hoje={hoje}
          avaliacoes={avaliacoes.filter((v) => { const t = acompanhadas.get(aberta.course_id); return !t?.disciplina_id || v.disciplina_id === t.disciplina_id; })}
          onFechar={() => setAberta(null)} onMudou={() => router.refresh()} onAcao={agir} />
      )}
    </>
  );
}

function Vazio({ icone, titulo, texto, acao }: { icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="text-muted-foreground" aria-hidden>{icone}</span>
      <h2 className="mt-3 font-medium">{titulo}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}
