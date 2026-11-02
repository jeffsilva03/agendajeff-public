"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, CalendarDays, FolderKanban, Lightbulb, CalendarPlus, CalendarRange, ChartNoAxesColumn, Check, GraduationCap, LayoutGrid, Link2, ListTodo, Plus, Repeat, Search, ScanSearch, Send, Settings, Target, Timer } from "lucide-react";
import { agoraSP, resolverDia, type StatusCheck } from "@motor";
import { carregarContexto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { ehErroDeRede, enfileirar, gravarCheck } from "@/lib/fila-offline";
import { iniciarFoco, minutosDeFoco } from "@/lib/cronometro";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { HalfCircle } from "@/components/hoje/icones";

interface Pendente { habitoId: string; cadeiaId: string | null; nome: string; grupo: string; minimo: string | null }

export const EVENTO_ABRIR_PALETA = "cadeia:paleta";

/** Ctrl+K (ou ⌘K): navegar, criar e marcar hábitos de hoje sem tirar a mão do teclado. */
export function PaletaComandos() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [pendentes, setPendentes] = useState<Pendente[] | null>(null);
  const [data] = useState(() => agoraSP().data);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setBusca(""); setAberta((a) => !a); }
    };
    const abrir = () => setAberta(true);
    // Captura: funciona mesmo com o foco em elementos que bloqueiam a propagação (ex.: botões do cartão).
    window.addEventListener("keydown", tecla, true);
    window.addEventListener(EVENTO_ABRIR_PALETA, abrir);
    return () => { window.removeEventListener("keydown", tecla, true); window.removeEventListener(EVENTO_ABRIR_PALETA, abrir); };
  }, []);

  const carregar = useCallback(async () => {
    const sb = criarClienteNavegador();
    try {
      const ctx = await carregarContexto(sb);
      const { data: feitos } = await sb.from("checks").select("habit_id").eq("data_local", data);
      const marcados = new Set((feitos ?? []).map((c) => c.habit_id));
      const dia = resolverDia(data, ctx);
      const nome = new Map(ctx.habitos.map((h) => [h.id, h.nome]));
      setPendentes([
        ...dia.cadeias.flatMap((c) => c.passos.filter((p) => !marcados.has(p.habitoId)).map((p) => ({ habitoId: p.habitoId, cadeiaId: c.id, nome: nome.get(p.habitoId) ?? "", grupo: c.nome, minimo: p.minimo }))),
        ...dia.flexiveis.filter((h) => !marcados.has(h.id)).map((h) => ({ habitoId: h.id, cadeiaId: null, nome: h.nome, grupo: "Flexível", minimo: null })),
      ]);
    } catch {
      setPendentes([]);
    }
  }, [data]);

  useEffect(() => {
    if (!aberta) return;
    const t = setTimeout(() => { setPendentes(null); carregar(); }, 0);
    return () => clearTimeout(t);
  }, [aberta, carregar]);

  const fechar = () => { setAberta(false); setBusca(""); };
  const ir = (rota: string) => { fechar(); router.push(rota); };

  async function marcar(p: Pendente, status: StatusCheck) {
    fechar();
    const sb = criarClienteNavegador();
    const acao = { habitoId: p.habitoId, cadeiaId: p.cadeiaId, data, status, em: new Date().toISOString() };
    const { error } = navigator.onLine ? await gravarCheck(sb, acao) : { error: { message: "offline" } };
    if (error && ehErroDeRede(error)) enfileirar(acao);
    else if (error) { toast.error("Não foi possível marcar."); return; }
    toast.success(`${p.nome}: ${status === "completo" ? "feito" : "mínimo"}.`);
    router.refresh();
  }

  return (
    <CommandDialog open={aberta} onOpenChange={(o) => { setAberta(o); if (!o) setBusca(""); }} title="Comandos" description="Navegar, criar e marcar hábitos de hoje">
      {/* Nesta versão do shadcn, o CommandDialog não inclui o <Command> do cmdk. */}
      <Command>
      <CommandInput placeholder="O que você quer fazer?" value={busca} onValueChange={setBusca} />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {pendentes === null && <p className="px-3 py-2 text-xs text-muted-foreground">Carregando hábitos de hoje…</p>}
        {pendentes && pendentes.length > 0 && (
          <CommandGroup heading="Marcar hoje">
            {pendentes.map((p) => (
              <CommandItem key={`f-${p.habitoId}`} value={`feito ${p.nome} ${p.grupo}`} onSelect={() => marcar(p, "completo")}>
                <Check className="text-feito" /> {p.nome} <span className="text-muted-foreground">feito</span>
                <CommandShortcut>{p.grupo}</CommandShortcut>
              </CommandItem>
            ))}
            {pendentes.filter((p) => p.minimo).map((p) => (
              <CommandItem key={`m-${p.habitoId}`} value={`minimo ${p.nome} ${p.grupo}`} onSelect={() => marcar(p, "minimo")}>
                <HalfCircle className="text-minimo" /> {p.nome} <span className="text-muted-foreground">mínimo ({p.minimo})</span>
              </CommandItem>
            ))}
            {pendentes.map((p) => (
              <CommandItem key={`c-${p.habitoId}`} value={`foco ${p.nome}`} onSelect={() => {
                fechar();
                const min = minutosDeFoco(p.minimo);
                iniciarFoco({ habitoId: p.habitoId, cadeiaId: p.cadeiaId, nome: p.nome, data, minutos: min });
                toast(`Foco de ${min} min em ${p.nome}`);
              }}>
                <Timer /> Foco em {p.nome}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Criar">
          <CommandItem value="novo hábito criar" onSelect={() => ir("/habitos?novo=habito")}><Plus /> Novo hábito</CommandItem>
          <CommandItem value="nova cadeia criar" onSelect={() => ir("/habitos?novo=cadeia")}><Link2 /> Nova cadeia</CommandItem>
          <CommandItem value="novo evento agenda compromisso prazo sem aula" onSelect={() => ir("/agenda?novo=1")}><CalendarPlus /> Novo evento na agenda</CommandItem>
          <CommandItem value="novo freela projeto cliente" onSelect={() => ir("/freelas?novo=1")}><Briefcase /> Novo freela</CommandItem>
          <CommandItem value="nova prova trabalho atividade avaliação faculdade" onSelect={() => ir("/faculdade?novo=avaliacao")}><GraduationCap /> Nova prova, trabalho ou atividade</CommandItem>
          <CommandItem value="nova tarefa do dia" onSelect={() => ir("/hoje?novo=tarefa")}><ListTodo /> Nova tarefa</CommandItem>
          <CommandItem value="nova candidatura vaga estágio emprego" onSelect={() => ir("/candidaturas?novo=1")}><Send /> Registrar candidatura</CommandItem>
          <CommandItem value="novo projeto ideia de projeto" onSelect={() => ir("/projetos?novo=1")}><Lightbulb /> Novo projeto</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ir para">
          <CommandItem onSelect={() => ir("/hoje")}><LayoutGrid /> Hoje</CommandItem>
          <CommandItem onSelect={() => ir("/habitos")}><Repeat /> Hábitos</CommandItem>
          <CommandItem onSelect={() => ir("/agenda")}><CalendarDays /> Agenda</CommandItem>
          <CommandItem onSelect={() => ir("/faculdade")}><GraduationCap /> Faculdade</CommandItem>
          <CommandItem value="planejar a semana sábado" onSelect={() => ir("/semana")}><CalendarRange /> Planejar a semana</CommandItem>
          <CommandItem onSelect={() => ir("/candidaturas")}><Send /> Candidaturas</CommandItem>
          <CommandItem onSelect={() => ir("/freelas")}><Briefcase /> Freelas</CommandItem>
          <CommandItem value="projetos ideias features" onSelect={() => ir("/projetos")}><FolderKanban /> Projetos</CommandItem>
          <CommandItem onSelect={() => ir("/insights")}><ChartNoAxesColumn /> Insights</CommandItem>
          <CommandItem onSelect={() => ir("/insights#revisao")}><ChartNoAxesColumn /> Revisão semanal</CommandItem>
          <CommandItem value="metas do mês objetivos" onSelect={() => ir("/mes")}><Target /> Metas do mês</CommandItem>
          <CommandItem value="raio-x da vida áreas valores prioridades" onSelect={() => ir("/mes?aba=raiox")}><ScanSearch /> Raio-X da vida</CommandItem>
          <CommandItem value="revisão mensal mês reflexão" onSelect={() => ir("/mes?aba=revisao")}><Target /> Revisão mensal</CommandItem>
          <CommandItem onSelect={() => ir("/ajustes")}><Settings /> Ajustes</CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Botão na barra lateral que abre a paleta. */
export function BotaoPaleta() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))}
      className="mb-4 flex h-9 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground hover:text-foreground">
      <Search className="size-4" aria-hidden /> Buscar e agir
      <kbd className="ml-auto rounded border bg-secondary px-1.5 text-[11px]">Ctrl K</kbd>
    </button>
  );
}
