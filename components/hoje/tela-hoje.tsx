"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CloudOff, Eye, GraduationCap, MapPin, PartyPopper, Plus, Settings, Target } from "lucide-react";
import { AlertTriangle } from "./icones";
import { LinhaTarefa } from "./cartao-tarefa";
import { DialogoTarefa } from "./dialogo-tarefa";
import { pararRecorrencia, salvarRecorrencia } from "@/lib/mutacoes";
import { aplicarFilaTarefas, enviarFilaTarefas, fazerOuEnfileirar, lerFilaTarefas, novoId, type AcaoTarefa } from "@/lib/fila-tarefas";
import { semanaParaPlanejar, segundaDaSemana } from "@motor";
import { carregarTarefas, type Tarefa } from "@/lib/dados";
import { diasEntre, progressoMeta, somarDias, type Meta } from "@motor";
import { corDisciplina } from "@/lib/apresentacao";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { agoraSP, antesDaJanela, blocoDaVez, historico, jaPassou, periodoDoSlot, prazosDoHoje, resolverDia, resumir, horaCurta, type Cadeia, type Check, type StatusCheck } from "@motor";
import { iniciarFoco, minutosDeFoco, useCronometro } from "@/lib/cronometro";
import { enfileirar, enviarFila, ehErroDeRede, EVENTO_FILA, gravarCheck, lerFila, type AcaoCheck } from "@/lib/fila-offline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ContextoCompleto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { COR_FLEXIVEL, corDaCadeia, dataCurta, dataPorExtenso, diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";
import { CartaoAgora, LinhaHabito, type ItemDoDia } from "./cartao";
import { AcoesAula } from "./acoes-aula";
import type { Falta } from "@/lib/faltas";

interface Props {
  ctx: ContextoCompleto;
  data: string;
  checksIniciais: (Check & { nota?: string | null })[];
  historicoAnterior: Check[]; // do início do acompanhamento até ontem, para as sequências
  tarefasIniciais: Tarefa[];
  focoSemana: { habitoId: string; semana: string } | null;
  horaAgora: string | null;
  simulada: boolean;
  hoje: string; // a data de hoje (a tela pode estar mostrando outro dia)
  metas: Meta[]; // metas do mês do dia mostrado
  lembreteMes: { texto: string; detalhe: string; href: string } | null;
  relacao: "hoje" | "passado" | "futuro";
  faltas: Falta[]; // faltas registradas no dia mostrado
}

/** Um bloco do dia: uma cadeia ou os flexíveis. */
interface Grupo {
  chave: string;
  nome: string;
  cor: string;
  cadeia: Cadeia | null;
  janela: string | null;
  itens: ItemDoDia[];
}

const MARCOS_SEQUENCIA = [7, 21, 30, 66];
const ROTULO: Record<StatusCheck, string> = { completo: "feito", minimo: "mínimo", nao_feito: "não feito", nao_se_aplica: "não se aplica" };

/** Aplica sobre os checks do servidor as ações deste dia que ainda estão na fila offline. */
function comFila(base: Map<string, StatusCheck>, data: string) {
  const m = new Map(base);
  for (const a of lerFila().filter((a) => a.data === data)) {
    if (a.status) m.set(a.habitoId, a.status); else m.delete(a.habitoId);
  }
  return m;
}

/** "Ontem", "Amanhã", "Há 3 dias", "Daqui a 5 dias". */
function distancia(hoje: string, data: string) {
  const n = diasEntre(hoje, data);
  return n === 0 ? "Hoje" : n === 1 ? "Amanhã" : n === -1 ? "Ontem" : n > 0 ? `Daqui a ${n} dias` : `Há ${-n} dias`;
}

export function TelaHoje({ ctx, data, checksIniciais, historicoAnterior, tarefasIniciais, focoSemana, horaAgora, simulada, hoje, relacao, metas, lembreteMes, faltas }: Props) {
  const sb = useMemo(() => criarClienteNavegador(), []);
  const dia = useMemo(() => resolverDia(data, ctx), [data, ctx]);
  const [checks, setChecks] = useState(() => new Map(checksIniciais.map((c) => [c.habitoId, c.status])));
  const [notas, setNotas] = useState(() => new Map(checksIniciais.filter((c) => c.nota).map((c) => [c.habitoId, c.nota as string])));
  const [anotando, setAnotando] = useState<ItemDoDia | null>(null);
  // Cartão que acabou de mudar de coluna: destaque rápido para o olho encontrá-lo.
  const [movido, setMovido] = useState<string | null>(null);
  useEffect(() => {
    if (!movido) return;
    const t = setTimeout(() => setMovido(null), 1200);
    return () => clearTimeout(t);
  }, [movido]);
  const checksRef = useRef(checks);
  useEffect(() => { checksRef.current = checks; }, [checks]);
  const [online, setOnline] = useState(true);
  const [naFila, setNaFila] = useState(0);
  const cronometro = useCronometro();
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const parametros = useSearchParams();
  const router = useRouter();
  const [edTarefa, setEdTarefa] = useState<Tarefa | "nova" | null>(parametros.get("novo") === "tarefa" ? "nova" : null);
  // Navegação entre dias: ?dia=AAAA-MM-DD (mantém o ?data= de desenvolvimento, se houver).
  const futuro = relacao === "futuro";
  const urlDia = useCallback((d: string) => {
    const q = new URLSearchParams(parametros.toString());
    q.delete("novo");
    if (d === hoje) q.delete("dia"); else q.set("dia", d);
    const busca = q.toString();
    return busca ? `/hoje?${busca}` : "/hoje";
  }, [parametros, hoje]);
  const limites = { min: somarDias(hoje, -366), max: somarDias(hoje, 366) };
  useEffect(() => {
    // ← e → trocam de dia (fora de campos de texto, menus e diálogos).
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      router.push(urlDia(somarDias(data, e.key === "ArrowLeft" ? -1 : 1)));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [router, urlDia, data]);
  const [novaTarefa, setNovaTarefa] = useState("");
  const [periodoDestacado, setPeriodoDestacado] = useState<string | null>(null);
  // Blocos abertos (cadeias recolhidas, registrados, tarefas e agenda no celular).
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const alternar = (chave: string) => setAbertos((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  // Hora de São Paulo no aparelho: o "Agora" acompanha o relógio com o app aberto (data simulada não tem hora).
  const [hora, setHora] = useState(horaAgora);
  useEffect(() => {
    if (!horaAgora) return;
    const t = setInterval(() => setHora(agoraSP().hora), 60_000);
    return () => clearInterval(t);
  }, [horaAgora]);

  const itens: ItemDoDia[] = useMemo(() => {
    const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
    const lista: ItemDoDia[] = [];
    let ordem = 0;
    for (const c of dia.cadeias) {
      const aviso = dia.avisos.find((a) => a.cadeiaId === c.id);
      const comp = aviso && dia.compromissos.find((e) => e.id === aviso.eventoId);
      c.passos.forEach((p, i) => {
        lista.push({
          habitoId: p.habitoId, cadeiaId: c.id, nome: nome.get(p.habitoId) ?? "Hábito", grupo: c.nome,
          cor: corDaCadeia(c), periodo: c.periodo,
          quando: p.naoAntes ? `${p.gatilho.replace(/\s*\(.*\)$/, "")}, a partir de ${horaCurta(p.naoAntes)}` : p.gatilho,
          minimo: p.minimo,
          aviso: comp && i === 0 ? `${comp.titulo.replace(/^Reunião do grupo: /, "")} às ${horaCurta(comp.inicio!)}` : null,
          ordem: ordem++,
        });
      });
    }
    for (const h of dia.flexiveis)
      lista.push({ habitoId: h.id, cadeiaId: null, nome: h.nome, grupo: "Flexível", cor: COR_FLEXIVEL, periodo: "livre", quando: "Sem horário, quando der", minimo: null, aviso: null, ordem: ordem++ });
    return lista;
  }, [dia, ctx.habitos]);

  // Marcações em andamento: uma leitura que começou antes delas traria o estado antigo e desfaria o toque.
  const escritas = useRef({ emAndamento: 0, versao: 0 });
  const recarregar = useCallback(async () => {
    const versao = escritas.current.versao;
    const { data: linhas, error } = await sb.from("checks").select("habit_id, status, nota").eq("data_local", data);
    if (error || !linhas) return;
    if (escritas.current.emAndamento || escritas.current.versao !== versao) return; // o tempo real avisa de novo depois da gravação
    setChecks(comFila(new Map(linhas.map((l) => [l.habit_id, l.status as StatusCheck])), data));
    setNotas(new Map(linhas.filter((l) => l.nota).map((l) => [l.habit_id, l.nota as string])));
  }, [sb, data]);

  const recarregarTarefas = useCallback(async () => {
    try { setTarefas(aplicarFilaTarefas(await carregarTarefas(sb, data), data)); } catch { /* sem rede: mantém a lista atual */ }
  }, [sb, data]);
  useEffect(() => {
    const canal = sb.channel(`tarefas-${data}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, () => recarregarTarefas())
      .subscribe();
    const aoVoltar = () => document.visibilityState === "visible" && recarregarTarefas();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { sb.removeChannel(canal); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [sb, data, recarregarTarefas]);

  // Tarefas: grava na hora ou, sem sinal, guarda na fila do aparelho (como os checks).
  async function acaoTarefa(acao: AcaoTarefa, otimista: (l: Tarefa[]) => Tarefa[], ok?: string) {
    const antes = tarefas;
    setTarefas(otimista);
    try {
      const r = await fazerOuEnfileirar(sb, acao);
      if (r === "fila") toast("Sem sinal: tarefa guardada no aparelho", { description: "Envio automático quando a conexão voltar." });
      else { if (ok) toast.success(ok); recarregarTarefas(); }
    } catch (e) { setTarefas(antes); toast.error((e as Error).message); }
  }
  const agora = () => new Date().toISOString();
  const concluir = (t: Tarefa, feita: boolean) => {
    const quando = feita ? agora() : null;
    setMovido(t.id);
    if (t.virtual) {
      // Recorrente: a instância do dia vira linha no banco ao ser concluída.
      const id = novoId();
      return acaoTarefa({ acao: "criar", id, linha: { titulo: t.titulo, data, hora: t.hora, notas: null, prioridade: t.prioridade, recorrente_id: t.recorrenteId, concluida_em: quando }, em: agora() },
        (l) => l.map((x) => (x.id === t.id ? { ...x, id, virtual: false, concluidaEm: quando } : x)));
    }
    return acaoTarefa({ acao: "atualizar", id: t.id, campos: { concluida_em: quando }, em: agora() },
      (l) => l.map((x) => (x.id === t.id ? { ...x, concluidaEm: quando } : x)));
  };
  const criarTarefa = (d: { titulo: string; data: string; hora: string | null; notas: string | null; prioridade: number }, ok = "Tarefa adicionada.") => {
    const id = novoId();
    const linha = { ...d, titulo: d.titulo.trim() };
    return acaoTarefa({ acao: "criar", id, linha, em: agora() },
      (l) => (d.data === data ? [...l, { id, ...linha, concluidaEm: null, recorrenteId: null }] : l), d.data === data ? ok : `${ok} Ela aparece no dia ${diaMes(d.data)}.`);
  };
  const adiar = (t: Tarefa) => acaoTarefa({ acao: "atualizar", id: t.id, campos: { data: somarDias(data, 1) }, em: agora() },
    (l) => l.filter((x) => x.id !== t.id), `${t.titulo}: passou para amanhã.`);
  const excluir = (t: Tarefa) => acaoTarefa({ acao: "excluir", id: t.id, em: agora() }, (l) => l.filter((x) => x.id !== t.id), "Tarefa excluída.");
  const pararRepeticao = async (t: Tarefa) => {
    if (!t.recorrenteId || !confirm(`Parar de repetir "${t.titulo}"? O que já foi concluído fica no histórico.`)) return;
    try { await pararRecorrencia(sb, t.recorrenteId); toast.success("Repetição encerrada."); recarregarTarefas(); }
    catch (e) { toast.error(ehErroDeRede(e as Error) ? "Sem conexão: tente de novo com sinal." : (e as Error).message); }
  };

  // Offline: aplica a fila ao abrir, envia quando o sinal volta e mostra o que está aguardando.
  useEffect(() => {
    const atualizarFila = () => setNaFila(lerFila().length + lerFilaTarefas().length);
    let sincronizando = false; // o navegador e a página podem disparar "online" juntos: uma sincronização por vez
    const sincronizar = async () => {
      setOnline(navigator.onLine);
      if (sincronizando || !navigator.onLine || !(lerFila().length + lerFilaTarefas().length)) return;
      sincronizando = true;
      let r, rt;
      try {
        r = await enviarFila(sb);
        rt = await enviarFilaTarefas(sb);
      } finally {
        sincronizando = false;
      }
      const enviados = r.enviados + rt.enviados, recusados = r.recusados + rt.recusados;
      if (enviados) toast.success(`${enviados} ${enviados === 1 ? "registro enviado" : "registros enviados"} ao voltar o sinal.`);
      if (recusados) toast.error(`${recusados} registro(s) recusado(s) pelo servidor.`);
      recarregar();
      recarregarTarefas();
    };
    const offline = () => setOnline(false);
    const inicio = setTimeout(() => { setChecks((m) => comFila(m, data)); setTarefas((l) => aplicarFilaTarefas(l, data)); atualizarFila(); sincronizar(); }, 0);
    window.addEventListener("online", sincronizar);
    window.addEventListener("offline", offline);
    window.addEventListener(EVENTO_FILA, atualizarFila);
    return () => {
      clearTimeout(inicio);
      window.removeEventListener("online", sincronizar);
      window.removeEventListener("offline", offline);
      window.removeEventListener(EVENTO_FILA, atualizarFila);
    };
  }, [sb, data, recarregar, recarregarTarefas]);

  // Sincroniza com o outro aparelho: tempo real e ao voltar para o app.
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === "visible" && recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    // Exclusões não aceitam filtro no Realtime: escuta todas (a RLS limita ao usuário) e recarrega.
    const canal = sb.channel(`checks-${data}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checks", filter: `data_local=eq.${data}` }, () => recarregar())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checks", filter: `data_local=eq.${data}` }, () => recarregar())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "checks" }, () => recarregar())
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      sb.removeChannel(canal);
    };
  }, [sb, data, recarregar]);

  // Aberto por notificação (/hoje#manha): abre e destaca os blocos daquele período.
  useEffect(() => {
    const p = window.location.hash.slice(1);
    if (!["manha", "tarde", "noite"].includes(p)) return;
    const liga = setTimeout(() => {
      setPeriodoDestacado(p);
      setAbertos(new Set([...dia.cadeias.filter((c) => c.periodo === p).map((c) => c.id), ...(p !== "manha" ? ["flexiveis"] : [])]));
    }, 0);
    const desliga = setTimeout(() => setPeriodoDestacado(null), 4000);
    return () => { clearTimeout(liga); clearTimeout(desliga); };
  }, [dia.cadeias]);

  // Sequência atual de cada hábito, considerando o histórico e o que já foi marcado hoje.
  const inicio = ctx.inicioRastreamento && ctx.inicioRastreamento < data ? ctx.inicioRastreamento : data;
  const sequenciaCom = (mapa: Map<string, StatusCheck>) => {
    const hoje: Check[] = [...mapa].map(([habitoId, status]) => ({ habitoId, status, data }));
    const hist = historico(ctx, [...historicoAnterior, ...hoje], inicio, data);
    return new Map(ctx.habitos.map((h) => [h.id, resumir(hist.get(h.id) ?? [], data).sequenciaAtual]));
  };
  const sequencias = sequenciaCom(checks);

  function comemorar(item: ItemDoDia, status: StatusCheck, depois: Map<string, StatusCheck>) {
    if (status !== "completo" && status !== "minimo") return;
    const seq = sequenciaCom(depois).get(item.habitoId) ?? 0;
    if (MARCOS_SEQUENCIA.includes(seq))
      toast.success(`${seq} dias seguidos de ${item.nome}`, { description: seq === 66 ? "A mediana de formação de um hábito. Ele está ficando automático." : "Sequência registrada. Num dia difícil, o mínimo mantém a corrente." });
    const cadeia = dia.cadeias.find((c) => c.id === item.cadeiaId);
    if (itens.every((i) => depois.get(i.habitoId)))
      toast.success("Dia fechado", { description: "Tudo registrado hoje." });
    else if (cadeia && cadeia.passos.every((p) => ["completo", "minimo", "nao_se_aplica"].includes(depois.get(p.habitoId) ?? "")))
      toast.success(`${cadeia.nome} completa`, { description: `${cadeia.passos.length} de ${cadeia.passos.length} passos registrados.` });
  }

  async function marcar(item: ItemDoDia, status: StatusCheck | null, opcoes: { desfazivel?: boolean } = { desfazivel: true }) {
    // Lê o estado mais recente (o "Desfazer" do aviso é chamado depois, com um closure antigo).
    if (futuro) { toast("Hábitos de dias futuros dá para ver, mas marcar só no próprio dia."); return; }
    const atual = checksRef.current;
    const anterior = atual.get(item.habitoId) ?? null;
    if (anterior === status) return;
    const depois = new Map(atual);
    if (status) depois.set(item.habitoId, status); else depois.delete(item.habitoId);
    checksRef.current = depois;
    setChecks(depois);
    setMovido(item.habitoId);
    if (status && "vibrate" in navigator) navigator.vibrate?.(10);

    const acao: AcaoCheck = { habitoId: item.habitoId, cadeiaId: item.cadeiaId, data, status, em: new Date().toISOString() };
    escritas.current.versao++;
    escritas.current.emAndamento++;
    const { error } = navigator.onLine ? await gravarCheck(sb, acao).finally(() => { escritas.current.emAndamento--; }) : (escritas.current.emAndamento--, { error: { message: "offline" } });
    if (error && ehErroDeRede(error)) {
      const primeira = lerFila().length === 0;
      enfileirar(acao);
      if (primeira) toast("Sem sinal: guardado no aparelho", { description: "Envio automático quando a conexão voltar." });
    } else if (error) {
      setChecks((m) => {
        const n = new Map(m);
        if (anterior) n.set(item.habitoId, anterior); else n.delete(item.habitoId);
        return n;
      });
      toast.error("Não foi possível salvar. Tente de novo.");
      return;
    }
    if (status && opcoes.desfazivel) {
      toast(`${item.nome}: ${ROTULO[status]}`, { action: { label: "Desfazer", onClick: () => marcar(item, anterior, { desfazivel: false }) }, duration: 4000 });
    }
    if (status) comemorar(item, status, depois);
  }

  async function salvarNota(item: ItemDoDia, texto: string) {
    const status = checks.get(item.habitoId);
    if (!status) return;
    const nota = texto.trim() || null;
    setNotas((m) => { const n = new Map(m); if (nota) n.set(item.habitoId, nota); else n.delete(item.habitoId); return n; });
    const acao: AcaoCheck = { habitoId: item.habitoId, cadeiaId: item.cadeiaId, data, status, nota, em: new Date().toISOString() };
    const { error } = navigator.onLine ? await gravarCheck(sb, acao) : { error: { message: "offline" } };
    if (error && ehErroDeRede(error)) enfileirar(acao);
    else if (error) toast.error("Não foi possível salvar a nota.");
    else toast.success("Nota salva.");
  }

  // Ícone do app instalado (Windows/Chrome/Edge, iOS 16.4+): pendentes do período atual.
  const periodoAtual = hora ? periodoDoSlot(hora) : null;
  const pendentesPeriodo = periodoAtual
    ? itens.filter((i) => !checks.get(i.habitoId) && (i.periodo === periodoAtual || (i.periodo === "livre" && periodoAtual !== "manha"))).length
    : 0;
  useEffect(() => {
    if (!periodoAtual || !("setAppBadge" in navigator)) return;
    (pendentesPeriodo > 0 ? navigator.setAppBadge(pendentesPeriodo) : navigator.clearAppBadge()).catch(() => {});
  }, [periodoAtual, pendentesPeriodo]);

  const tarefasPendentes = tarefas.filter((t) => !t.concluidaEm)
    .sort((a, b) => b.prioridade - a.prioridade || (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  const tarefasFeitas = tarefas.length - tarefasPendentes.length;

  const feitos = itens.filter((i) => ["completo", "minimo"].includes(checks.get(i.habitoId) ?? "")).length;
  const registrados = itens.filter((i) => checks.get(i.habitoId)).length;

  const prazos = prazosDoHoje(ctx.eventos, dia, data);

  // Blocos do dia: cada cadeia na ordem do dia e, por último, os flexíveis.
  const grupos: Grupo[] = [
    ...dia.cadeias.map((c) => ({
      chave: c.id, nome: c.nome, cor: corDaCadeia(c), cadeia: c,
      janela: c.janelaInicio && c.janelaFim ? `${horaCurta(c.janelaInicio)}–${horaCurta(c.janelaFim)}` : null,
      itens: itens.filter((i) => i.cadeiaId === c.id),
    })),
    ...(dia.flexiveis.length ? [{ chave: "flexiveis", nome: "Flexíveis", cor: COR_FLEXIVEL, cadeia: null, janela: null, itens: itens.filter((i) => !i.cadeiaId) }] : []),
  ];
  const pendentesDe = (g: Grupo) => g.itens.filter((i) => !checks.get(i.habitoId));
  const passou = (g: Grupo) => !!g.cadeia && jaPassou(g.cadeia, hora);

  // O bloco da vez: a primeira cadeia cuja janela não terminou; depois os flexíveis; por fim o que ficou para trás.
  const daVez = blocoDaVez(dia, (id) => checks.get(id), hora);
  const foco = !daVez ? null : grupos.find((g) => (daVez.tipo === "cadeia" ? g.cadeia?.id === daVez.cadeiaId : !g.cadeia)) ?? null;
  const pendentesFoco = foco ? pendentesDe(foco) : [];
  const rotuloFoco = !foco ? null
    : futuro ? { titulo: "Neste dia", detalhe: foco.cadeia ? `${foco.nome}${foco.cadeia.janelaInicio ? `, a partir das ${horaCurta(foco.cadeia.janelaInicio)}` : ""}` : "Flexíveis, sem horário", agora: false }
    : relacao === "passado" ? { titulo: "Ficou pendente", detalhe: foco.nome, agora: false }
    : passou(foco) ? { titulo: "Ficou pendente", detalhe: `${foco.nome}, a janela terminou às ${horaCurta(foco.cadeia!.janelaFim!)}`, agora: false }
    : foco.cadeia && antesDaJanela(foco.cadeia, hora) ? { titulo: "A seguir", detalhe: `${foco.nome}, às ${horaCurta(foco.cadeia.janelaInicio!)}`, agora: false }
    : { titulo: "Agora", detalhe: foco.cadeia ? `${foco.nome}${foco.cadeia.janelaFim ? `, até ${horaCurta(foco.cadeia.janelaFim)}` : ""}` : "Flexíveis, sem horário", agora: true };
  // Os outros blocos com algo pendente: os que ainda vêm, os flexíveis e, no fim, os que ficaram para trás.
  const ordemGrupo = (g: Grupo) => (passou(g) ? 2 : g.cadeia ? 0 : 1);
  const outros = grupos.filter((g) => g !== foco && pendentesDe(g).length).sort((a, b) => ordemGrupo(a) - ordemGrupo(b));
  const itensRegistrados = itens.filter((i) => checks.get(i.habitoId));
  const contagem = (s: StatusCheck[]) => itensRegistrados.filter((i) => s.includes(checks.get(i.habitoId)!)).length;
  const resumoRegistrados = [
    [contagem(["completo"]), "feito", "feitos"], [contagem(["minimo"]), "mínimo", "mínimos"], [contagem(["nao_feito", "nao_se_aplica"]), "pulado", "pulados"],
  ].filter(([n]) => n).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(", ");

  const agenda = [
    ...dia.aulas.map((a) => ({ chave: `a-${a.id}`, hora: horaCurta(a.inicio), titulo: a.disciplina, detalhe: `até ${horaCurta(a.fim)}${a.sala ? `, ${a.sala}` : ""}`, cor: corDisciplina(a.cor), icone: "aula" as const })),
    ...dia.compromissos.map((e) => ({
      chave: `c-${e.id}`, hora: e.inicio ? horaCurta(e.inicio) : "Dia", titulo: e.titulo,
      detalhe: [e.inicio && !e.fim ? "sem horário de término" : e.fim ? `até ${horaCurta(e.fim)}` : "", e.local ?? ""].filter(Boolean).join(", "), cor: null, icone: e.local ? "local" as const : null,
    })),
  ].sort((a, b) => a.hora.localeCompare(b.hora, "pt-BR", { numeric: true }));

  const linhaHabito = (i: ItemDoDia, extra: { mostrarGrupo?: boolean } = {}) => (
    <LinhaHabito key={i.habitoId} item={i} status={checks.get(i.habitoId) ?? null} {...extra} somenteLeitura={futuro}
      sequencia={futuro ? 0 : sequencias.get(i.habitoId) ?? 0}
      focoSemana={!!focoSemana && focoSemana.habitoId === i.habitoId && focoSemana.semana === segundaDaSemana(data)}
      nota={notas.get(i.habitoId) ?? null} onAnotar={() => setAnotando(i)} onFoco={() => iniciarFocoDe(i)}
      destacado={movido === i.habitoId || (!!periodoDestacado && !checks.get(i.habitoId) && (i.periodo === periodoDestacado || (i.periodo === "livre" && periodoDestacado !== "manha")))}
      onMarcar={(s) => marcar(i, s)} />
  );
  function iniciarFocoDe(i: ItemDoDia) {
    if (cronometro && !confirm("Já existe um cronômetro ativo. Substituir?")) return;
    const min = minutosDeFoco(i.minimo);
    iniciarFoco({ habitoId: i.habitoId, cadeiaId: i.cadeiaId, nome: i.nome, data, minutos: min });
    toast(`Foco de ${min} min em ${i.nome}`, { description: "O cronômetro fica no canto da tela, mesmo se você trocar de página." });
  }
  const linhaTarefa = (t: Tarefa) => (
    <LinhaTarefa key={t.id} tarefa={t} data={data} destacado={movido === t.id}
      onConcluir={(f) => concluir(t, f)} onEditar={() => setEdTarefa(t)}
      onAdiar={() => adiar(t)} onPararRepeticao={() => pararRepeticao(t)}
      onExcluir={() => confirm(`Excluir a tarefa "${t.titulo}"?`) && excluir(t)} />
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-dvh flex-col">
      {simulada && (
        <p className="border-b bg-accent px-4 py-1.5 text-xs text-muted-foreground md:px-8">
          Visualizando {diaMes(data)} em modo de desenvolvimento. Registros feitos aqui ficam gravados nesse dia.
        </p>
      )}
      <header className="px-4 pt-4 pb-3 md:px-8 md:pt-8 md:pb-5">
        <div className="flex items-center justify-between gap-2">
          <nav aria-label="Trocar de dia" className="-ml-2 flex min-w-0 items-center">
            <Link href={urlDia(somarDias(data, -1))} aria-label="Dia anterior" title="Dia anterior (←)" scroll={false}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:size-9">
              <ChevronLeft className="size-5" />
            </Link>
            {/* Tocar na data abre o calendário para pular direto a um dia. */}
            <label className="relative min-w-0 cursor-pointer rounded-md px-1 hover:bg-accent/50">
              <h1 aria-label={dataPorExtenso(data)} className="truncate text-lg font-semibold tracking-tight sm:text-xl md:text-[1.75rem]">
                <span aria-hidden className="sm:hidden">{dataCurta(data)}</span>
                <span aria-hidden className="max-sm:hidden">{dataPorExtenso(data)}</span>
              </h1>
              <input type="date" aria-label="Escolher dia" value={data} min={limites.min} max={limites.max}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* sem showPicker: o toque já abre o seletor */ } }}
                onChange={(e) => e.target.value && router.push(urlDia(e.target.value))}
                className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
            <Link href={urlDia(somarDias(data, 1))} aria-label="Próximo dia" title="Próximo dia (→)" scroll={false}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:size-9">
              <ChevronRight className="size-5" />
            </Link>
            {relacao !== "hoje" && (
              <Link href={urlDia(hoje)} aria-label="Voltar para hoje" className="ml-1 shrink-0 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">Hoje</Link>
            )}
          </nav>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <Button size="sm" variant="outline" onClick={() => setEdTarefa("nova")} className="max-sm:size-9 max-sm:px-0"><Plus className="size-4" /><span className="sr-only sm:not-sr-only">Tarefa</span></Button>
            <Link href="/semana" aria-label="Planejar a semana" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"><CalendarRange className="size-5" /></Link>
            <Link href="/ajustes" aria-label="Ajustes" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"><Settings className="size-5" /></Link>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {relacao !== "hoje" && (
            <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", futuro ? "bg-ring/15 text-ring" : "bg-secondary text-foreground")}>
              {futuro && <Eye className="size-3.5" aria-hidden />}
              {distancia(hoje, data)}{futuro ? " · hábitos só para ver" : " · dá para corrigir os registros"}
            </span>
          )}
          {!online && (
            <span className="flex items-center gap-1.5 rounded-md bg-aviso/15 px-2 py-0.5 text-xs font-medium text-aviso">
              <CloudOff className="size-3.5" aria-hidden /> Sem conexão
            </span>
          )}
          {naFila > 0 && <span className="numeros text-xs text-aviso">{naFila} {naFila === 1 ? "registro aguardando envio" : "registros aguardando envio"}</span>}
          {dia.motivoSemAula && <span className="rounded-md border px-2 py-0.5 text-xs font-medium text-foreground">{dia.motivoSemAula}</span>}
          <AcoesAula dia={dia} ctx={ctx} hoje={hoje} futuro={futuro} faltas={faltas} />
          {itens.length > 0 && (
            <span className="flex items-center gap-2.5">
              <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-feito transition-[width] duration-500"
                  style={{ width: `${(feitos / itens.length) * 100}%` }} />
              </span>
              <span className="numeros">{feitos} de {itens.length} hábitos{registrados > feitos && `, ${registrados - feitos} ${registrados - feitos === 1 ? "pulado" : "pulados"}`}</span>
            </span>
          )}
          {tarefas.length > 0 && <span className="numeros">{tarefasFeitas} de {tarefas.length} {tarefas.length === 1 ? "tarefa" : "tarefas"}</span>}
        </div>
      </header>

      {lembreteMes && (
        <Link href={lembreteMes.href} className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-feito/30 bg-feito/[0.07] px-3.5 py-2.5 text-sm hover:border-feito/50 md:mx-8 md:mb-5">
          <Target className="size-4 shrink-0 text-feito" aria-hidden />
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{lembreteMes.texto}</span>
            <span className="text-muted-foreground max-sm:hidden"> · {lembreteMes.detalhe}</span></span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      )}

      {(dia.diaSemana === 6 || dia.diaSemana === 0) && (
        <Link href="/semana" className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-ring/30 bg-ring/[0.07] px-3.5 py-2.5 text-sm hover:border-ring/50 md:mx-8 md:mb-5">
          <CalendarRange className="size-4 shrink-0 text-ring" aria-hidden />
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">Planejar a semana de {diaMes(semanaParaPlanejar(data).de)}</span>
            <span className="text-muted-foreground max-sm:hidden"> · revisão, aulas, provas, tarefas e foco</span></span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      )}

      <div className="grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-3 px-4 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] md:items-start md:gap-6 md:px-8">
        <div className="space-y-3">
          {itens.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Nenhum hábito para {relacao === "hoje" ? "hoje" : "este dia"}. Crie um em <Link href="/habitos" className="underline underline-offset-2">Hábitos</Link> ou use as tarefas para o que for avulso.
            </p>
          ) : foco && rotuloFoco ? (
            <section aria-label={`${rotuloFoco.titulo}: ${foco.nome}`} data-grupo={foco.nome}>
              <p className="mb-2 flex items-center gap-2 px-0.5 text-sm">
                {rotuloFoco.agora && (
                  <span className="relative flex size-2" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: foco.cor }} />
                    <span className="relative inline-flex size-2 rounded-full" style={{ background: foco.cor }} />
                  </span>
                )}
                <span className={cn("font-semibold", rotuloFoco.titulo === "Ficou pendente" && "text-aviso")}>{rotuloFoco.titulo}</span>
                <span className="min-w-0 truncate text-muted-foreground">{rotuloFoco.detalhe}</span>
                <span className="numeros ml-auto shrink-0 text-xs text-muted-foreground" title="registrados neste bloco">
                  {foco.itens.length - pendentesFoco.length}/{foco.itens.length}
                </span>
              </p>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={pendentesFoco[0].habitoId}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
                  <CartaoAgora item={pendentesFoco[0]} status={null} somenteLeitura={futuro}
                    sequencia={futuro ? 0 : sequencias.get(pendentesFoco[0].habitoId) ?? 0}
                    focoSemana={!!focoSemana && focoSemana.habitoId === pendentesFoco[0].habitoId && focoSemana.semana === segundaDaSemana(data)}
                    nota={notas.get(pendentesFoco[0].habitoId) ?? null} onAnotar={() => setAnotando(pendentesFoco[0])}
                    onFoco={() => iniciarFocoDe(pendentesFoco[0])}
                    destacado={!!periodoDestacado && (foco.cadeia?.periodo === periodoDestacado || (!foco.cadeia && periodoDestacado !== "manha"))}
                    onMarcar={(s) => marcar(pendentesFoco[0], s)} />
                </motion.div>
              </AnimatePresence>
              {pendentesFoco.length > 1 && (
                <div className="mt-2 rounded-xl border bg-superficie p-1.5">
                  <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">{foco.cadeia ? "Depois, nesta cadeia" : "Também sem horário"}</p>
                  {pendentesFoco.slice(1).map((i) => linhaHabito(i))}
                </div>
              )}
            </section>
          ) : (
            <section aria-label="Dia fechado" className="flex items-start gap-3 rounded-xl border border-feito/30 bg-feito/[0.07] px-4 py-4">
              <PartyPopper className="mt-0.5 size-5 shrink-0 text-feito" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold">Hábitos do dia registrados</p>
                <p className="text-muted-foreground">{resumoRegistrados}.{tarefasPendentes.length > 0 && ` Ainda ${tarefasPendentes.length === 1 ? "falta 1 tarefa" : `faltam ${tarefasPendentes.length} tarefas`}.`}</p>
              </div>
            </section>
          )}

          {outros.map((g) => {
            const pend = pendentesDe(g);
            const aviso = g.itens.find((i) => i.aviso && !checks.get(i.habitoId))?.aviso;
            return (
              <Secao key={g.chave} chave={g.chave} titulo={g.nome} cor={g.cor} grupo aberto={abertos.has(g.chave)} onAlternar={() => alternar(g.chave)}
                contagem={`${g.itens.length - pend.length}/${g.itens.length}`}
                resumo={<>
                  {passou(g) ? <span className="text-aviso">janela terminou · </span> : g.janela && <span className="numeros">{g.janela} · </span>}
                  {pend.map((i) => i.nome).join(", ")}
                </>}
                alerta={aviso ? `Colide com ${aviso}` : null}>
                {aviso && (
                  <p className="mx-1 mb-1 flex items-center gap-1.5 rounded-md bg-aviso/10 px-2.5 py-1.5 text-xs text-aviso">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> Colide com {aviso}
                  </p>
                )}
                {pend.map((i) => linhaHabito(i))}
              </Secao>
            );
          })}

          {itensRegistrados.length > 0 && (
            <Secao chave="registrados" titulo="Registrados hoje" cor="var(--feito)" aberto={abertos.has("registrados")} onAlternar={() => alternar("registrados")}
              contagem={String(itensRegistrados.length)} resumo={resumoRegistrados}>
              {itensRegistrados.map((i) => linhaHabito(i, { mostrarGrupo: true }))}
            </Secao>
          )}
        </div>

        <aside className="space-y-3 md:sticky md:top-6" aria-label="Tarefas e agenda">
          <Secao chave="tarefas" titulo="Tarefas" cor="var(--foreground)" fixoNoPC aberto={abertos.has("tarefas")} onAlternar={() => alternar("tarefas")}
            contagem={tarefas.length ? `${tarefasFeitas}/${tarefas.length}` : ""}
            resumo={tarefasPendentes[0]?.titulo ?? (tarefas.length ? "Todas concluídas" : "Nenhuma para hoje")}>
            <form className="px-1 pb-1" onSubmit={(e) => {
              e.preventDefault();
              const titulo = novaTarefa.trim();
              if (!titulo) return;
              setNovaTarefa("");
              criarTarefa({ titulo, data, hora: null, notas: null, prioridade: 0 });
            }}>
              <Input aria-label="Nova tarefa" placeholder="Adicionar tarefa e Enter…" value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} className="h-9" />
            </form>
            {tarefasPendentes.map(linhaTarefa)}
            {tarefasFeitas > 0 && tarefas.filter((t) => t.concluidaEm).map(linhaTarefa)}
          </Secao>

          {(agenda.length > 0 || prazos.length > 0) && (
            <Secao chave="agenda" titulo="Agenda e prazos" cor="var(--tag-tarde)" fixoNoPC aberto={abertos.has("agenda")} onAlternar={() => alternar("agenda")}
              contagem={String(agenda.length + prazos.length)}
              resumo={agenda[0] ? `${agenda[0].hora} ${agenda[0].titulo}` : prazos[0].titulo.replace(/^Prazo: /, "")}>
              <ul className="space-y-0.5">
                {agenda.map((a) => (
                  <li key={a.chave} className="flex items-start gap-3 rounded-lg px-2 py-2" style={a.cor ? { boxShadow: `inset 2px 0 0 ${a.cor}` } : undefined}>
                    <span className="numeros w-10 shrink-0 pt-px text-sm font-semibold">{a.hora}</span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium">{a.titulo}</span>
                      {a.detalhe && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {a.icone === "aula" && <GraduationCap className="size-3 shrink-0" aria-hidden />}
                          {a.icone === "local" && <MapPin className="size-3 shrink-0" aria-hidden />}
                          {a.detalhe}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                {prazos.map((p) => (
                  <li key={`${p.eventoId}-${p.data}-${p.tipo}`} className="flex items-start gap-3 rounded-lg px-2 py-2">
                    <span className="grid w-10 shrink-0 place-items-center pt-0.5"><CalendarClock className="size-4 text-muted-foreground" aria-hidden /></span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium">{p.titulo.replace(/^Prazo: /, "")}</span>
                      <span className={cn("numeros text-xs", p.faltam === 0 && p.tipo !== "lembrete" ? "text-aviso" : "text-muted-foreground")}>
                        {p.tipo === "lembrete" ? `Lembrete, prazo em ${diaMes(p.dataPrazo)}` : p.faltam === 0 ? "Vence hoje" : `Prazo ${diaMes(p.data)}, em ${p.faltam} dias`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/agenda" className="mt-1 flex items-center justify-end gap-1 px-2 pb-1 text-xs text-muted-foreground hover:text-foreground">
                Ver agenda <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </Secao>
          )}

          {metas.length > 0 && (() => {
            // Metas de hábito contam os dias com feito/mínimo: histórico + o que já foi marcado neste dia.
            const checksMes = [...historicoAnterior, ...[...checks].map(([habitoId, status]) => ({ habitoId, status, data }))];
            const lista = metas.map((m) => ({ m, p: progressoMeta(m, checksMes, data) }));
            const feitas = lista.filter((x) => x.p.situacao === "concluida").length;
            return (
              <Secao chave="metas" titulo="Metas do mês" cor="var(--feito)" fixoNoPC aberto={abertos.has("metas")} onAlternar={() => alternar("metas")}
                contagem={`${feitas}/${metas.length}`} resumo={`${lista.filter((x) => x.p.situacao === "atras").length} atrás do ritmo`}>
                <ul className="space-y-2 px-2 pt-1">
                  {lista.slice(0, 5).map(({ m, p }) => (
                    <li key={m.id} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate", p.situacao === "concluida" && "text-muted-foreground line-through decoration-muted-foreground/40")}>{m.titulo}</span>
                        <span className="numeros shrink-0 text-xs text-muted-foreground">
                          {m.tipo === "marco" ? (p.situacao === "concluida" ? "feito" : "a fazer") : p.alvo !== null ? `${p.atual}/${p.alvo}` : p.atual}
                        </span>
                      </div>
                      {p.pct !== null && m.tipo !== "marco" && (
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                          <span className={cn("block h-full rounded-full", p.situacao === "atras" ? "bg-aviso" : "bg-feito")} style={{ width: `${p.pct * 100}%` }} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <Link href="/mes" className="mt-1 flex items-center justify-end gap-1 px-2 pb-1 text-xs text-muted-foreground hover:text-foreground">
                  Ver metas <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </Secao>
            );
          })()}
        </aside>
      </div>

      {edTarefa && (
        <DialogoTarefa key={edTarefa === "nova" ? "nova" : edTarefa.id} tarefa={edTarefa === "nova" ? null : edTarefa} dataInicial={data}
          onFechar={() => setEdTarefa(null)}
          onSalvar={async (r) => {
            if (r.tipo === "recorrencia") {
              await salvarRecorrencia(sb, r.dados, r.id);
              recarregarTarefas();
            } else if (edTarefa === "nova") {
              await criarTarefa(r.dados, "Tarefa adicionada.");
            } else {
              const id = edTarefa.id;
              await acaoTarefa({ acao: "atualizar", id, campos: { titulo: r.dados.titulo.trim(), data: r.dados.data, hora: r.dados.hora, notas: r.dados.notas, prioridade: r.dados.prioridade }, em: agora() },
                (l) => l.map((x) => (x.id === id ? { ...x, ...r.dados } : x)).filter((x) => x.data === data || (x.data < data && !x.concluidaEm)), "Tarefa salva.");
            }
          }} />
      )}

      {anotando && (
        <DialogoNota key={anotando.habitoId} item={anotando} inicial={notas.get(anotando.habitoId) ?? ""}
          onFechar={() => setAnotando(null)} onSalvar={(t) => { salvarNota(anotando, t); setAnotando(null); }} />
      )}
    </div>
    </MotionConfig>
  );
}

/**
 * Bloco recolhível: o cabeçalho resume o conteúdo (contagem e o que falta) e abre com um toque.
 * fixoNoPC: no computador fica sempre aberto (coluna lateral com espaço de sobra).
 */
function Secao({ chave, titulo, cor, contagem, resumo, alerta, aberto, onAlternar, fixoNoPC, grupo, children }: {
  chave: string; titulo: string; cor: string; contagem: string; resumo: React.ReactNode; alerta?: string | null;
  aberto: boolean; onAlternar: () => void; fixoNoPC?: boolean; grupo?: boolean; children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} data-grupo={grupo ? titulo : undefined} className="overflow-hidden rounded-xl border bg-superficie">
      <button type="button" data-alternar aria-expanded={aberto} aria-controls={`bloco-${chave}`} onClick={onAlternar}
        className={cn("flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/40", fixoNoPC && "md:cursor-default md:pb-2 md:hover:bg-transparent")}>
        <span className="size-2 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{titulo}</span>
          <span className={cn("block truncate text-xs text-muted-foreground", fixoNoPC && "md:hidden")}>{resumo}</span>
        </span>
        {alerta && <AlertTriangle className="size-4 shrink-0 text-aviso" aria-label={alerta} />}
        {contagem && <span className="numeros shrink-0 text-sm text-muted-foreground">{contagem}</span>}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", aberto && "rotate-180", fixoNoPC && "md:hidden")} aria-hidden />
      </button>
      <div id={`bloco-${chave}`} className={cn("px-1.5 pb-1.5", aberto ? "block animate-in fade-in-0 slide-in-from-top-1 duration-200" : "hidden", fixoNoPC && "md:block md:animate-none")}>
        {children}
      </div>
    </section>
  );
}

function DialogoNota({ item, inicial, onFechar, onSalvar }: { item: ItemDoDia; inicial: string; onFechar: () => void; onSalvar: (t: string) => void }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nota: {item.nome}</DialogTitle>
          <DialogDescription>Uma linha sobre como foi. Aparece no histórico do hábito.</DialogDescription>
        </DialogHeader>
        <form id="form-nota" onSubmit={(e) => { e.preventDefault(); onSalvar(texto); }}>
          <Textarea aria-label="Nota" rows={3} maxLength={280} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
            placeholder="Ex.: li no trem, capítulo 3. Fiz só o mínimo por causa da prova." />
        </form>
        <DialogFooter>
          <Button type="submit" form="form-nota">Salvar nota</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
